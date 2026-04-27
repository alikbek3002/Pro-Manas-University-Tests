const express = require('express');
const crypto = require('crypto');
const os = require('os');
const { createReadStream } = require('fs');
const { unlink } = require('fs/promises');
const multer = require('multer');

const router = express.Router();
const supabase = require('../lib/supabase');
const { signAdminToken, verifyAdminToken } = require('../lib/adminAuth');
const {
  canonicalizeSubjectCode,
  getQuestionTableBySubjectCode,
  getAllQuestionTables,
  SUBJECTS,
} = require('../lib/universitySubjects');
const {
  fetchAdminVideoCatalog,
  insertSingleVideoLesson,
  deleteVideoLessonById,
  findVideoLessonById,
  getNextSortOrder,
  getProgramMeta,
  getSubjectTitle,
  MANAS_PROGRAM_META,
  toR2ObjectKey,
  isVideoDbConfigured,
} = require('../lib/videoCatalog');
const { uploadVideoToR2, deleteVideoFromR2, isR2Configured } = require('../lib/videoUploader');

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB for images
});

const videoUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => {
      const ext = file.originalname.split('.').pop() || 'mp4';
      cb(null, `promanas-video-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB max
});

// keep `upload` as alias for image routes that were using memoryStorage
const upload = imageUpload;

const ACCOUNT_TYPES = ['ort', 'medical', 'manas'];
const MANAS_TRACKS = ['all_subjects', 'humanities', 'exact_sciences'];

const DEFAULT_PROGRAM_BY_ACCOUNT = {
  ort: 'ort_base',
  medical: 'medical_base',
};

const DEFAULT_PROGRAM_BY_MANAS_TRACK = {
  all_subjects: 'manas_all_subjects',
  humanities: 'manas_humanities',
  exact_sciences: 'manas_exact_sciences',
};

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function parseBearerToken(headerValue) {
  if (!headerValue) return null;
  const [scheme, token] = String(headerValue).split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}

function normalizeAccountType(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeManasTrack(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  return normalized;
}

function toSafeUsernamePart(value) {
  const translitMap = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
    й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
    у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e',
    ю: 'yu', я: 'ya', ъ: '', ь: '',
  };

  return String(value || '')
    .trim()
    .toLowerCase()
    .split('')
    .map((char) => translitMap[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]/g, '');
}

function generateBaseUsername(fullName) {
  const parts = String(fullName || '').split(/\s+/).filter(Boolean);
  const lastName = toSafeUsernamePart(parts[0] || '');
  const firstName = toSafeUsernamePart(parts[1] || '');

  if (firstName && lastName) return `${firstName}.${lastName}`;
  return firstName || lastName || 'student';
}

function generatePasswordForUsername(username) {
  const safeLogin = toSafeUsernamePart(username).slice(0, 20) || 'student';
  const sixDigits = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  return `uni-${safeLogin}-${sixDigits}`;
}

function accountTypeTitle(accountType) {
  if (accountType === 'ort') return 'ОРТ';
  if (accountType === 'medical') return 'МЕД';
  if (accountType === 'manas') return 'Манас';
  return accountType;
}

function manasTrackTitle(track) {
  if (track === 'all_subjects') return 'Все предметы';
  if (track === 'humanities') return 'Гуманитарий';
  if (track === 'exact_sciences') return 'Точные науки';
  return track || '';
}

async function ensureUniqueUsername(baseUsername, excludeStudentId = null) {
  const safeBase = toSafeUsernamePart(baseUsername).slice(0, 30) || 'student';

  let query = supabase
    .from('uni_students')
    .select('id, username')
    .ilike('username', `${safeBase}%`);

  if (excludeStudentId) {
    query = query.neq('id', excludeStudentId);
  }

  const { data, error } = await query;
  if (error) throw error;

  const existing = new Set((data || []).map((item) => String(item.username || '').toLowerCase()));
  if (!existing.has(safeBase.toLowerCase())) {
    return safeBase;
  }

  let index = 1;
  let candidate = `${safeBase}${index}`;
  while (existing.has(candidate.toLowerCase())) {
    index += 1;
    candidate = `${safeBase}${index}`;
  }

  return candidate;
}

async function getProgramsByCode() {
  const { data, error } = await supabase
    .from('uni_programs')
    .select('code, name, account_type, manas_track, is_active');

  if (error) throw error;
  const map = new Map();
  for (const p of data || []) {
    map.set(p.code, p);
  }
  return map;
}

async function resolveProgramCode({ accountType, manasTrack, requestedProgramCode }) {
  const programs = await getProgramsByCode();

  let programCode = String(requestedProgramCode || '').trim();
  if (!programCode) {
    if (accountType === 'manas') {
      if (!manasTrack) {
        throw new Error('manasTrack is required for manas account type');
      }
      programCode = DEFAULT_PROGRAM_BY_MANAS_TRACK[manasTrack] || '';
    } else {
      programCode = DEFAULT_PROGRAM_BY_ACCOUNT[accountType] || '';
    }
  }

  if (!programCode) {
    throw new Error('Could not resolve programCode for student');
  }

  const program = programs.get(programCode);
  if (!program) {
    throw new Error(`Program ${programCode} not found`);
  }

  if (!program.is_active) {
    throw new Error(`Program ${programCode} is inactive`);
  }

  if (program.account_type !== accountType) {
    throw new Error('Program does not match account type');
  }

  if (accountType === 'manas' && program.manas_track !== manasTrack) {
    throw new Error('Program does not match manas track');
  }

  if (accountType !== 'manas' && manasTrack) {
    throw new Error('manasTrack can be set only for manas account type');
  }

  return { programCode, program };
}

async function getPrimaryProgramsByStudentIds(studentIds = []) {
  if (!studentIds.length) return new Map();

  const { data, error } = await supabase
    .from('uni_student_programs')
    .select('student_id, program_code, is_primary')
    .in('student_id', studentIds)
    .eq('is_primary', true);

  if (error) throw error;

  const programsByCode = await getProgramsByCode();
  const map = new Map();
  for (const row of data || []) {
    const program = programsByCode.get(row.program_code);
    map.set(row.student_id, {
      program_code: row.program_code,
      program_name: program?.name || row.program_code,
      program_account_type: program?.account_type || null,
      program_manas_track: program?.manas_track || null,
    });
  }

  return map;
}

function formatStudent(student, primaryProgram) {
  const accountType = student.account_type;
  const manasTrack = student.manas_track;

  return {
    id: student.id,
    fullName: student.full_name,
    accountType,
    accountTypeTitle: accountTypeTitle(accountType),
    manasTrack,
    manasTrackTitle: manasTrackTitle(manasTrack),
    programCode: primaryProgram?.program_code || null,
    programName: primaryProgram?.program_name || null,
    username: student.username,
    password: student.plain_password || '',
    createdAt: student.created_at,
    notes: student.notes || '',
    expiresAt: student.expires_at || null,
    phone: student.phone || '',
    amount: Number(student.amount || 0),
    isActive: Boolean(student.is_active),
    class: accountTypeTitle(accountType),
    language: manasTrack ? manasTrackTitle(manasTrack) : accountTypeTitle(accountType),
  };
}

function stripManasMarker(explanation) {
  if (!explanation) return '';
  return String(explanation).replace(/\[MANAS_ONLY\]/g, '').trim();
}

function deriveTagsWithManas(question) {
  const baseTags = Array.isArray(question?.tags) ? question.tags : [];
  const hasMarker = String(question?.explanation || '').includes('[MANAS_ONLY]');
  const tagSet = new Set(baseTags.map((t) => String(t).trim()).filter(Boolean));
  if (hasMarker) tagSet.add('manas_only');
  return [...tagSet];
}

function validateOptions(rawOptions) {
  const options = Array.isArray(rawOptions) ? rawOptions : [];
  if (options.length < 2) {
    return { ok: false, error: 'At least two options are required' };
  }

  const normalized = options.map((opt) => ({
    text: String(opt?.text || '').trim(),
    is_correct: Boolean(opt?.is_correct),
  }));

  if (normalized.some((opt) => !opt.text)) {
    return { ok: false, error: 'All options must have text' };
  }

  const correctCount = normalized.filter((opt) => opt.is_correct).length;
  if (correctCount !== 1) {
    return { ok: false, error: 'Exactly one option must be marked as correct' };
  }

  return { ok: true, value: normalized };
}

async function resolveSubject({ programCode, subjectCode }) {
  const normalizedCode = String(subjectCode || '').trim();
  if (!normalizedCode) throw new Error('subjectCode is required');

  const { data: subject, error: subjectError } = await supabase
    .from('uni_subjects')
    .select('id, code, title')
    .eq('code', normalizedCode)
    .maybeSingle();

  if (subjectError) throw subjectError;
  if (!subject) throw new Error(`Subject ${normalizedCode} not found`);

  if (programCode) {
    const { data: link, error: linkError } = await supabase
      .from('uni_program_subjects')
      .select('id')
      .eq('program_code', programCode)
      .eq('subject_id', subject.id)
      .maybeSingle();

    if (linkError) throw linkError;
    if (!link) throw new Error(`Subject ${normalizedCode} is not assigned to program ${programCode}`);
  }

  return subject;
}

async function resolveTemplate({ templateCode, programCode, subjectId }) {
  const normalized = String(templateCode || '').trim();
  if (!normalized) return null;

  const { data, error } = await supabase
    .from('uni_test_templates')
    .select('id, code, program_code, subject_id, title')
    .eq('code', normalized)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(`Template ${normalized} not found`);

  if (programCode && data.program_code !== programCode) {
    throw new Error(`Template ${normalized} does not belong to selected program`);
  }

  if (subjectId && data.subject_id && data.subject_id !== subjectId) {
    throw new Error(`Template ${normalized} does not belong to selected subject`);
  }

  return data;
}

function resolveQuestionTableOrThrow(subjectCode) {
  const canonicalCode = canonicalizeSubjectCode(subjectCode);
  const tableName = getQuestionTableBySubjectCode(canonicalCode || subjectCode);
  if (!canonicalCode || !tableName) {
    throw new Error(`Unsupported subjectCode for question table routing: ${subjectCode}`);
  }

  return { canonicalCode, tableName };
}

async function findQuestionByIdAcrossTables(questionId) {
  const tableNames = getAllQuestionTables();
  for (const tableName of tableNames) {
    const { data, error } = await supabase
      .from(tableName)
      .select('id, subject_id, template_id, lesson_id, question_text, options, explanation, image_url, tags, created_at')
      .eq('id', questionId)
      .maybeSingle();

    if (error) {
      if (String(error.code || '') === 'PGRST116') {
        continue;
      }
      throw error;
    }

    if (data) {
      return { tableName, question: data };
    }
  }

  return null;
}

const requireAdmin = (req, res, next) => {
  try {
    const token = parseBearerToken(req.headers.authorization);
    const payload = verifyAdminToken(token);

    if (!payload) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.admin = payload;
    return next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    return res.status(500).json({ error: 'Failed to verify admin token' });
  }
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const normalizedUsername = String(username).trim();
  const normalizedPassword = String(password);

  const fallbackUsername = process.env.ADMIN_USERNAME || 'admin';
  const fallbackPassword = process.env.ADMIN_PASSWORD || 'admin';

  if (normalizedUsername !== fallbackUsername || normalizedPassword !== fallbackPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = signAdminToken({
    sub: normalizedUsername,
    username: normalizedUsername,
  });

  return res.json({
    token,
    admin: {
      username: normalizedUsername,
    },
  });
});

router.get('/programs', requireAdmin, async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('uni_programs')
      .select('code, name, account_type, manas_track, description, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      console.error('Fetch programs error:', error);
      return res.status(500).json({ error: 'Failed to fetch programs' });
    }

    return res.json({ programs: data || [] });
  } catch (error) {
    console.error('Get programs error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/students', requireAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const accountType = normalizeAccountType(req.query.accountType);
    const programCode = String(req.query.programCode || '').trim();

    let query = supabase
      .from('uni_students')
      .select('id, full_name, account_type, manas_track, username, plain_password, created_at, notes, expires_at, phone, amount, is_active')
      .order('created_at', { ascending: false });

    if (accountType) {
      if (!ACCOUNT_TYPES.includes(accountType)) {
        return res.status(400).json({ error: 'Invalid accountType' });
      }
      query = query.eq('account_type', accountType);
    }

    if (search) {
      query = query.or(`full_name.ilike.%${search}%,username.ilike.%${search}%`);
    }

    const { data: students, error } = await query;
    if (error) {
      console.error('Fetch students error:', error);
      return res.status(500).json({ error: 'Failed to fetch students' });
    }

    const studentIds = (students || []).map((s) => s.id);
    const programsByStudentId = await getPrimaryProgramsByStudentIds(studentIds);

    let mapped = (students || []).map((student) =>
      formatStudent(student, programsByStudentId.get(student.id)),
    );

    if (programCode) {
      mapped = mapped.filter((student) => student.programCode === programCode);
    }

    return res.json({ students: mapped });
  } catch (error) {
    console.error('Get students error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/students', requireAdmin, async (req, res) => {
  try {
    const {
      fullName,
      accountType: rawAccountType,
      manasTrack: rawManasTrack,
      programCode: rawProgramCode,
      username: rawUsername,
      password: rawPassword,
      phone: rawPhone,
      amount: rawAmount,
    } = req.body || {};

    const fullNameNormalized = String(fullName || '').trim();
    const accountType = normalizeAccountType(rawAccountType);
    const manasTrack = normalizeManasTrack(rawManasTrack);

    if (!fullNameNormalized) {
      return res.status(400).json({ error: 'fullName is required' });
    }

    if (!ACCOUNT_TYPES.includes(accountType)) {
      return res.status(400).json({ error: 'accountType must be ort, medical or manas' });
    }

    if (accountType === 'manas' && (!manasTrack || !MANAS_TRACKS.includes(manasTrack))) {
      return res.status(400).json({ error: 'manasTrack is required for manas account type' });
    }

    if (accountType !== 'manas' && manasTrack) {
      return res.status(400).json({ error: 'manasTrack allowed only for manas account type' });
    }

    const { programCode } = await resolveProgramCode({
      accountType,
      manasTrack,
      requestedProgramCode: rawProgramCode,
    });

    const candidateBaseUsername = rawUsername
      ? toSafeUsernamePart(rawUsername)
      : generateBaseUsername(fullNameNormalized);

    const username = await ensureUniqueUsername(candidateBaseUsername);
    const password = String(rawPassword ?? '').trim() || generatePasswordForUsername(username);
    const phone = String(rawPhone || '').trim();
    const amount = rawAmount === undefined || rawAmount === null || rawAmount === '' ? 0 : Number(rawAmount);

    if (!Number.isFinite(amount)) {
      return res.status(400).json({ error: 'amount must be a valid number' });
    }

    const { data: createdStudent, error: createError } = await supabase
      .from('uni_students')
      .insert({
        full_name: fullNameNormalized,
        account_type: accountType,
        manas_track: manasTrack,
        username,
        password_hash: hashPassword(password),
        plain_password: password,
        phone,
        amount,
      })
      .select('id, full_name, account_type, manas_track, username, plain_password, created_at, notes, expires_at, phone, amount, is_active')
      .single();

    if (createError || !createdStudent) {
      console.error('Create uni student error:', createError);
      return res.status(500).json({ error: 'Failed to create student' });
    }

    const { error: linkError } = await supabase
      .from('uni_student_programs')
      .insert({
        student_id: createdStudent.id,
        program_code: programCode,
        is_primary: true,
      });

    if (linkError) {
      console.error('Create uni student_program link error:', linkError);
      await supabase.from('uni_students').delete().eq('id', createdStudent.id);
      return res.status(500).json({ error: 'Failed to link student program' });
    }

    const programsByStudentId = await getPrimaryProgramsByStudentIds([createdStudent.id]);

    return res.status(201).json({
      student: formatStudent(createdStudent, programsByStudentId.get(createdStudent.id)),
    });
  } catch (error) {
    console.error('Create student error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.patch('/students/:id', requireAdmin, async (req, res) => {
  try {
    const studentId = String(req.params.id || '').trim();
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const {
      fullName,
      accountType: rawAccountType,
      manasTrack: rawManasTrack,
      programCode: rawProgramCode,
      username: rawUsername,
      password: rawPassword,
      notes: rawNotes,
      phone: rawPhone,
      amount: rawAmount,
      isActive,
    } = req.body || {};

    const { data: currentStudent, error: currentError } = await supabase
      .from('uni_students')
      .select('id, full_name, account_type, manas_track, username, plain_password, created_at, notes, expires_at, phone, amount, is_active')
      .eq('id', studentId)
      .maybeSingle();

    if (currentError || !currentStudent) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const updates = {};

    if (fullName !== undefined) {
      const fullNameNormalized = String(fullName || '').trim();
      if (!fullNameNormalized) {
        return res.status(400).json({ error: 'fullName cannot be empty' });
      }
      updates.full_name = fullNameNormalized;
    }

    const nextAccountType = rawAccountType !== undefined
      ? normalizeAccountType(rawAccountType)
      : currentStudent.account_type;

    const nextManasTrack = rawManasTrack !== undefined
      ? normalizeManasTrack(rawManasTrack)
      : currentStudent.manas_track;

    if (!ACCOUNT_TYPES.includes(nextAccountType)) {
      return res.status(400).json({ error: 'accountType must be ort, medical or manas' });
    }

    if (nextAccountType === 'manas' && (!nextManasTrack || !MANAS_TRACKS.includes(nextManasTrack))) {
      return res.status(400).json({ error: 'manasTrack is required for manas account type' });
    }

    if (nextAccountType !== 'manas' && nextManasTrack) {
      return res.status(400).json({ error: 'manasTrack allowed only for manas account type' });
    }

    if (nextAccountType !== currentStudent.account_type) {
      updates.account_type = nextAccountType;
    }

    if ((nextManasTrack || null) !== (currentStudent.manas_track || null)) {
      updates.manas_track = nextManasTrack;
    }

    if (rawUsername !== undefined) {
      const usernameCandidate = toSafeUsernamePart(rawUsername);
      if (!usernameCandidate) {
        return res.status(400).json({ error: 'username cannot be empty' });
      }
      const uniqueUsername = await ensureUniqueUsername(usernameCandidate, studentId);
      updates.username = uniqueUsername;
    }

    if (rawPassword !== undefined) {
      const password = String(rawPassword || '').trim();
      if (!password) {
        return res.status(400).json({ error: 'password cannot be empty' });
      }
      updates.plain_password = password;
      updates.password_hash = hashPassword(password);
    }

    if (rawNotes !== undefined) {
      updates.notes = String(rawNotes || '');
    }

    if (rawPhone !== undefined) {
      updates.phone = String(rawPhone || '').trim();
    }

    if (rawAmount !== undefined) {
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount)) {
        return res.status(400).json({ error: 'amount must be a valid number' });
      }
      updates.amount = amount;
    }

    if (isActive !== undefined) {
      updates.is_active = Boolean(isActive);
    }

    let requestedProgramCode = rawProgramCode;
    if (requestedProgramCode === undefined && (rawAccountType !== undefined || rawManasTrack !== undefined)) {
      requestedProgramCode = '';
    }

    const { programCode } = await resolveProgramCode({
      accountType: nextAccountType,
      manasTrack: nextManasTrack,
      requestedProgramCode,
    });

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('uni_students')
        .update(updates)
        .eq('id', studentId);

      if (updateError) {
        console.error('Update uni student error:', updateError);
        return res.status(500).json({ error: 'Failed to update student' });
      }
    }

    const { data: primaryProgram, error: primaryProgramError } = await supabase
      .from('uni_student_programs')
      .select('id, program_code')
      .eq('student_id', studentId)
      .eq('is_primary', true)
      .maybeSingle();

    if (primaryProgramError) {
      console.error('Fetch primary program error:', primaryProgramError);
      return res.status(500).json({ error: 'Failed to resolve student program' });
    }

    if (!primaryProgram) {
      const { error: createProgramLinkError } = await supabase
        .from('uni_student_programs')
        .insert({
          student_id: studentId,
          program_code: programCode,
          is_primary: true,
        });

      if (createProgramLinkError) {
        console.error('Create primary program link error:', createProgramLinkError);
        return res.status(500).json({ error: 'Failed to update student program' });
      }
    } else if (primaryProgram.program_code !== programCode) {
      const { error: updateProgramLinkError } = await supabase
        .from('uni_student_programs')
        .update({ program_code: programCode })
        .eq('id', primaryProgram.id);

      if (updateProgramLinkError) {
        console.error('Update primary program link error:', updateProgramLinkError);
        return res.status(500).json({ error: 'Failed to update student program' });
      }
    }

    const { data: refreshedStudent, error: refreshedError } = await supabase
      .from('uni_students')
      .select('id, full_name, account_type, manas_track, username, plain_password, created_at, notes, expires_at, phone, amount, is_active')
      .eq('id', studentId)
      .single();

    if (refreshedError || !refreshedStudent) {
      return res.status(500).json({ error: 'Failed to reload student' });
    }

    const programsByStudentId = await getPrimaryProgramsByStudentIds([studentId]);

    return res.json({
      student: formatStudent(refreshedStudent, programsByStudentId.get(studentId)),
    });
  } catch (error) {
    console.error('Update student error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.patch('/students/:id/extend', requireAdmin, async (req, res) => {
  try {
    const studentId = String(req.params.id || '').trim();
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const { data: student, error: fetchError } = await supabase
      .from('uni_students')
      .select('id, created_at, expires_at')
      .eq('id', studentId)
      .single();

    if (fetchError || !student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const { days: rawDays } = req.body || {};
    const days = parseInt(rawDays, 10);
    if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 365) {
      return res.status(400).json({ error: 'days must be a non-zero integer between -365 and 365' });
    }

    const baseExpiry = student.expires_at
      ? new Date(student.expires_at)
      : new Date(new Date(student.created_at).getTime() + 30 * 24 * 60 * 60 * 1000);

    const newExpiry = new Date(baseExpiry.getTime() + days * 24 * 60 * 60 * 1000);

    const { error: updateError } = await supabase
      .from('uni_students')
      .update({ expires_at: newExpiry.toISOString() })
      .eq('id', studentId);

    if (updateError) {
      console.error('Extend student error:', updateError);
      return res.status(500).json({ error: 'Failed to extend student access' });
    }

    const { data: refreshed, error: refreshedError } = await supabase
      .from('uni_students')
      .select('id, full_name, account_type, manas_track, username, plain_password, created_at, notes, expires_at, phone, amount, is_active')
      .eq('id', studentId)
      .single();

    if (refreshedError || !refreshed) {
      return res.status(500).json({ error: 'Failed to reload student' });
    }

    const programsByStudentId = await getPrimaryProgramsByStudentIds([studentId]);

    return res.json({ student: formatStudent(refreshed, programsByStudentId.get(studentId)) });
  } catch (error) {
    console.error('Extend student error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/students/:id', requireAdmin, async (req, res) => {
  try {
    const studentId = String(req.params.id || '').trim();
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const { error } = await supabase
      .from('uni_students')
      .delete()
      .eq('id', studentId);

    if (error) {
      console.error('Delete student error:', error);
      return res.status(500).json({ error: 'Failed to delete student' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Delete student error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/blocked-students', requireAdmin, async (_req, res) => {
  try {
    const now = new Date().toISOString();

    const { data: permanentlyBlocked, error: permError } = await supabase
      .from('uni_students')
      .select('id, full_name, account_type, manas_track, username, plain_password, created_at, notes, expires_at, phone, amount, is_active, screenshot_strikes, blocked_until, blocked_permanently')
      .eq('blocked_permanently', true)
      .order('created_at', { ascending: false });

    if (permError) {
      console.error('Fetch permanently blocked students error:', permError);
      return res.status(500).json({ error: 'Failed to fetch blocked students' });
    }

    const { data: tempBlocked, error: tempError } = await supabase
      .from('uni_students')
      .select('id, full_name, account_type, manas_track, username, plain_password, created_at, notes, expires_at, phone, amount, is_active, screenshot_strikes, blocked_until, blocked_permanently')
      .gt('blocked_until', now)
      .or('blocked_permanently.is.null,blocked_permanently.eq.false')
      .order('created_at', { ascending: false });

    if (tempError) {
      console.error('Fetch temporary blocked students error:', tempError);
      return res.status(500).json({ error: 'Failed to fetch blocked students' });
    }

    const merged = [];
    const seen = new Set();

    for (const row of [...(permanentlyBlocked || []), ...(tempBlocked || [])]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }

    const studentIds = merged.map((s) => s.id);
    const programsByStudentId = await getPrimaryProgramsByStudentIds(studentIds);

    const students = merged.map((row) => ({
      ...formatStudent(row, programsByStudentId.get(row.id)),
      screenshotStrikes: row.screenshot_strikes || 0,
      blockedUntil: row.blocked_until || null,
      blockedPermanently: Boolean(row.blocked_permanently),
    }));

    return res.json({ students });
  } catch (error) {
    console.error('Blocked students error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/unblock-student/:id', requireAdmin, async (req, res) => {
  try {
    const studentId = String(req.params.id || '').trim();
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' });
    }

    const { error } = await supabase
      .from('uni_students')
      .update({
        blocked_until: null,
        blocked_permanently: false,
        screenshot_strikes: 0,
      })
      .eq('id', studentId);

    if (error) {
      console.error('Unblock student error:', error);
      return res.status(500).json({ error: 'Failed to unblock student' });
    }

    return res.json({ message: 'Student unblocked successfully' });
  } catch (error) {
    console.error('Unblock student error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/stats', requireAdmin, async (_req, res) => {
  try {
    const questionTables = getAllQuestionTables();
    const [
      studentsRes,
      sessionsRes,
      submittedScoresRes,
      ...questionCounts
    ] = await Promise.all([
      supabase.from('uni_students').select('*', { count: 'exact', head: true }),
      supabase.from('uni_test_sessions').select('*', { count: 'exact', head: true }),
      supabase
        .from('uni_test_sessions')
        .select('total_score')
        .eq('status', 'submitted'),
      ...questionTables.map((tableName) =>
        supabase.from(tableName).select('*', { count: 'exact', head: true }),
      ),
    ]);

    const studentsTotal = studentsRes.count || 0;
    const questionsTotal = questionCounts.reduce((sum, result) => sum + Number(result.count || 0), 0);
    const testsCompleted = sessionsRes.count || 0;

    let scoreSum = 0;
    let scoreCount = 0;
    for (const row of submittedScoresRes.data || []) {
      if (typeof row.total_score === 'number') {
        scoreSum += row.total_score;
        scoreCount += 1;
      }
    }

    const averageScore = scoreCount > 0 ? Number((scoreSum / scoreCount).toFixed(2)) : 0;

    return res.json({
      studentsTotal,
      questionsTotal,
      testsCompleted,
      averageScore,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    return res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

router.get('/content-readiness', requireAdmin, async (_req, res) => {
  try {
    const { data: programs, error: programsError } = await supabase
      .from('uni_programs')
      .select('code, name, account_type, manas_track')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (programsError) {
      console.error('Content readiness programs error:', programsError);
      return res.status(500).json({ error: 'Failed to fetch content readiness' });
    }

    const { data: links, error: linksError } = await supabase
      .from('uni_program_subjects')
      .select('program_code, subject_id');

    if (linksError) {
      console.error('Content readiness links error:', linksError);
      return res.status(500).json({ error: 'Failed to fetch content readiness' });
    }

    const { data: subjects, error: subjectsError } = await supabase
      .from('uni_subjects')
      .select('id, code, title');

    if (subjectsError) {
      console.error('Content readiness subjects error:', subjectsError);
      return res.status(500).json({ error: 'Failed to fetch content readiness' });
    }

    const subjectById = new Map((subjects || []).map((s) => [s.id, s]));

    const branchMap = new Map();
    for (const program of programs || []) {
      branchMap.set(program.code, {
        program,
        subjects: [],
      });
    }

    for (const link of links || []) {
      const branch = branchMap.get(link.program_code);
      const subject = subjectById.get(link.subject_id);
      if (!branch || !subject) continue;
      branch.subjects.push({
        id: subject.code,
        title: subject.title,
      });
    }

    return res.json({
      branches: Array.from(branchMap.values()).map((entry) => ({
        branch: {
          code: entry.program.code,
          title: entry.program.name,
          account_type: entry.program.account_type,
          manas_track: entry.program.manas_track,
        },
        subjects: entry.subjects,
      })),
    });
  } catch (error) {
    console.error('Content readiness error:', error);
    return res.status(500).json({ error: 'Failed to fetch content readiness' });
  }
});

router.post('/upload-image', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const ext = req.file.originalname.split('.').pop() || 'png';
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('question-images')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload image error:', uploadError);
      return res.status(500).json({ error: 'Failed to upload image. Ensure bucket question-images exists.' });
    }

    const { data: publicData } = supabase.storage
      .from('question-images')
      .getPublicUrl(fileName);

    return res.status(200).json({ imageUrl: publicData.publicUrl });
  } catch (error) {
    console.error('Upload image error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/questions/catalog', requireAdmin, async (_req, res) => {
  try {
    const { data: programs, error: programsError } = await supabase
      .from('uni_programs')
      .select('code, name, account_type, manas_track, is_active')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (programsError) {
      console.error('Question catalog programs error:', programsError);
      return res.status(500).json({ error: 'Failed to load question catalog' });
    }

    const { data: links, error: linksError } = await supabase
      .from('uni_program_subjects')
      .select('program_code, subject_id, sort_order')
      .order('sort_order', { ascending: true });

    if (linksError) {
      console.error('Question catalog links error:', linksError);
      return res.status(500).json({ error: 'Failed to load question catalog' });
    }

    const { data: subjects, error: subjectsError } = await supabase
      .from('uni_subjects')
      .select('id, code, title')
      .order('title', { ascending: true });

    if (subjectsError) {
      console.error('Question catalog subjects error:', subjectsError);
      return res.status(500).json({ error: 'Failed to load question catalog' });
    }

    const subjectById = new Map((subjects || []).map((subject) => [subject.id, subject]));

    const catalog = (programs || []).map((program) => {
      const dedupe = new Set();
      const programSubjects = (links || [])
        .filter((link) => link.program_code === program.code)
        .map((link) => subjectById.get(link.subject_id))
        .filter(Boolean)
        .map((subject) => {
          const canonicalCode = canonicalizeSubjectCode(subject.code);
          const tableName = getQuestionTableBySubjectCode(canonicalCode || subject.code);
          if (!canonicalCode || !tableName || dedupe.has(canonicalCode)) {
            return null;
          }
          dedupe.add(canonicalCode);
          return {
            code: canonicalCode,
            title: subject.title,
          };
        })
        .filter(Boolean);

      return {
        code: program.code,
        name: program.name,
        accountType: program.account_type,
        manasTrack: program.manas_track,
        subjects: programSubjects,
      };
    });

    return res.json({ programs: catalog });
  } catch (error) {
    console.error('Question catalog error:', error);
    return res.status(500).json({ error: 'Failed to load question catalog' });
  }
});

router.get('/videos/catalog', requireAdmin, async (_req, res) => {
  try {
    const programs = await fetchAdminVideoCatalog();
    return res.json({ programs });
  } catch (error) {
    console.error('Admin video catalog error:', error);
    return res.status(500).json({ error: 'Failed to load video catalog' });
  }
});

router.post('/videos/upload', requireAdmin, videoUpload.single('video'), async (req, res) => {
  const tempPath = req.file?.path || null;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Видеофайл не предоставлен' });
    }

    if (!isR2Configured()) {
      return res.status(503).json({ error: 'Cloudflare R2 не настроен' });
    }

    if (!isVideoDbConfigured()) {
      return res.status(503).json({ error: 'База данных видеокаталога не настроена' });
    }

    const {
      programCode: rawProgramCode,
      subjectCode: rawSubjectCode,
      lessonTitle: rawLessonTitle,
      lessonNo: rawLessonNo,
    } = req.body || {};

    const programCode = String(rawProgramCode || '').trim();
    const subjectCode = String(rawSubjectCode || '').trim();
    const lessonTitle = String(rawLessonTitle || '').trim();

    if (!programCode) {
      return res.status(400).json({ error: 'programCode обязателен' });
    }
    if (!subjectCode) {
      return res.status(400).json({ error: 'subjectCode обязателен' });
    }
    if (!lessonTitle) {
      return res.status(400).json({ error: 'lessonTitle обязателен' });
    }

    const programMeta = MANAS_PROGRAM_META[programCode];
    if (!programMeta) {
      return res.status(400).json({ error: `Программа ${programCode} не найдена` });
    }

    const subjectTitle = getSubjectTitle(subjectCode);

    const originalName = req.file.originalname;
    const ext = originalName.split('.').pop()?.toLowerCase() || 'mp4';
    const safeFilename = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const objectKey = `${programCode}/${subjectCode}/${safeFilename}`;
    const fileSizeBytes = req.file.size;

    console.log(`[Video Upload] Uploading ${originalName} (${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB) → R2 key: ${objectKey}`);

    const fileStream = createReadStream(tempPath);
    const uploadResult = await uploadVideoToR2(fileStream, objectKey, req.file.mimetype);

    const sortOrder = await getNextSortOrder(programCode, subjectCode);
    const lessonNo = rawLessonNo ? parseInt(rawLessonNo, 10) : sortOrder;
    const lessonKey = `${subjectCode}_lesson_${sortOrder}_${Date.now()}`;

    const lesson = await insertSingleVideoLesson({
      programCode,
      programTitle: programMeta.title,
      accountType: programMeta.accountType,
      manasTrack: programMeta.manasTrack,
      subjectCode,
      subjectTitle,
      lessonKey,
      lessonNo,
      sortOrder,
      lessonTitle,
      sourceFilename: originalName,
      sourceRelativePath: objectKey,
      sourceExtension: ext,
      sourceSizeBytes: fileSizeBytes,
      streamType: 'mp4',
      storageProvider: 'r2',
      playbackUrl: uploadResult.publicUrl,
      mp4Url: uploadResult.publicUrl,
      isPublished: true,
      meta: { uploadedBy: req.admin?.username || 'admin', uploadedAt: new Date().toISOString() },
    });

    console.log(`[Video Upload] Success: ${lesson.id} — ${lessonTitle}`);

    return res.status(201).json({ lesson });
  } catch (error) {
    console.error('Video upload error:', error);
    return res.status(500).json({ error: error.message || 'Ошибка загрузки видео' });
  } finally {
    if (tempPath) {
      unlink(tempPath).catch((err) => console.error('[Video Upload] Temp file cleanup failed:', err));
    }
  }
});

router.delete('/videos/:id', requireAdmin, async (req, res) => {
  try {
    const lessonId = String(req.params.id || '').trim();
    if (!lessonId) {
      return res.status(400).json({ error: 'ID видеоурока обязателен' });
    }

    const existingRow = await findVideoLessonById(lessonId);
    if (!existingRow) {
      return res.status(404).json({ error: 'Видеоурок не найден' });
    }

    // Try to delete from R2 if it's stored there
    if (existingRow.storage_provider === 'r2' && existingRow.source_relative_path) {
      const r2Key = toR2ObjectKey(existingRow.source_relative_path);
      if (r2Key && isR2Configured()) {
        try {
          await deleteVideoFromR2(r2Key);
          console.log(`[Video Delete] Deleted R2 object: ${r2Key}`);
        } catch (r2Error) {
          console.error(`[Video Delete] R2 delete failed for ${r2Key}:`, r2Error);
          // Continue with DB delete even if R2 fails
        }
      }
    }

    await deleteVideoLessonById(lessonId);
    console.log(`[Video Delete] Deleted video lesson: ${lessonId}`);

    return res.status(204).send();
  } catch (error) {
    console.error('Video delete error:', error);
    return res.status(500).json({ error: error.message || 'Ошибка удаления видео' });
  }
});

router.get('/questions', requireAdmin, async (req, res) => {
  try {
    const programCode = String(req.query.programCode || '').trim();
    const subjectCode = String(req.query.subjectCode || '').trim();
    const search = String(req.query.search || '').trim();

    if (!programCode) {
      return res.status(400).json({ error: 'programCode is required' });
    }

    if (!subjectCode) {
      return res.status(400).json({ error: 'subjectCode is required' });
    }

    const subject = await resolveSubject({ programCode, subjectCode });
    const { canonicalCode, tableName } = resolveQuestionTableOrThrow(subject.code);

    let query = supabase
      .from(tableName)
      .select('id, subject_id, template_id, lesson_id, question_text, options, explanation, image_url, tags, created_at')
      .eq('subject_id', subject.id)
      .order('created_at', { ascending: false });

    const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    const looksLikeUuidPrefix = /^[0-9a-fA-F-]{4,}$/.test(search) && /[-]/.test(search);
    let postFilterByOptions = '';
    if (search) {
      if (uuidPattern.test(search)) {
        query = query.eq('id', search);
      } else if (looksLikeUuidPrefix) {
        // Промежуточный частичный UUID — точечного фильтра нет, ждём полный ввод.
        // Возвращаем пусто и не нагружаем БД полным сканированием options.
        return res.json({ questions: [], table: tableName, total: 0 });
      } else {
        const safe = search.replace(/[(),]/g, ' ');
        query = query.or(`question_text.ilike.%${safe}%,explanation.ilike.%${safe}%`);
        postFilterByOptions = search.toLowerCase();
      }
    }

    const { data: questions, error } = await query;
    if (error) {
      console.error('Fetch questions error:', error);
      return res.status(500).json({ error: 'Failed to fetch questions' });
    }

    // PostgREST не умеет ilike по jsonb-полю через `or`, поэтому поиск
    // по тексту вариантов делаем in-memory: добираем строки, чей options
    // содержит подстроку, и объединяем с уже найденными по тексту/пояснению.
    let combined = questions || [];
    if (postFilterByOptions) {
      const { data: allRows, error: allErr } = await supabase
        .from(tableName)
        .select('id, subject_id, template_id, lesson_id, question_text, options, explanation, image_url, tags, created_at')
        .eq('subject_id', subject.id);
      if (allErr) {
        console.error('Fetch questions (options scan) error:', allErr);
        return res.status(500).json({ error: 'Failed to scan options for search' });
      }
      const matchedIds = new Set(combined.map((q) => q.id));
      const needle = postFilterByOptions;
      for (const row of allRows || []) {
        if (matchedIds.has(row.id)) continue;
        const opts = Array.isArray(row.options) ? row.options : [];
        const inOpts = opts.some((o) => String(o?.text || '').toLowerCase().includes(needle));
        if (inOpts) {
          combined.push(row);
          matchedIds.add(row.id);
        }
      }
      combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    const templateIds = [...new Set(combined.map((q) => q.template_id).filter(Boolean))];
    const { data: templates, error: templatesError } = templateIds.length
      ? await supabase
        .from('uni_test_templates')
        .select('id, code, title, program_code')
        .in('id', templateIds)
      : { data: [], error: null };

    if (templatesError) {
      console.error('Fetch question templates error:', templatesError);
      return res.status(500).json({ error: 'Failed to enrich questions' });
    }

    const templateById = new Map((templates || []).map((t) => [t.id, t]));
    const programMap = await getProgramsByCode();

    const mapped = combined.map((question) => {
      const template = templateById.get(question.template_id);
      const templateProgramCode = template?.program_code || programCode;
      const program = programMap.get(templateProgramCode);

      return {
        id: question.id,
        question_text: question.question_text,
        options: Array.isArray(question.options) ? question.options : [],
        explanation: stripManasMarker(question.explanation),
        image_url: question.image_url || '',
        created_at: question.created_at,
        tags: deriveTagsWithManas(question),
        subject_code: canonicalCode,
        subject_title: subject.title,
        template_code: template?.code || null,
        template_title: template?.title || null,
        program_code: templateProgramCode,
        program_name: program?.name || templateProgramCode,
      };
    });

    return res.json({
      questions: mapped,
      table: tableName,
      total: mapped.length,
    });
  } catch (error) {
    console.error('Get questions error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.post('/questions', requireAdmin, async (req, res) => {
  try {
    const {
      programCode,
      subjectCode,
      templateCode,
      lessonId,
      questionText,
      options,
      explanation,
      imageUrl,
      tags,
    } = req.body || {};

    const normalizedProgramCode = String(programCode || '').trim();
    if (!normalizedProgramCode) {
      return res.status(400).json({ error: 'programCode is required' });
    }

    const subject = await resolveSubject({
      programCode: normalizedProgramCode,
      subjectCode,
    });
    const { canonicalCode, tableName } = resolveQuestionTableOrThrow(subject.code);

    const normalizedText = String(questionText || '').trim();
    if (!normalizedText) {
      return res.status(400).json({ error: 'Question text is required' });
    }

    const parsedOptions = validateOptions(options);
    if (!parsedOptions.ok) {
      return res.status(400).json({ error: parsedOptions.error });
    }

    const template = await resolveTemplate({
      templateCode,
      programCode: normalizedProgramCode,
      subjectId: subject.id,
    });

    const normalizedExplanation = stripManasMarker(explanation);
    const normalizedImageUrl = String(imageUrl || '').trim();
    const normalizedTags = Array.isArray(tags)
      ? [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))]
      : [];

    const { data, error } = await supabase
      .from(tableName)
      .insert({
        subject_id: subject.id,
        template_id: template?.id || null,
        lesson_id: lessonId || null,
        question_text: normalizedText,
        options: parsedOptions.value,
        explanation: normalizedExplanation,
        image_url: normalizedImageUrl,
        tags: normalizedTags,
      })
      .select('id, subject_id, template_id, lesson_id, question_text, options, explanation, image_url, tags, created_at')
      .single();

    if (error || !data) {
      console.error('Insert question error:', error);
      return res.status(500).json({ error: 'Failed to insert question' });
    }

    return res.status(201).json({
      message: 'Question added successfully',
      question: {
        ...data,
        subject_code: canonicalCode,
        subject_title: subject.title,
        template_code: template?.code || null,
        template_title: template?.title || null,
        program_code: normalizedProgramCode,
      },
    });
  } catch (error) {
    console.error('Add question error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.patch('/questions/:id', requireAdmin, async (req, res) => {
  try {
    const questionId = String(req.params.id || '').trim();
    if (!questionId) {
      return res.status(400).json({ error: 'Question ID is required' });
    }

    const found = await findQuestionByIdAcrossTables(questionId);
    if (!found) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const {
      programCode,
      subjectCode,
      templateCode,
      lessonId,
      questionText,
      options,
      explanation,
      imageUrl,
      tags,
    } = req.body || {};

    const updates = {};
    let resolvedSubject = null;
    let targetTableName = found.tableName;

    if (subjectCode !== undefined) {
      resolvedSubject = await resolveSubject({
        programCode: String(programCode || '').trim() || null,
        subjectCode,
      });
      const subjectRouting = resolveQuestionTableOrThrow(resolvedSubject.code);
      targetTableName = subjectRouting.tableName;
      if (targetTableName !== found.tableName) {
        return res.status(400).json({ error: 'Changing subject table is not supported for update. Delete and recreate question.' });
      }
      updates.subject_id = resolvedSubject.id;
    }

    if (questionText !== undefined) {
      const normalizedText = String(questionText || '').trim();
      if (!normalizedText) {
        return res.status(400).json({ error: 'Question text cannot be empty' });
      }
      updates.question_text = normalizedText;
    }

    if (options !== undefined) {
      const parsedOptions = validateOptions(options);
      if (!parsedOptions.ok) {
        return res.status(400).json({ error: parsedOptions.error });
      }
      updates.options = parsedOptions.value;
    }

    if (explanation !== undefined) {
      updates.explanation = stripManasMarker(explanation);
    }

    if (imageUrl !== undefined) {
      updates.image_url = String(imageUrl || '').trim();
    }

    if (tags !== undefined) {
      updates.tags = Array.isArray(tags)
        ? [...new Set(tags.map((tag) => String(tag).trim()).filter(Boolean))]
        : [];
    }

    if (lessonId !== undefined) {
      updates.lesson_id = lessonId || null;
    }

    if (templateCode !== undefined) {
      const template = await resolveTemplate({
        templateCode,
        programCode: String(programCode || '').trim() || null,
        subjectId: resolvedSubject?.id || found.question.subject_id || null,
      });
      updates.template_id = template?.id || null;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    const { data, error } = await supabase
      .from(targetTableName)
      .update(updates)
      .eq('id', questionId)
      .select('id, subject_id, template_id, lesson_id, question_text, options, explanation, image_url, tags, created_at')
      .single();

    if (error || !data) {
      console.error('Update question error:', error);
      return res.status(500).json({ error: 'Failed to update question' });
    }

    return res.json({ question: data });
  } catch (error) {
    console.error('Patch question error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

router.delete('/questions/:id', requireAdmin, async (req, res) => {
  try {
    const questionId = String(req.params.id || '').trim();
    if (!questionId) {
      return res.status(400).json({ error: 'Question ID is required' });
    }

    const found = await findQuestionByIdAcrossTables(questionId);
    if (!found) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const { error } = await supabase
      .from(found.tableName)
      .delete()
      .eq('id', questionId);

    if (error) {
      console.error('Delete question error:', error);
      return res.status(500).json({ error: 'Failed to delete question' });
    }

    return res.status(204).send();
  } catch (error) {
    console.error('Delete question error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
