#!/usr/bin/env node

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const {
  MANAS_PROGRAM_META,
  buildPublicVideoUrl,
  closeVideoPool,
  ensureVideoCatalogSchema,
  getSubjectTitle,
  replaceVideoLessonsForPrograms,
} = require('../lib/videoCatalog');

const DEFAULT_LIBRARY_ROOT = path.resolve(__dirname, '../../Материалы Видеоуроки/ProManas 2025-2026');

const SUBJECT_DIRECTORY_TO_CODE = {
  'english': 'english',
  'биология': 'biology',
  'география': 'geography',
  'история': 'history',
  'кыргыз адабият': 'kyrgyz_literature',
  'кыргыз адабияты': 'kyrgyz_literature',
  'кыргыз тили': 'kyrgyz_language',
  'математика': 'math',
  'физика': 'physics',
  'химия': 'chemistry',
};

const MANAS_PROGRAMS_BY_SUBJECT = {
  english: ['manas_all_subjects', 'manas_humanities', 'manas_exact_sciences'],
  biology: ['manas_all_subjects', 'manas_exact_sciences'],
  geography: ['manas_all_subjects', 'manas_humanities', 'manas_exact_sciences'],
  history: ['manas_all_subjects', 'manas_humanities'],
  kyrgyz_literature: ['manas_all_subjects', 'manas_humanities'],
  kyrgyz_language: ['manas_all_subjects', 'manas_humanities'],
  math: ['manas_all_subjects', 'manas_exact_sciences'],
  physics: ['manas_all_subjects', 'manas_exact_sciences'],
  chemistry: ['manas_all_subjects', 'manas_exact_sciences'],
};

function parseArgs(argv) {
  const options = {};
  for (const rawArg of argv) {
    if (!rawArg.startsWith('--')) continue;
    const [key, ...rest] = rawArg.slice(2).split('=');
    options[key] = rest.join('=') || 'true';
  }
  return options;
}

function normalizeDirectoryName(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function isVideoFile(entryName) {
  return /\.(mp4|mkv|mov|m4v)$/i.test(entryName);
}

function toLessonTitle(filename) {
  const withoutExt = filename.replace(/\.[^.]+$/, '');
  return withoutExt
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLessonNumber(filename) {
  const match = filename.match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

function buildLessonKey(subjectCode, relativePath) {
  const hash = crypto.createHash('sha1').update(relativePath).digest('hex').slice(0, 12);
  return `${subjectCode}_${hash}`;
}

function naturalCompare(a, b) {
  return a.localeCompare(b, 'ru', { numeric: true, sensitivity: 'base' });
}

function scanSubjectFiles(libraryRoot) {
  const subjectEntries = fs.readdirSync(libraryRoot, { withFileTypes: true });
  const rows = [];

  for (const entry of subjectEntries) {
    if (!entry.isDirectory()) continue;

    const subjectCode = SUBJECT_DIRECTORY_TO_CODE[normalizeDirectoryName(entry.name)];
    if (!subjectCode) continue;

    const subjectDir = path.join(libraryRoot, entry.name);
    const files = fs.readdirSync(subjectDir, { withFileTypes: true })
      .filter((child) => child.isFile() && isVideoFile(child.name))
      .map((child) => child.name)
      .sort(naturalCompare);

    files.forEach((filename, index) => {
      const absolutePath = path.join(subjectDir, filename);
      const relativePath = path.relative(libraryRoot, absolutePath);
      const stat = fs.statSync(absolutePath);
      const extension = path.extname(filename).slice(1).toLowerCase();
      const publicUrl = buildPublicVideoUrl(relativePath);
      const canPlayAsMp4 = extension === 'mp4' || extension === 'm4v';
      const hlsUrl = extension === 'm3u8' ? publicUrl : null;
      const mp4Url = canPlayAsMp4 ? publicUrl : null;
      const playbackUrl = hlsUrl || mp4Url;
      const streamType = hlsUrl
        ? 'hls'
        : mp4Url
          ? 'mp4'
          : 'pending';

      rows.push({
        subjectCode,
        subjectTitle: getSubjectTitle(subjectCode),
        lessonKey: buildLessonKey(subjectCode, relativePath),
        lessonNo: extractLessonNumber(filename),
        sortOrder: index + 1,
        lessonTitle: toLessonTitle(filename),
        sourceFilename: filename,
        sourceRelativePath: relativePath,
        sourceExtension: extension,
        sourceSizeBytes: stat.size,
        streamType,
        storageProvider: playbackUrl ? 'cdn' : 'railway_catalog',
        playbackUrl,
        hlsUrl,
        mp4Url,
        posterUrl: null,
        durationSeconds: null,
        isPublished: true,
        meta: {
          source_path: relativePath,
          source_format: extension,
          requires_transcoding: extension !== 'mp4',
          uploaded_to_cdn: Boolean(publicUrl),
        },
      });
    });
  }

  return rows;
}

function expandLessonsToPrograms(subjectLessons) {
  const rows = [];

  for (const lesson of subjectLessons) {
    const programCodes = MANAS_PROGRAMS_BY_SUBJECT[lesson.subjectCode] || [];

    for (const programCode of programCodes) {
      const programMeta = MANAS_PROGRAM_META[programCode];
      if (!programMeta) continue;

      rows.push({
        ...lesson,
        programCode,
        programTitle: programMeta.title,
        accountType: programMeta.accountType,
        manasTrack: programMeta.manasTrack,
      });
    }
  }

  return rows;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const libraryRoot = path.resolve(args['library-root'] || DEFAULT_LIBRARY_ROOT);

  if (args['connection-string']) {
    process.env.RAILWAY_VIDEO_DATABASE_URL = args['connection-string'];
  }

  if (args['public-base-url']) {
    process.env.VIDEO_PUBLIC_BASE_URL = args['public-base-url'];
  }

  if (!fs.existsSync(libraryRoot)) {
    throw new Error(`Library root not found: ${libraryRoot}`);
  }

  const subjectLessons = scanSubjectFiles(libraryRoot);
  const programLessons = expandLessonsToPrograms(subjectLessons);

  await ensureVideoCatalogSchema();
  await replaceVideoLessonsForPrograms(Object.keys(MANAS_PROGRAM_META), programLessons);

  const groupedBySubject = subjectLessons.reduce((acc, lesson) => {
    acc[lesson.subjectCode] = (acc[lesson.subjectCode] || 0) + 1;
    return acc;
  }, {});

  console.log('Manas video catalog synced.');
  console.log(`Library root: ${libraryRoot}`);
  console.log(`Unique source lessons: ${subjectLessons.length}`);
  console.log(`Program-scoped lesson rows: ${programLessons.length}`);
  console.log('By subject:');

  Object.entries(groupedBySubject)
    .sort(([left], [right]) => naturalCompare(left, right))
    .forEach(([subjectCode, count]) => {
      console.log(` - ${subjectCode}: ${count}`);
    });
}

(async () => {
  try {
    await main();
  } catch (error) {
    console.error('Failed to sync Manas video catalog:', error);
    process.exitCode = 1;
  } finally {
    await closeVideoPool().catch((poolError) => {
      console.error('Failed to close video pool:', poolError);
      process.exitCode = 1;
    });
  }
})();
