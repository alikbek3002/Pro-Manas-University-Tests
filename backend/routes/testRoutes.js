const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const { Readable } = require('stream');
const supabase = require('../lib/supabase');
const {
  hashPassword,
  isStudentTokenExpired,
  signStudentToken,
  verifyStudentToken,
} = require('../lib/studentAuth');
const {
  canonicalizeSubjectCode,
  getQuestionTableBySubjectCode,
} = require('../lib/universitySubjects');
const {
  fetchVideoLessonCounts,
  fetchVideoLessonsForProgram,
  findVideoLessonForProgram,
  resolveAbsoluteVideoPath,
} = require('../lib/videoCatalog');
const {
  getPresignedVideoUrl,
  isPresignedEnabled,
} = require('../lib/videoPresigner');

const router = express.Router();

const QUESTIONS_PER_TEST = 30;
const MAX_PARTS_UPPER_BOUND = 100;
const TOKEN_REFRESH_THRESHOLD_SECONDS = 300;
const VIDEO_GRANT_TTL_SECONDS = Math.max(60, Number(process.env.VIDEO_GRANT_TTL_SECONDS) || 1800);
const VIDEO_SEGMENT_GRANT_TTL_SECONDS = Math.max(30, Number(process.env.VIDEO_SEGMENT_GRANT_TTL_SECONDS) || 300);
const VIDEO_GRANT_BIND_IP = String(process.env.VIDEO_GRANT_BIND_IP || 'false').trim().toLowerCase() === 'true';
const VIDEO_GRANT_BIND_UA = String(process.env.VIDEO_GRANT_BIND_UA || 'false').trim().toLowerCase() === 'true';
const R2_PRESIGNED_TTL_SECONDS = Math.max(60, Number(process.env.R2_PRESIGNED_TTL_SECONDS) || 1800);

function getDefaultSubjectCodesForProgram(program) {
  if (!program) return [];

  if (program.account_type === 'ort') {
    return ['math', 'russian', 'history', 'geography', 'english'];
  }

  if (program.account_type === 'medical') {
    return ['chemistry', 'biology', 'physics', 'math'];
  }

  if (program.account_type === 'manas' && program.manas_track === 'humanities') {
    return ['russian', 'kyrgyz_language', 'kyrgyz_literature', 'history', 'geography', 'english'];
  }

  if (program.account_type === 'manas' && program.manas_track === 'exact_sciences') {
    return ['math', 'physics', 'chemistry', 'biology', 'english', 'geography'];
  }

  return [
    'math',
    'russian',
    'physics',
    'chemistry',
    'biology',
    'kyrgyz_language',
    'kyrgyz_literature',
    'history',
    'geography',
    'english',
  ];
}

function parseBearerToken(headerValue) {
  if (!headerValue) return null;
  const [scheme, token] = String(headerValue).split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

function sanitizeOptionsForStudent(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.map((option) => {
    if (typeof option === 'string') {
      return { text: option };
    }
    return { text: String(option?.text || '') };
  });
}

function getCorrectOptionIndex(options) {
  if (!Array.isArray(options)) return -1;
  return options.findIndex((option) => Boolean(option?.is_correct));
}

function shuffle(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function buildEmptyAnswersState(totalQuestions) {
  return {
    by_question: {},
    answered_count: 0,
    correct_count: 0,
    total_questions: totalQuestions,
    score_percent: 0,
    submitted_at: null,
  };
}

function createEmptyVideoStats() {
  return {
    lessonCount: 0,
    playableCount: 0,
  };
}

function parsePositiveRange(rangeHeader, fileSize) {
  if (!rangeHeader || !rangeHeader.startsWith('bytes=')) {
    return null;
  }

  const [startRaw, endRaw] = rangeHeader.replace('bytes=', '').split('-');
  const start = Number(startRaw);
  const end = endRaw ? Number(endRaw) : fileSize - 1;

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end >= fileSize) {
    return null;
  }

  return { start, end };
}

function normalizePositiveInt(value, fallback) {
  const num = Number(value);
  if (Number.isFinite(num) && num > 0) return Math.floor(num);
  return fallback;
}

function getVideoGrantSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();
  if (!secret) {
    throw new Error('Missing JWT_SECRET for video grants');
  }
  return secret;
}

function createClientFingerprint(req) {
  if (!VIDEO_GRANT_BIND_IP && !VIDEO_GRANT_BIND_UA) {
    return null;
  }

  const userAgent = String(req.get('user-agent') || '');
  const fingerprint = {};

  if (VIDEO_GRANT_BIND_IP) {
    fingerprint.ip = String(req.ip || req.socket?.remoteAddress || '');
  }

  if (VIDEO_GRANT_BIND_UA) {
    fingerprint.uaHash = crypto.createHash('sha256').update(userAgent).digest('hex').slice(0, 24);
  }

  return fingerprint;
}

function signVideoGrant(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto
    .createHmac('sha256', getVideoGrantSecret())
    .update(encodedPayload)
    .digest('base64url');
  return `${encodedPayload}.${signature}`;
}

function decodeVideoGrant(token) {
  if (!token || typeof token !== 'string') return null;

  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', getVideoGrantSecret())
    .update(encodedPayload)
    .digest('base64url');

  if (signature !== expectedSignature) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function createVideoGrant({ req, lessonId, sourceUrl, ttlSeconds }) {
  if (!sourceUrl || !req) return null;
  const safeTtlSeconds = normalizePositiveInt(ttlSeconds, VIDEO_GRANT_TTL_SECONDS);
  const nowSeconds = Math.floor(Date.now() / 1000);
  return signVideoGrant({
    lessonId: String(lessonId || ''),
    sourceUrl: String(sourceUrl || ''),
    exp: nowSeconds + safeTtlSeconds,
    fingerprint: createClientFingerprint(req),
  });
}

function resolveVideoGrant(grantToken, req) {
  const grant = decodeVideoGrant(grantToken);
  if (!grant) return null;

  if (!grant.exp || Number(grant.exp) <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  const fingerprint = createClientFingerprint(req);
  if (
    grant.fingerprint?.ip
    && fingerprint?.ip
    && grant.fingerprint.ip !== fingerprint.ip
  ) {
    return null;
  }
  if (
    grant.fingerprint?.uaHash
    && fingerprint?.uaHash
    && grant.fingerprint.uaHash !== fingerprint.uaHash
  ) {
    return null;
  }

  return grant;
}

function buildVideoProxyUrl(grantId) {
  return `/api/tests/videos/proxy/${encodeURIComponent(grantId)}`;
}

function encodeProxyPath(pathValue) {
  return Buffer.from(String(pathValue || ''), 'utf8').toString('base64url');
}

function decodeProxyPath(pathValue) {
  try {
    return Buffer.from(String(pathValue || ''), 'base64url').toString('utf8');
  } catch {
    return null;
  }
}

function buildVideoProxyPathUrl(grantId, pathValue) {
  const encodedGrant = encodeURIComponent(grantId);
  const encodedPath = encodeURIComponent(encodeProxyPath(pathValue));
  return `/api/tests/videos/proxy/${encodedGrant}?path=${encodedPath}`;
}

function resolveAbsoluteVideoUrl(input, baseUrl) {
  try {
    return new URL(String(input || ''), baseUrl).toString();
  } catch {
    return null;
  }
}

function applyVideoSecurityHeaders(res, options = {}) {
  const isManifest = Boolean(options.isManifest);
  res.setHeader(
    'Cache-Control',
    isManifest
      ? 'private, max-age=10, must-revalidate'
      : 'private, max-age=120, stale-while-revalidate=60',
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function buildUpstreamVideoHeaders(req) {
  const headers = {};
  if (req.headers.range) {
    headers.Range = String(req.headers.range);
  }
  if (req.headers['if-none-match']) {
    headers['If-None-Match'] = String(req.headers['if-none-match']);
  }
  if (req.headers['if-modified-since']) {
    headers['If-Modified-Since'] = String(req.headers['if-modified-since']);
  }
  return headers;
}

function isHlsManifestResponse(contentType, sourceUrl) {
  const type = String(contentType || '').toLowerCase();
  if (type.includes('application/vnd.apple.mpegurl') || type.includes('application/x-mpegurl')) {
    return true;
  }

  return String(sourceUrl || '').toLowerCase().includes('.m3u8');
}

function isLikelyManifestUrl(sourceUrl) {
  return String(sourceUrl || '').toLowerCase().includes('.m3u8');
}

function rewritePlaylistWithVideoGrants({
  manifestText,
  baseUrl,
  req,
  lessonId,
  currentGrantId,
}) {
  const lines = String(manifestText || '').split('\n');

  return lines
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;

      const mapEntryToProxyUrl = (rawUri) => {
        const absolute = resolveAbsoluteVideoUrl(rawUri, baseUrl);
        if (!absolute) return rawUri;

        if (isLikelyManifestUrl(absolute)) {
          const manifestGrantId = createVideoGrant({
            req,
            lessonId,
            sourceUrl: absolute,
            ttlSeconds: VIDEO_SEGMENT_GRANT_TTL_SECONDS,
          });
          if (!manifestGrantId) return rawUri;
          return buildVideoProxyUrl(manifestGrantId);
        }

        return buildVideoProxyPathUrl(currentGrantId, rawUri);
      };

      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uriRaw) => {
          const secureUri = mapEntryToProxyUrl(uriRaw);
          return `URI="${secureUri}"`;
        });
      }

      return mapEntryToProxyUrl(trimmed);
    })
    .join('\n');
}

async function toSecureVideoLesson(req, lesson) {
  const secureLesson = {
    ...lesson,
    playbackUrl: null,
    hlsUrl: null,
    mp4Url: null,
    previewUrl: null,
    isPlayable: false,
  };

  const hlsSourceUrl = lesson.hlsUrl || null;
  const mp4SourceUrl = lesson.mp4Url || null;
  const fallbackSourceUrl = lesson.playbackUrl || null;
  const streamType = String(lesson.streamType || '').toLowerCase();

  if (!hlsSourceUrl && !mp4SourceUrl && !fallbackSourceUrl) {
    return secureLesson;
  }

  let presignedPlaybackUrl = null;
  const canTryPresigned = isPresignedEnabled()
    && Boolean(lesson.objectKey)
    && (Boolean(mp4SourceUrl) || (Boolean(fallbackSourceUrl) && !hlsSourceUrl && streamType === 'mp4'));

  if (canTryPresigned) {
    try {
      presignedPlaybackUrl = await getPresignedVideoUrl(lesson.objectKey, R2_PRESIGNED_TTL_SECONDS);
    } catch (error) {
      console.error(`Failed to create presigned video URL for lesson ${lesson.id}:`, error);
    }
  }

  const publicMp4FallbackUrl = mp4SourceUrl || (streamType === 'mp4' ? fallbackSourceUrl : null);

  if (hlsSourceUrl) {
    const hlsGrantId = createVideoGrant({
      req,
      lessonId: lesson.id,
      sourceUrl: hlsSourceUrl,
      ttlSeconds: VIDEO_GRANT_TTL_SECONDS,
    });
    if (hlsGrantId) {
      secureLesson.hlsUrl = buildVideoProxyUrl(hlsGrantId);
    }
  }

  if (presignedPlaybackUrl) {
    secureLesson.mp4Url = presignedPlaybackUrl;
  } else if (publicMp4FallbackUrl) {
    secureLesson.mp4Url = publicMp4FallbackUrl;
  }

  let genericProxyFallbackUrl = null;
  if (!publicMp4FallbackUrl && fallbackSourceUrl) {
    const fallbackGrantId = createVideoGrant({
      req,
      lessonId: lesson.id,
      sourceUrl: fallbackSourceUrl,
      ttlSeconds: VIDEO_GRANT_TTL_SECONDS,
    });
    if (fallbackGrantId) {
      genericProxyFallbackUrl = buildVideoProxyUrl(fallbackGrantId);
    }
  }

  if (presignedPlaybackUrl) {
    // Fall back to the direct public CDN URL before touching the Railway proxy.
    secureLesson.playbackUrl = publicMp4FallbackUrl || genericProxyFallbackUrl || presignedPlaybackUrl;
  } else if (!secureLesson.hlsUrl && !secureLesson.mp4Url) {
    secureLesson.playbackUrl = genericProxyFallbackUrl;
  } else {
    secureLesson.playbackUrl = secureLesson.mp4Url || publicMp4FallbackUrl || secureLesson.hlsUrl || genericProxyFallbackUrl;
  }

  secureLesson.isPlayable = Boolean(secureLesson.playbackUrl || secureLesson.hlsUrl || secureLesson.mp4Url);
  return secureLesson;
}

async function getPrimaryProgram(studentId) {
  const { data, error } = await supabase
    .from('uni_student_programs')
    .select('program_code, is_primary')
    .eq('student_id', studentId)
    .eq('is_primary', true)
    .maybeSingle();

  if (error) throw error;
  if (!data?.program_code) return null;

  const { data: program, error: programError } = await supabase
    .from('uni_programs')
    .select('code, name, account_type, manas_track, is_active')
    .eq('code', data.program_code)
    .maybeSingle();

  if (programError) throw programError;
  return program || null;
}

async function getProgramSubjects(programCode) {
  const { data: links, error: linksError } = await supabase
    .from('uni_program_subjects')
    .select('subject_id, sort_order')
    .eq('program_code', programCode)
    .order('sort_order', { ascending: true });

  if (linksError) throw linksError;

  const subjectIds = (links || []).map((item) => item.subject_id).filter(Boolean);
  if (!subjectIds.length) return [];

  const { data: subjects, error: subjectsError } = await supabase
    .from('uni_subjects')
    .select('id, code, title')
    .in('id', subjectIds);

  if (subjectsError) throw subjectsError;

  const subjectById = new Map((subjects || []).map((subject) => [subject.id, subject]));

  const normalizedSubjects = (links || [])
    .map((link) => {
      const subject = subjectById.get(link.subject_id);
      if (!subject) return null;
      const canonicalCode = canonicalizeSubjectCode(subject.code);
      const tableName = getQuestionTableBySubjectCode(canonicalCode || subject.code);
      if (!canonicalCode || !tableName) return null;
      return {
        id: subject.id,
        code: canonicalCode,
        originalCode: subject.code,
        title: subject.title,
        tableName,
        sortOrder: link.sort_order || 0,
      };
    })
    .filter(Boolean);

  // Some programs contain both canonical subjects (e.g. "english")
  // and technical aliases (e.g. "manas_hum_subj_6"). Deduplicate by canonical code
  // and prefer the canonical subject row for stable titles/counts in UI.
  const dedupedByCode = new Map();

  for (const subject of normalizedSubjects) {
    const existing = dedupedByCode.get(subject.code);
    if (!existing) {
      dedupedByCode.set(subject.code, subject);
      continue;
    }

    const existingIsCanonical = existing.originalCode === existing.code;
    const nextIsCanonical = subject.originalCode === subject.code;

    if (!existingIsCanonical && nextIsCanonical) {
      dedupedByCode.set(subject.code, subject);
      continue;
    }

    if (existing.sortOrder > subject.sortOrder) {
      dedupedByCode.set(subject.code, subject);
    }
  }

  return Array.from(dedupedByCode.values())
    .sort((left, right) => left.sortOrder - right.sortOrder || left.title.localeCompare(right.title, 'ru', { sensitivity: 'base' }))
    .map(({ originalCode, ...subject }) => subject);
}

async function getFallbackProgramSubjects(program) {
  const expectedCodes = getDefaultSubjectCodesForProgram(program);
  if (!expectedCodes.length) return [];

  const { data: subjects, error } = await supabase
    .from('uni_subjects')
    .select('id, code, title')
    .in('code', expectedCodes);

  if (error) throw error;

  const byCode = new Map((subjects || []).map((subject) => [subject.code, subject]));

  return expectedCodes
    .map((code, index) => {
      const subject = byCode.get(code);
      if (!subject) return null;
      const canonicalCode = canonicalizeSubjectCode(subject.code);
      const tableName = getQuestionTableBySubjectCode(canonicalCode || subject.code);
      if (!canonicalCode || !tableName) return null;

      return {
        id: subject.id,
        code: canonicalCode,
        title: subject.title,
        tableName,
        sortOrder: index + 1,
      };
    })
    .filter(Boolean);
}

async function countQuestionsBySubject(programSubjects) {
  const counters = await Promise.all(programSubjects.map(async (subject) => {
    const { count, error } = await supabase
      .from(subject.tableName)
      .select('*', { count: 'exact', head: true })
      .eq('subject_id', subject.id);

    if (error) {
      throw error;
    }

    return [subject.code, Number(count || 0)];
  }));

  return Object.fromEntries(counters);
}

async function getOrCreateTemplate({ programCode, subjectId, subjectCode, part }) {
  const { data: existing, error: existingError } = await supabase
    .from('uni_test_templates')
    .select('id, code, title, program_code, subject_id, round_no, test_kind')
    .eq('program_code', programCode)
    .eq('subject_id', subjectId)
    .eq('test_kind', 'subject_test')
    .eq('round_no', part)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const safeCode = `${programCode}_${subjectCode}_test_${part}`.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  const payload = {
    code: safeCode,
    program_code: programCode,
    subject_id: subjectId,
    title: `${subjectCode}: предметтик тест ${part}`,
    test_kind: 'subject_test',
    round_no: part,
    questions_total: QUESTIONS_PER_TEST,
    is_active: true,
  };

  const { data: created, error: createError } = await supabase
    .from('uni_test_templates')
    .insert(payload)
    .select('id, code, title, program_code, subject_id, round_no, test_kind')
    .single();

  if (createError || !created) {
    throw createError || new Error('Failed to create template');
  }

  return created;
}

function mapStudentResponse(student, program, token) {
  return {
    token,
    student: {
      id: student.id,
      fullName: student.full_name,
      grade: 1,
      language: 'ru',
      username: student.username,
      accountType: student.account_type,
      manasTrack: student.manas_track || null,
      programCode: program?.code || null,
      programName: program?.name || null,
    },
  };
}

function isBlockedStudent(student) {
  if (student.blocked_permanently) {
    return { blocked: true, reason: 'permanent' };
  }

  if (student.blocked_until) {
    const until = new Date(student.blocked_until);
    if (until > new Date()) {
      return { blocked: true, reason: 'temporary', blockedUntil: student.blocked_until };
    }
  }

  return { blocked: false };
}

async function authenticateStudent(req, res, next) {
  try {
    const token = parseBearerToken(req.headers.authorization);
    const payload = verifyStudentToken(token);

    if (!token || !payload || !payload.sub) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: student, error } = await supabase
      .from('uni_students')
      .select('id, full_name, username, password_hash, plain_password, account_type, manas_track, is_active, active_session_token, previous_session_token, blocked_until, blocked_permanently, screenshot_strikes, created_at, expires_at')
      .eq('id', payload.sub)
      .maybeSingle();

    if (error) {
      console.error('Student auth lookup error:', error);
      return res.status(500).json({ error: 'Student lookup failed' });
    }

    if (!student) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const tokenMatches = token === student.active_session_token || token === student.previous_session_token;
    if (!tokenMatches) {
      return res.status(401).json({ error: 'Session expired' });
    }

    if (!student.is_active) {
      return res.status(403).json({ error: 'Аккаунт деактивирован администратором' });
    }

    const blockStatus = isBlockedStudent(student);
    if (blockStatus.blocked) {
      if (blockStatus.reason === 'permanent') {
        return res.status(403).json({ error: 'Ваша учётная запись заблокирована навсегда', code: 'BLOCKED_PERMANENT' });
      }

      return res.status(403).json({
        error: `Ваша учётная запись заблокирована до ${new Date(blockStatus.blockedUntil).toLocaleString('ru-RU')}`,
        code: 'BLOCKED_TEMPORARY',
      });
    }

    if (student.expires_at && new Date(student.expires_at).getTime() < Date.now()) {
      return res.status(403).json({ error: 'Срок действия вашего доступа истёк', code: 'ACCOUNT_EXPIRED' });
    }

    const remaining = payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : -1;
    if (remaining > 0 && remaining <= TOKEN_REFRESH_THRESHOLD_SECONDS && !isStudentTokenExpired(payload)) {
      const refreshedToken = signStudentToken({
        sub: student.id,
        accountType: student.account_type,
        manasTrack: student.manas_track || null,
      });

      await supabase
        .from('uni_students')
        .update({
          active_session_token: refreshedToken,
          previous_session_token: token,
        })
        .eq('id', student.id);

      res.set('X-Student-Token', refreshedToken);
    }

    req.student = student;
    return next();
  } catch (error) {
    console.error('Student auth error:', error);
    return res.status(500).json({ error: 'Auth middleware failure' });
  }
}

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};

    const normalizedUsername = String(username || '').trim().toLowerCase();
    const rawPassword = String(password || '');
    const trimmedPassword = rawPassword.trim();

    if (!normalizedUsername || !trimmedPassword) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Case-insensitive username lookup — DB has a unique index on lower(username),
    // but historical rows may contain mixed-case values. ilike matches regardless of case.
    const { data: students, error } = await supabase
      .from('uni_students')
      .select('id, full_name, username, password_hash, plain_password, account_type, manas_track, is_active, blocked_until, blocked_permanently, screenshot_strikes, created_at, expires_at')
      .ilike('username', normalizedUsername)
      .limit(1);

    if (error) {
      console.error('Student login lookup error:', error);
      return res.status(500).json({ error: 'Ошибка поиска ученика' });
    }

    const student = Array.isArray(students) && students.length > 0 ? students[0] : null;

    if (!student) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    const candidatePasswords = Array.from(new Set([rawPassword, trimmedPassword].filter(Boolean)));
    const passwordMatches = candidatePasswords.some((candidate) => (
      student.password_hash === hashPassword(candidate)
      || (student.plain_password && student.plain_password === candidate)
      || (student.plain_password && student.plain_password.trim() === candidate)
    ));

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Неверный логин или пароль' });
    }

    if (!student.is_active) {
      return res.status(403).json({ error: 'Аккаунт деактивирован администратором' });
    }

    const blockStatus = isBlockedStudent(student);
    if (blockStatus.blocked) {
      if (blockStatus.reason === 'permanent') {
        return res.status(403).json({ error: 'Ваша учётная запись заблокирована навсегда', code: 'BLOCKED_PERMANENT' });
      }

      return res.status(403).json({
        error: `Ваша учётная запись заблокирована до ${new Date(blockStatus.blockedUntil).toLocaleString('ru-RU')}`,
        code: 'BLOCKED_TEMPORARY',
      });
    }

    if (student.expires_at && new Date(student.expires_at).getTime() < Date.now()) {
      return res.status(403).json({ error: 'Срок действия вашего доступа истёк', code: 'ACCOUNT_EXPIRED' });
    }

    const program = await getPrimaryProgram(student.id);

    const token = signStudentToken({
      sub: student.id,
      accountType: student.account_type,
      manasTrack: student.manas_track || null,
    });

    const { error: updateError } = await supabase
      .from('uni_students')
      .update({
        active_session_token: token,
        previous_session_token: null,
      })
      .eq('id', student.id);

    if (updateError) {
      console.error('Student login token update error:', updateError);
      return res.status(500).json({ error: 'Ошибка входа ученика' });
    }

    return res.json(mapStudentResponse(student, program, token));
  } catch (error) {
    console.error('Student login error:', error);
    return res.status(500).json({ error: 'Ошибка входа ученика' });
  }
});

router.get('/videos/proxy/:grantId', async (req, res) => {
  let abortController;
  try {
    const grant = resolveVideoGrant(req.params.grantId, req);
    if (!grant?.sourceUrl) {
      return res.status(403).json({ error: 'Video access expired' });
    }

    let upstreamSourceUrl = grant.sourceUrl;
    const encodedPath = typeof req.query.path === 'string' ? req.query.path : '';
    if (encodedPath) {
      const decodedPath = decodeProxyPath(encodedPath);
      if (!decodedPath) {
        return res.status(400).json({ error: 'Invalid video path token' });
      }

      const resolvedPathUrl = resolveAbsoluteVideoUrl(decodedPath, grant.sourceUrl);
      if (!resolvedPathUrl) {
        return res.status(400).json({ error: 'Invalid video path value' });
      }
      upstreamSourceUrl = resolvedPathUrl;
    }

    abortController = new AbortController();

    // Abort upstream fetch when client disconnects (e.g. on seek / tab close)
    res.on('close', () => {
      abortController.abort();
    });

    const upstreamResponse = await fetch(upstreamSourceUrl, {
      method: 'GET',
      headers: buildUpstreamVideoHeaders(req),
      redirect: 'follow',
      signal: abortController.signal,
    });

    if (!upstreamResponse.ok && upstreamResponse.status !== 206) {
      const status = upstreamResponse.status >= 400 && upstreamResponse.status < 500 ? 404 : 502;
      console.error(`Video proxy upstream error: ${upstreamResponse.status} for ${upstreamSourceUrl}`);
      return res.status(status).json({ error: 'Failed to stream video' });
    }

    const contentType = upstreamResponse.headers.get('content-type') || '';
    if (isHlsManifestResponse(contentType, upstreamSourceUrl)) {
      const manifestText = await upstreamResponse.text();
      const rewrittenManifest = rewritePlaylistWithVideoGrants({
        manifestText,
        baseUrl: upstreamSourceUrl,
        req,
        lessonId: grant.lessonId,
        currentGrantId: req.params.grantId,
      });

      applyVideoSecurityHeaders(res, { isManifest: true });
      res.status(upstreamResponse.status === 206 ? 206 : 200);
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
      return res.send(rewrittenManifest);
    }

    applyVideoSecurityHeaders(res, { isManifest: false });
    const passthroughHeaders = [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'etag',
      'last-modified',
    ];

    for (const headerName of passthroughHeaders) {
      const value = upstreamResponse.headers.get(headerName);
      if (value) {
        res.setHeader(headerName, value);
      }
    }

    // Always advertise byte-range support so browser can seek
    if (!upstreamResponse.headers.get('accept-ranges')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    res.status(upstreamResponse.status);
    if (!upstreamResponse.body) {
      return res.end();
    }

    const nodeStream = Readable.fromWeb(upstreamResponse.body);

    nodeStream.on('error', (streamError) => {
      if (streamError?.name === 'AbortError') return;
      if (!res.headersSent) {
        res.status(502).json({ error: 'Stream interrupted' });
      } else {
        res.destroy();
      }
    });

    nodeStream.pipe(res);
  } catch (error) {
    if (error?.name === 'AbortError') return;
    console.error('Proxy student video error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Failed to proxy video stream' });
    }
    res.destroy();
  }
});

router.use(authenticateStudent);

router.get('/available', async (req, res) => {
  try {
    const program = await getPrimaryProgram(req.student.id);
    if (!program) {
      return res.status(400).json({ error: 'Студенту не назначена программа' });
    }

    let programSubjects = await getProgramSubjects(program.code);
    if (!programSubjects.length) {
      programSubjects = await getFallbackProgramSubjects(program);
    }
    const questionCounts = await countQuestionsBySubject(programSubjects);
    const videoCounts = await fetchVideoLessonCounts(program.code);

    const items = programSubjects.map((subject) => {
      const available = Number(questionCounts[subject.code] || 0);
      const videoStats = videoCounts.get(subject.code) || createEmptyVideoStats();
      const dynamicPartCount = available >= QUESTIONS_PER_TEST ? Math.ceil(available / QUESTIONS_PER_TEST) : 0;
      return {
        id: subject.code,
        title: subject.title,
        required_total: QUESTIONS_PER_TEST,
        available_total: available,
        video_lesson_count: videoStats.lessonCount,
        playable_video_lesson_count: videoStats.playableCount,
        status: available >= QUESTIONS_PER_TEST ? 'ready' : 'locked',
        lines: [
          {
            grade: 1,
            required: QUESTIONS_PER_TEST,
            available,
            label: `Тесты 1-${dynamicPartCount} (по ${QUESTIONS_PER_TEST} вопросов)`,
            part_count: dynamicPartCount,
            part_question_count: QUESTIONS_PER_TEST,
            usable_question_total: dynamicPartCount * QUESTIONS_PER_TEST,
          },
        ],
      };
    });

    return res.json({
      student: {
        id: req.student.id,
        fullName: req.student.full_name,
        grade: 1,
        language: 'ru',
        username: req.student.username,
      },
      branch: {
        grade: 1,
        language: 'ru',
        title: program.name,
        class_title: program.name,
        language_title: 'Русский язык',
      },
      test_types: [
        {
          id: 'MAIN',
          title: 'Предметтик тест',
          status: items.some((item) => item.status === 'ready') ? 'ready' : 'locked',
          items,
        },
        {
          id: 'TRIAL',
          title: 'Сынамык тест',
          status: 'locked',
          rounds: [],
        },
      ],
    });
  } catch (error) {
    console.error('Load student catalog error:', error);
    return res.status(500).json({ error: 'Failed to load student navigation tree' });
  }
});

router.get('/videos', async (req, res) => {
  try {
    const subjectCode = canonicalizeSubjectCode(req.query.subject);
    if (!subjectCode) {
      return res.status(400).json({ error: 'subject query parameter is required' });
    }

    const program = await getPrimaryProgram(req.student.id);
    if (!program) {
      return res.status(400).json({ error: 'Студенту не назначена программа' });
    }

    const rawLessons = await fetchVideoLessonsForProgram(program.code, subjectCode);
    const lessons = await Promise.all(rawLessons.map((lesson) => toSecureVideoLesson(req, lesson)));

    return res.json({
      program: {
        code: program.code,
        name: program.name,
        accountType: program.account_type,
        manasTrack: program.manas_track || null,
      },
      subject: {
        code: subjectCode,
        title: lessons[0]?.subjectTitle || subjectCode,
        lessonCount: lessons.length,
        playableCount: lessons.filter((lesson) => lesson.isPlayable).length,
      },
      lessons,
    });
  } catch (error) {
    console.error('Fetch student videos error:', error);
    return res.status(500).json({ error: 'Failed to load video lessons' });
  }
});

router.get('/videos/preview/:id', async (req, res) => {
  try {
    if (process.env.ALLOW_LOCAL_VIDEO_PREVIEW !== 'true') {
      return res.status(403).json({ error: 'Local video preview is disabled' });
    }

    const program = await getPrimaryProgram(req.student.id);
    if (!program) {
      return res.status(400).json({ error: 'Студенту не назначена программа' });
    }

    const lesson = await findVideoLessonForProgram(program.code, req.params.id);
    if (!lesson) {
      return res.status(404).json({ error: 'Video lesson not found' });
    }

    const absolutePath = resolveAbsoluteVideoPath(lesson.source_relative_path);
    if (!absolutePath || !fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Local preview file not found' });
    }

    const stat = fs.statSync(absolutePath);
    const contentType =
      lesson.source_extension === 'mkv'
        ? 'video/x-matroska'
        : 'video/mp4';
    const parsedRange = parsePositiveRange(req.headers.range, stat.size);

    applyVideoSecurityHeaders(res);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    if (!parsedRange) {
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(absolutePath).pipe(res);
      return;
    }

    const { start, end } = parsedRange;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    fs.createReadStream(absolutePath, { start, end }).pipe(res);
  } catch (error) {
    console.error('Video preview error:', error);
    return res.status(500).json({ error: 'Failed to stream local video preview' });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const { type, subject, part } = req.body || {};
    const normalizedType = String(type || '').trim().toUpperCase();
    const normalizedSubject = canonicalizeSubjectCode(subject);
    const selectedPart = Number(part || 1);

    if (normalizedType !== 'MAIN') {
      return res.status(400).json({ error: 'Сейчас доступен только предметтик тест (MAIN)' });
    }

    if (!normalizedSubject) {
      return res.status(400).json({ error: 'Invalid subject for MAIN test' });
    }

    if (!Number.isInteger(selectedPart) || selectedPart < 1 || selectedPart > MAX_PARTS_UPPER_BOUND) {
      return res.status(400).json({ error: `part must be integer from 1 to ${MAX_PARTS_UPPER_BOUND}` });
    }

    const program = await getPrimaryProgram(req.student.id);
    if (!program) {
      return res.status(400).json({ error: 'Студенту не назначена программа' });
    }

    let programSubjects = await getProgramSubjects(program.code);
    if (!programSubjects.length) {
      programSubjects = await getFallbackProgramSubjects(program);
    }
    const subjectMeta = programSubjects.find((item) => item.code === normalizedSubject);

    if (!subjectMeta) {
      return res.status(400).json({ error: 'Предмет недоступен для текущей программы' });
    }

    const template = await getOrCreateTemplate({
      programCode: program.code,
      subjectId: subjectMeta.id,
      subjectCode: normalizedSubject,
      part: selectedPart,
    });

    // Fast offset-based query: load only the slice needed for this part
    const offset = (selectedPart - 1) * QUESTIONS_PER_TEST;

    const { data: subjectQuestions, error: subjectQuestionsError } = await supabase
      .from(subjectMeta.tableName)
      .select('id, subject_id, template_id, question_text, options, explanation, image_url, created_at')
      .eq('subject_id', subjectMeta.id)
      .order('created_at', { ascending: true })
      .range(offset, offset + QUESTIONS_PER_TEST - 1);

    if (subjectQuestionsError) {
      console.error('Fetch subject questions error:', subjectQuestionsError);
      return res.status(500).json({ error: 'Failed to fetch subject questions' });
    }

    let pool = subjectQuestions || [];

    // Изолируем вопросы Манаса от других направлений (например, меда)
    if (program.account_type !== 'manas') {
      pool = pool.filter(q => !(q.explanation || '').includes('[MANAS_ONLY]'));
    }

    if (pool.length === 0) {
      return res.status(409).json({
        error: `Недостаточно вопросов по предмету ${subjectMeta.title} для части ${selectedPart}`,
      });
    }

    const questions = shuffle(pool).slice(0, QUESTIONS_PER_TEST);
    const generatedMeta = {
      schema_version: 1,
      type: 'MAIN',
      subject: normalizedSubject,
      round: null,
      part: selectedPart,
      program_code: program.code,
      items: questions.map((question, index) => ({
        id: String(question.id),
        table: subjectMeta.tableName,
        subject_code: normalizedSubject,
        subject_title: subjectMeta.title,
        order: index,
      })),
    };

    const answersState = buildEmptyAnswersState(questions.length);

    const { data: createdSession, error: createSessionError } = await supabase
      .from('uni_test_sessions')
      .insert({
        student_id: req.student.id,
        template_id: template.id,
        generated_questions: generatedMeta,
        answers: answersState,
        total_score: 0,
        status: 'in_progress',
      })
      .select('id')
      .single();

    if (createSessionError || !createdSession) {
      console.error('Create test session error:', createSessionError);
      return res.status(500).json({ error: 'Failed to create test session' });
    }

    return res.json({
      test_session_id: createdSession.id,
      test_info: {
        type: 'MAIN',
        subject: normalizedSubject,
        round: null,
        part: selectedPart,
        language: 'ru',
        grade: 1,
        grade_window: [1, 1],
      },
      breakdown: {
        [normalizedSubject]: {
          total: questions.length,
          by_grade: { 1: questions.length },
        },
      },
      total_questions: questions.length,
      questions: questions.map((question) => ({
        id: String(question.id),
        text: question.question_text,
        options: sanitizeOptionsForStudent(question.options),
        topic: subjectMeta.title,
        imageUrl: question.image_url || '',
      })),
    });
  } catch (error) {
    console.error('Test generation error:', error);
    return res.status(500).json({ error: 'Internal server error during test generation' });
  }
});

router.post('/answer', async (req, res) => {
  try {
    const {
      test_session_id: sessionId,
      type,
      question_id: questionId,
      selected_index: selectedIndexRaw,
    } = req.body || {};

    const normalizedType = String(type || '').trim().toUpperCase();
    const selectedIndex = Number(selectedIndexRaw);

    if (!sessionId || !questionId || normalizedType !== 'MAIN') {
      return res.status(400).json({ error: 'Invalid answer payload' });
    }

    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      return res.status(400).json({ error: 'selected_index must be a non-negative integer' });
    }

    const { data: session, error: sessionError } = await supabase
      .from('uni_test_sessions')
      .select('id, student_id, generated_questions, answers, status')
      .eq('id', sessionId)
      .eq('student_id', req.student.id)
      .maybeSingle();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Test session not found' });
    }

    if (session.status !== 'in_progress') {
      return res.status(409).json({ error: 'Test session is already submitted' });
    }

    const items = Array.isArray(session.generated_questions?.items) ? session.generated_questions.items : [];
    const sessionItem = items.find((item) => String(item.id) === String(questionId));

    if (!sessionItem) {
      return res.status(404).json({ error: 'Question not found in this session' });
    }

    const answersState = session.answers || buildEmptyAnswersState(items.length);
    if (answersState.by_question?.[String(questionId)]) {
      return res.status(409).json({ error: 'Answer for this question is already locked' });
    }

    const { data: questionRow, error: questionError } = await supabase
      .from(sessionItem.table)
      .select('id, options, explanation')
      .eq('id', questionId)
      .maybeSingle();

    if (questionError || !questionRow) {
      return res.status(500).json({ error: 'Failed to reveal answer' });
    }

    const optionsLength = Array.isArray(questionRow.options) ? questionRow.options.length : 0;
    if (selectedIndex >= optionsLength) {
      return res.status(400).json({ error: 'selected_index is out of range for this question' });
    }

    const correctIndex = getCorrectOptionIndex(questionRow.options);
    const isCorrect = correctIndex >= 0 && selectedIndex === correctIndex;

    const nextAnswers = {
      ...answersState,
      by_question: {
        ...(answersState.by_question || {}),
        [String(questionId)]: {
          selected_index: selectedIndex,
          is_correct: isCorrect,
          correct_index: correctIndex,
          answered_at: new Date().toISOString(),
        },
      },
    };

    nextAnswers.answered_count = Object.keys(nextAnswers.by_question).length;
    nextAnswers.correct_count = Object.values(nextAnswers.by_question).reduce(
      (sum, answer) => sum + (answer.is_correct ? 1 : 0),
      0,
    );
    nextAnswers.total_questions = items.length;
    nextAnswers.score_percent = items.length > 0
      ? Math.round((nextAnswers.correct_count / items.length) * 100)
      : 0;

    const { error: updateError } = await supabase
      .from('uni_test_sessions')
      .update({ answers: nextAnswers })
      .eq('id', session.id)
      .eq('student_id', req.student.id);

    if (updateError) {
      console.error('Answer update error:', updateError);
      return res.status(500).json({ error: 'Failed to save answer result' });
    }

    return res.json({
      is_correct: isCorrect,
      correct_index: correctIndex,
      explanation: String(questionRow.explanation || ''),
      can_continue: true,
      answered_count: nextAnswers.answered_count,
      total_questions: items.length,
    });
  } catch (error) {
    console.error('Test answer error:', error);
    return res.status(500).json({ error: 'Internal server error during answer reveal' });
  }
});

router.post('/submit', async (req, res) => {
  try {
    const { test_session_id: sessionId, type } = req.body || {};
    const normalizedType = String(type || '').trim().toUpperCase();

    if (!sessionId || normalizedType !== 'MAIN') {
      return res.status(400).json({ error: 'Invalid submit payload' });
    }

    const { data: session, error: sessionError } = await supabase
      .from('uni_test_sessions')
      .select('id, student_id, generated_questions, answers, status')
      .eq('id', sessionId)
      .eq('student_id', req.student.id)
      .maybeSingle();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Test session not found' });
    }

    if (session.status !== 'in_progress') {
      return res.status(409).json({ error: 'Test session is already submitted' });
    }

    const items = Array.isArray(session.generated_questions?.items) ? session.generated_questions.items : [];
    const answersState = session.answers || buildEmptyAnswersState(items.length);

    const answeredCount = Object.keys(answersState.by_question || {}).length;
    const correctCount = Object.values(answersState.by_question || {}).reduce(
      (sum, answer) => sum + (answer.is_correct ? 1 : 0),
      0,
    );

    const totalQuestions = items.length;
    const scorePercent = totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0;

    const finalAnswers = {
      ...answersState,
      answered_count: answeredCount,
      correct_count: correctCount,
      total_questions: totalQuestions,
      score_percent: scorePercent,
      submitted_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('uni_test_sessions')
      .update({
        answers: finalAnswers,
        total_score: scorePercent,
        submitted_at: new Date().toISOString(),
        status: 'submitted',
      })
      .eq('id', session.id)
      .eq('student_id', req.student.id);

    if (updateError) {
      console.error('Submit update error:', updateError);
      return res.status(500).json({ error: 'Failed to save test submission' });
    }

    return res.json({
      message: 'Submission successful',
      score: scorePercent,
      correct: correctCount,
      answered: answeredCount,
      total: totalQuestions,
    });
  } catch (error) {
    console.error('Test submit error:', error);
    return res.status(500).json({ error: 'Internal server error during test submit' });
  }
});

router.get('/history', async (req, res) => {
  try {
    const { data: sessions, error } = await supabase
      .from('uni_test_sessions')
      .select('id, generated_questions, answers, total_score, submitted_at, started_at, status')
      .eq('student_id', req.student.id)
      .eq('status', 'submitted')
      .order('submitted_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('History fetch error:', error);
      return res.status(500).json({ error: 'Failed to fetch test history' });
    }

    const history = (sessions || []).map((session) => {
      const answers = session.answers || {};
      const generated = session.generated_questions || {};
      return {
        id: session.id,
        type: generated.type || 'MAIN',
        subject: generated.subject || null,
        round: generated.round || null,
        part: generated.part || null,
        total_questions: answers.total_questions || 0,
        correct_count: answers.correct_count || 0,
        score_percent: Number(session.total_score || answers.score_percent || 0),
        submitted_at: answers.submitted_at || session.submitted_at,
        created_at: session.started_at,
      };
    });

    return res.json({ history });
  } catch (error) {
    console.error('Fetch history error:', error);
    return res.status(500).json({ error: 'Failed to fetch test history' });
  }
});

router.get('/history/:id', async (req, res) => {
  try {
    const sessionId = String(req.params.id || '').trim();
    const typeParam = String(req.query.type || '').trim().toUpperCase();

    if (!sessionId || !typeParam) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const { data: session, error } = await supabase
      .from('uni_test_sessions')
      .select('id, generated_questions, answers, total_score, submitted_at, started_at, status')
      .eq('id', sessionId)
      .eq('student_id', req.student.id)
      .maybeSingle();

    if (error || !session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.status !== 'submitted') {
      return res.status(400).json({ error: 'Test session is not submitted yet' });
    }

    const generated = session.generated_questions || {};
    const items = Array.isArray(generated.items) ? generated.items : [];
    const answers = session.answers || buildEmptyAnswersState(items.length);

    const groupedByTable = items.reduce((acc, item) => {
      const table = item.table;
      if (!table) return acc;
      if (!acc[table]) {
        acc[table] = [];
      }
      acc[table].push(String(item.id));
      return acc;
    }, {});

    const rowsById = {};
    for (const [tableName, ids] of Object.entries(groupedByTable)) {
      const { data: rows, error: rowsError } = await supabase
        .from(tableName)
        .select('id, question_text, options, explanation, image_url')
        .in('id', ids);

      if (rowsError) {
        return res.status(500).json({ error: 'Failed to load history question payload' });
      }

      for (const row of rows || []) {
        rowsById[String(row.id)] = row;
      }
    }

    const questions = items.map((item, index) => {
      const qId = String(item.id);
      const row = rowsById[qId];
      const answer = answers.by_question?.[qId];

      return {
        index: index + 1,
        id: qId,
        subject: item.subject_code || generated.subject || '',
        grade: 1,
        text: row?.question_text || '',
        options: sanitizeOptionsForStudent(row?.options),
        topic: item.subject_title || '',
        image_url: row?.image_url || '',
        selected_index: answer?.selected_index ?? -1,
        correct_index: answer?.correct_index ?? -1,
        is_correct: Boolean(answer?.is_correct),
        answered: Boolean(answer),
      };
    });

    return res.json({
      id: session.id,
      type: generated.type || 'MAIN',
      subject: generated.subject || null,
      round: generated.round || null,
      part: generated.part || null,
      total_questions: answers.total_questions || items.length,
      correct_count: answers.correct_count || 0,
      score_percent: Number(session.total_score || answers.score_percent || 0),
      submitted_at: answers.submitted_at || session.submitted_at,
      created_at: session.started_at,
      questions,
    });
  } catch (error) {
    console.error('Fetch history detail error:', error);
    return res.status(500).json({ error: 'Failed to fetch test history detail' });
  }
});

router.post('/screenshot-violation', async (req, res) => {
  try {
    const nextStrikes = Number(req.student.screenshot_strikes || 0) + 1;

    let action = 'warning';
    if (nextStrikes === 2) {
      action = 'blocked_48h';
    } else if (nextStrikes >= 3) {
      action = 'blocked_permanent';
    }

    const updates = {
      screenshot_strikes: nextStrikes,
    };

    if (action === 'blocked_48h') {
      updates.blocked_until = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      updates.active_session_token = null;
    }

    if (action === 'blocked_permanent') {
      updates.blocked_permanently = true;
      updates.active_session_token = null;
    }

    const { error } = await supabase
      .from('uni_students')
      .update(updates)
      .eq('id', req.student.id);

    if (error) {
      console.error('Screenshot violation update error:', error);
    }

    return res.json({ action, strikes: nextStrikes });
  } catch (error) {
    console.error('Screenshot violation error:', error);
    return res.json({ action: 'warning', strikes: 1 });
  }
});

module.exports = router;
