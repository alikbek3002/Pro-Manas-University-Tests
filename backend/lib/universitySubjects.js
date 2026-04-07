const SUBJECTS = {
  math: {
    code: 'math',
    titleRu: 'Математика',
    titleKg: 'Математика',
    table: 'uni_questions_math',
    aliases: ['math', 'mathematics', 'ort_math', 'manas_exact_subj_1'],
  },
  russian: {
    code: 'russian',
    titleRu: 'Русский язык',
    titleKg: 'Орус тили',
    table: 'uni_questions_russian',
    aliases: ['russian', 'rus', 'ort_grammar', 'ort_reading', 'manas_hum_subj_1'],
  },
  physics: {
    code: 'physics',
    titleRu: 'Физика',
    titleKg: 'Физика',
    table: 'uni_questions_physics',
    aliases: ['physics', 'phys', 'manas_exact_subj_2'],
  },
  chemistry: {
    code: 'chemistry',
    titleRu: 'Химия',
    titleKg: 'Химия',
    table: 'uni_questions_chemistry',
    aliases: ['chemistry', 'chem', 'med_chemistry', 'manas_exact_subj_3'],
  },
  biology: {
    code: 'biology',
    titleRu: 'Биология',
    titleKg: 'Биология',
    table: 'uni_questions_biology',
    aliases: ['biology', 'bio', 'med_biology', 'manas_exact_subj_4'],
  },
  kyrgyz_language: {
    code: 'kyrgyz_language',
    titleRu: 'Кыргызский язык',
    titleKg: 'Кыргыз тили',
    table: 'uni_questions_kyrgyz_lang',
    aliases: ['kyrgyz_language', 'kyrgyz_lang', 'kyrgyz', 'manas_hum_subj_2'],
  },
  kyrgyz_literature: {
    code: 'kyrgyz_literature',
    titleRu: 'Кыргыз адабият',
    titleKg: 'Кыргыз адабият',
    table: 'uni_questions_kyrgyz_literature',
    aliases: ['kyrgyz_literature', 'kyrgyz_lit', 'kyrgyz_adabiyat', 'manas_hum_subj_3'],
  },
  history: {
    code: 'history',
    titleRu: 'История',
    titleKg: 'Тарых',
    table: 'uni_questions_history',
    aliases: ['history', 'hist', 'ort_analogy', 'manas_hum_subj_4'],
  },
  geography: {
    code: 'geography',
    titleRu: 'География',
    titleKg: 'География',
    table: 'uni_questions_geography',
    aliases: ['geography', 'geo', 'manas_hum_subj_5'],
  },
  english: {
    code: 'english',
    titleRu: 'Английский язык',
    titleKg: 'Англис тили',
    table: 'uni_questions_english',
    aliases: ['english', 'eng', 'manas_hum_subj_6', 'manas_exact_subj_5'],
  },
};

const aliasToCanonical = new Map();
for (const subject of Object.values(SUBJECTS)) {
  aliasToCanonical.set(subject.code, subject.code);
  for (const alias of subject.aliases) {
    aliasToCanonical.set(String(alias).trim().toLowerCase(), subject.code);
  }
}

function canonicalizeSubjectCode(rawCode) {
  const normalized = String(rawCode || '').trim().toLowerCase();
  if (!normalized) return null;
  return aliasToCanonical.get(normalized) || null;
}

function getSubjectConfig(rawCode) {
  const canonical = canonicalizeSubjectCode(rawCode);
  if (!canonical) return null;
  return SUBJECTS[canonical] || null;
}

function getQuestionTableBySubjectCode(rawCode) {
  return getSubjectConfig(rawCode)?.table || null;
}

function getAllQuestionTables() {
  return Object.values(SUBJECTS).map((subject) => subject.table);
}

function isKnownSubjectCode(rawCode) {
  return Boolean(canonicalizeSubjectCode(rawCode));
}

module.exports = {
  SUBJECTS,
  canonicalizeSubjectCode,
  getSubjectConfig,
  getQuestionTableBySubjectCode,
  getAllQuestionTables,
  isKnownSubjectCode,
};
