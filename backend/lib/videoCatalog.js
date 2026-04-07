const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const { SUBJECTS } = require('./universitySubjects');

const VIDEO_TABLE_NAME = 'uni_video_lessons';

const MANAS_PROGRAM_META = {
  manas_all_subjects: {
    title: 'Манас: Все предметы',
    accountType: 'manas',
    manasTrack: 'all_subjects',
  },
  manas_humanities: {
    title: 'Манас: Гуманитарий',
    accountType: 'manas',
    manasTrack: 'humanities',
  },
  manas_exact_sciences: {
    title: 'Манас: Точные науки',
    accountType: 'manas',
    manasTrack: 'exact_sciences',
  },
};

let videoPool = null;
const INSERT_COLUMNS = [
  'id',
  'program_code',
  'program_title',
  'account_type',
  'manas_track',
  'subject_code',
  'subject_title',
  'lesson_key',
  'lesson_no',
  'sort_order',
  'lesson_title',
  'source_filename',
  'source_relative_path',
  'source_extension',
  'source_size_bytes',
  'stream_type',
  'storage_provider',
  'playback_url',
  'hls_url',
  'mp4_url',
  'poster_url',
  'duration_seconds',
  'is_published',
  'meta',
];

function getVideoDatabaseUrl() {
  return (
    process.env.RAILWAY_VIDEO_DATABASE_URL ||
    process.env.VIDEO_DATABASE_URL ||
    process.env.DATABASE_URL ||
    ''
  ).trim();
}

function shouldUseSsl(connectionString) {
  try {
    const parsed = new URL(connectionString);
    return !['localhost', '127.0.0.1'].includes(parsed.hostname);
  } catch {
    return false;
  }
}

function getVideoPool() {
  const connectionString = getVideoDatabaseUrl();
  if (!connectionString) return null;

  if (!videoPool) {
    videoPool = new Pool({
      connectionString,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : false,
      max: Number(process.env.VIDEO_DB_POOL_MAX || 10),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    videoPool.on('error', (error) => {
      console.error('Railway video pool error:', error);
    });
  }

  return videoPool;
}

async function closeVideoPool() {
  if (!videoPool) return;
  const currentPool = videoPool;
  videoPool = null;
  await currentPool.end();
}

function isVideoDbConfigured() {
  return Boolean(getVideoDatabaseUrl());
}

function getLocalVideoLibraryRoot() {
  const raw = String(process.env.VIDEO_LIBRARY_ROOT || '').trim();
  if (!raw) return null;
  return path.resolve(raw);
}

function isLocalVideoPreviewEnabled() {
  if (process.env.ALLOW_LOCAL_VIDEO_PREVIEW === 'false') {
    return false;
  }

  const root = getLocalVideoLibraryRoot();
  return Boolean(root && fs.existsSync(root));
}

function encodePathForUrl(relativePath) {
  return relativePath
    .split(path.sep)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function buildPublicVideoUrl(relativePath) {
  const baseUrl = String(process.env.VIDEO_PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
  if (!baseUrl) return null;
  return `${baseUrl}/${encodePathForUrl(relativePath)}`;
}

function buildLessonResponse(row) {
  const publicPlaybackUrl = row.hls_url || row.mp4_url || row.playback_url || null;
  const previewEnabled = isLocalVideoPreviewEnabled();

  return {
    id: row.id,
    subjectCode: row.subject_code,
    subjectTitle: row.subject_title,
    lessonNo: row.lesson_no,
    sortOrder: row.sort_order,
    lessonKey: row.lesson_key,
    title: row.lesson_title,
    filename: row.source_filename,
    extension: row.source_extension,
    sizeBytes: Number(row.source_size_bytes || 0),
    streamType: row.stream_type,
    playbackUrl: publicPlaybackUrl,
    hlsUrl: row.hls_url || null,
    mp4Url: row.mp4_url || null,
    posterUrl: row.poster_url || null,
    previewUrl: previewEnabled ? `/api/tests/videos/preview/${encodeURIComponent(row.id)}` : null,
    isPlayable: Boolean(publicPlaybackUrl || previewEnabled),
    isPublished: Boolean(row.is_published),
    storageProvider: row.storage_provider,
    relativePath: row.source_relative_path,
    durationSeconds: row.duration_seconds ? Number(row.duration_seconds) : null,
    meta: row.meta || {},
  };
}

async function ensureVideoCatalogSchema() {
  const pool = getVideoPool();
  if (!pool) return false;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.${VIDEO_TABLE_NAME} (
      id TEXT PRIMARY KEY,
      program_code TEXT NOT NULL,
      program_title TEXT NOT NULL,
      account_type TEXT NOT NULL,
      manas_track TEXT,
      subject_code TEXT NOT NULL,
      subject_title TEXT NOT NULL,
      lesson_key TEXT NOT NULL,
      lesson_no INTEGER,
      sort_order INTEGER NOT NULL,
      lesson_title TEXT NOT NULL,
      source_filename TEXT NOT NULL,
      source_relative_path TEXT NOT NULL,
      source_extension TEXT NOT NULL,
      source_size_bytes BIGINT NOT NULL DEFAULT 0,
      stream_type TEXT NOT NULL DEFAULT 'pending',
      storage_provider TEXT NOT NULL DEFAULT 'railway_catalog',
      playback_url TEXT,
      hls_url TEXT,
      mp4_url TEXT,
      poster_url TEXT,
      duration_seconds INTEGER,
      is_published BOOLEAN NOT NULL DEFAULT true,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
      CONSTRAINT uq_uni_video_lessons_program_subject_key UNIQUE (program_code, subject_code, lesson_key)
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_uni_video_lessons_program_subject_order
    ON public.${VIDEO_TABLE_NAME}(program_code, subject_code, sort_order);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_uni_video_lessons_program_published
    ON public.${VIDEO_TABLE_NAME}(program_code, is_published);
  `);

  return true;
}

async function fetchVideoLessonCounts(programCode) {
  const pool = getVideoPool();
  if (!pool || !programCode) return new Map();

  const result = await pool.query(
    `
      SELECT
        subject_code,
        COUNT(*)::int AS lesson_count,
        COUNT(*) FILTER (
          WHERE is_published = true
            AND (hls_url IS NOT NULL OR mp4_url IS NOT NULL OR playback_url IS NOT NULL)
        )::int AS playable_count
      FROM public.${VIDEO_TABLE_NAME}
      WHERE program_code = $1
        AND is_published = true
      GROUP BY subject_code
    `,
    [programCode],
  );

  const counts = new Map();
  for (const row of result.rows) {
    counts.set(row.subject_code, {
      lessonCount: Number(row.lesson_count || 0),
      playableCount: Number(row.playable_count || 0),
    });
  }

  return counts;
}

async function fetchVideoLessonsForProgram(programCode, subjectCode) {
  const pool = getVideoPool();
  if (!pool || !programCode) {
    return [];
  }

  const params = [programCode];
  let where = 'program_code = $1 AND is_published = true';

  if (subjectCode) {
    params.push(subjectCode);
    where += ` AND subject_code = $${params.length}`;
  }

  const result = await pool.query(
    `
      SELECT *
      FROM public.${VIDEO_TABLE_NAME}
      WHERE ${where}
      ORDER BY subject_title ASC, sort_order ASC, lesson_title ASC
    `,
    params,
  );

  return result.rows.map(buildLessonResponse);
}

async function findVideoLessonForProgram(programCode, lessonId) {
  const pool = getVideoPool();
  if (!pool || !programCode || !lessonId) return null;

  const result = await pool.query(
    `
      SELECT *
      FROM public.${VIDEO_TABLE_NAME}
      WHERE program_code = $1
        AND id = $2
        AND is_published = true
      LIMIT 1
    `,
    [programCode, lessonId],
  );

  return result.rows[0] || null;
}

async function fetchAdminVideoCatalog() {
  const pool = getVideoPool();
  if (!pool) return [];

  const result = await pool.query(
    `
      SELECT *
      FROM public.${VIDEO_TABLE_NAME}
      WHERE is_published = true
      ORDER BY program_title ASC, subject_title ASC, sort_order ASC
    `,
  );

  const programs = new Map();

  for (const row of result.rows) {
    if (!programs.has(row.program_code)) {
      programs.set(row.program_code, {
        programCode: row.program_code,
        programTitle: row.program_title,
        accountType: row.account_type,
        manasTrack: row.manas_track,
        totalLessons: 0,
        playableLessons: 0,
        totalSizeBytes: 0,
        subjects: new Map(),
      });
    }

    const program = programs.get(row.program_code);
    program.totalLessons += 1;
    program.totalSizeBytes += Number(row.source_size_bytes || 0);
    if (row.hls_url || row.mp4_url || row.playback_url) {
      program.playableLessons += 1;
    }

    if (!program.subjects.has(row.subject_code)) {
      program.subjects.set(row.subject_code, {
        subjectCode: row.subject_code,
        subjectTitle: row.subject_title,
        lessonCount: 0,
        playableCount: 0,
        totalSizeBytes: 0,
        lessons: [],
      });
    }

    const subject = program.subjects.get(row.subject_code);
    subject.lessonCount += 1;
    subject.totalSizeBytes += Number(row.source_size_bytes || 0);
    if (row.hls_url || row.mp4_url || row.playback_url) {
      subject.playableCount += 1;
    }
    subject.lessons.push(buildLessonResponse(row));
  }

  return Array.from(programs.values()).map((program) => ({
    ...program,
    subjects: Array.from(program.subjects.values()),
  }));
}

async function replaceVideoLessonsForPrograms(programCodes, lessons) {
  const pool = getVideoPool();
  if (!pool) {
    throw new Error('Railway video database is not configured');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (programCodes.length > 0) {
      await client.query(
        `DELETE FROM public.${VIDEO_TABLE_NAME} WHERE program_code = ANY($1::text[])`,
        [programCodes],
      );
    }

    const chunkSize = 100;
    for (let offset = 0; offset < lessons.length; offset += chunkSize) {
      const chunk = lessons.slice(offset, offset + chunkSize);
      const values = [];
      const placeholders = [];

      for (const lesson of chunk) {
        const rowValues = [
          lesson.id || uuidv4(),
          lesson.programCode,
          lesson.programTitle,
          lesson.accountType,
          lesson.manasTrack,
          lesson.subjectCode,
          lesson.subjectTitle,
          lesson.lessonKey,
          lesson.lessonNo,
          lesson.sortOrder,
          lesson.lessonTitle,
          lesson.sourceFilename,
          lesson.sourceRelativePath,
          lesson.sourceExtension,
          lesson.sourceSizeBytes,
          lesson.streamType || 'pending',
          lesson.storageProvider || 'railway_catalog',
          lesson.playbackUrl || null,
          lesson.hlsUrl || null,
          lesson.mp4Url || null,
          lesson.posterUrl || null,
          lesson.durationSeconds || null,
          lesson.isPublished !== false,
          JSON.stringify(lesson.meta || {}),
        ];

        const startIndex = values.length + 1;
        values.push(...rowValues);
        placeholders.push(`(${rowValues.map((_, index) => `$${startIndex + index}`).join(', ')})`);
      }

      await client.query(
        `
          INSERT INTO public.${VIDEO_TABLE_NAME} (${INSERT_COLUMNS.join(', ')})
          VALUES ${placeholders.join(', ')}
        `,
        values,
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

function resolveAbsoluteVideoPath(relativePath) {
  const root = getLocalVideoLibraryRoot();
  if (!root || !relativePath) return null;

  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(root)) {
    return null;
  }

  return absolutePath;
}

function getProgramMeta(programCode) {
  return MANAS_PROGRAM_META[programCode] || null;
}

function getSubjectTitle(subjectCode) {
  return SUBJECTS[subjectCode]?.titleRu || subjectCode;
}

module.exports = {
  MANAS_PROGRAM_META,
  VIDEO_TABLE_NAME,
  buildPublicVideoUrl,
  closeVideoPool,
  ensureVideoCatalogSchema,
  fetchAdminVideoCatalog,
  fetchVideoLessonCounts,
  fetchVideoLessonsForProgram,
  findVideoLessonForProgram,
  getProgramMeta,
  getSubjectTitle,
  getVideoPool,
  isLocalVideoPreviewEnabled,
  isVideoDbConfigured,
  replaceVideoLessonsForPrograms,
  resolveAbsoluteVideoPath,
};
