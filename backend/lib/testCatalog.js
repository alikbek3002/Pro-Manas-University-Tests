const SUBJECTS = ['history', 'english', 'russian', 'kyrgyz', 'mathlogic'];
const LANGUAGES = ['ru', 'kg'];
const QUESTION_GRADES = [5, 6, 7];
const MATHLOGIC_GRADES = [6, 7];
const STUDENT_GRADES = [6, 7];
const MAIN_QUESTIONS_PER_GRADE = 125;
const MAIN_TEST_PARTS = 5;
const TEST_TYPES = ['MAIN', 'TRIAL'];
const QUESTION_COUNTS_CACHE_TTL_MS = Number(process.env.QUESTION_COUNTS_CACHE_TTL_MS || 5 * 60_000);

const questionCountsCache = {
  value: null,
  expiresAt: 0,
  inflight: null,
  version: 0,
};

const SUBJECT_META = {
  history: { ru: 'История', kg: 'Тарых' },
  english: { ru: 'Английский язык', kg: 'Англис тили' },
  russian: { ru: 'Русский язык', kg: 'Орус тили' },
  kyrgyz: { ru: 'Кыргызский язык', kg: 'Кыргыз тили' },
  mathlogic: { ru: 'Математика и Логика', kg: 'Математика жана Логика' },
};

// For trial tests we still display math and logic separately in the UI,
// but they come from the same unified mathlogic table filtered by question_type.
const MATH_LOGIC_META = {
  math: { ru: 'Математика', kg: 'Математика' },
  logic: { ru: 'Логика', kg: 'Логика' },
};

// Trial structure uses virtual subjects 'math' and 'logic' that map to the mathlogic table.
// For grade 6: all questions from grade 6 only (prev=0, curr=all)
// For grade 7: mix of grade 6 and 7 (prev + curr)
function getTrialStructure(studentGrade) {
  if (studentGrade === 6) {
    return {
      1: {
        title: {
          ru: '1-2 тур (75 вопросов)',
          kg: '1-2 тур суроолору (75 суроо)',
        },
        subjects: [
          {
            id: 'mathlogic',
            isCombo: true,
            total: 40,
            parts: [
              { id: 'math', table: 'mathlogic', questionType: 'math', prev: 0, curr: 25 },
              { id: 'logic', table: 'mathlogic', questionType: 'logic', prev: 0, curr: 15 }
            ]
          },
          { id: 'kyrgyz', total: 15, prev: 7, curr: 8 },
          { id: 'russian', total: 10, prev: 5, curr: 5 },
          { id: 'history', total: 10, prev: 5, curr: 5 },
        ],
      },
      3: {
        title: {
          ru: '3 тур (80 вопросов)',
          kg: '3 тур суроолору (80 суроо)',
        },
        subjects: [
          {
            id: 'mathlogic',
            isCombo: true,
            total: 40,
            parts: [
              { id: 'math', table: 'mathlogic', questionType: 'math', prev: 0, curr: 25 },
              { id: 'logic', table: 'mathlogic', questionType: 'logic', prev: 0, curr: 15 }
            ]
          },
          { id: 'kyrgyz', total: 20, prev: 10, curr: 10 },
          { id: 'english', total: 20, prev: 10, curr: 10 },
        ],
      },
    };
  }

  // Grade 7: mix of 6 and 7
  return {
    1: {
      title: {
        ru: '1-2 тур (75 вопросов)',
        kg: '1-2 тур суроолору (75 суроо)',
      },
      subjects: [
        {
          id: 'mathlogic',
          isCombo: true,
          total: 40,
          parts: [
            { id: 'math', table: 'mathlogic', questionType: 'math', prev: 12, curr: 13 },
            { id: 'logic', table: 'mathlogic', questionType: 'logic', prev: 7, curr: 8 }
          ]
        },
        { id: 'kyrgyz', total: 15, prev: 7, curr: 8 },
        { id: 'russian', total: 10, prev: 5, curr: 5 },
        { id: 'history', total: 10, prev: 5, curr: 5 },
      ],
    },
    3: {
      title: {
        ru: '3 тур (80 вопросов)',
        kg: '3 тур суроолору (80 суроо)',
      },
      subjects: [
        {
          id: 'mathlogic',
          isCombo: true,
          total: 40,
          parts: [
            { id: 'math', table: 'mathlogic', questionType: 'math', prev: 12, curr: 13 },
            { id: 'logic', table: 'mathlogic', questionType: 'logic', prev: 7, curr: 8 }
          ]
        },
        { id: 'kyrgyz', total: 20, prev: 10, curr: 10 },
        { id: 'english', total: 20, prev: 10, curr: 10 },
      ],
    },
  };
}

function normalizeLanguage(language) {
  return String(language || '').trim().toLowerCase();
}

function localizeText(language, ruText, kgText) {
  return normalizeLanguage(language) === 'kg' ? kgText : ruText;
}

function getSubjectName(subjectId, language) {
  // Handle virtual trial subjects math/logic
  if (MATH_LOGIC_META[subjectId]) {
    return MATH_LOGIC_META[subjectId][normalizeLanguage(language)] || subjectId;
  }
  return SUBJECT_META[subjectId]?.[normalizeLanguage(language)] || subjectId;
}

function getBranchTitle(language) {
  return localizeText(language, 'Русский класс', 'Кыргызский класс');
}

function getTestTypeTitle(type, language) {
  if (String(type || '').toUpperCase() === 'TRIAL') {
    return localizeText(language, 'Сынамык тест', 'Сынамык тест');
  }

  return localizeText(language, 'Предметный тест', 'Предметтик тест');
}

function buildQuestionTableName(subject, language, grade) {
  const normLang = subject === 'mathlogic' ? 'ru' : normalizeLanguage(language);
  return `questions_${subject}_${normLang}_${grade}`;
}

function buildResultTableName(type, language, grade) {
  return `results_${String(type || '').toLowerCase()}_${normalizeLanguage(language)}_${grade}`;
}

function getMainGradeLineLabel(language, grade, requiredCount) {
  return localizeText(
    language,
    `${grade} класс → ${requiredCount} вопросов`,
    `${grade} класс → ${requiredCount} суроо`,
  );
}

function getTrialGradeLineLabel(language, grade, requiredCount) {
  return localizeText(
    language,
    `${grade} класс → ${requiredCount} вопросов`,
    `${grade} класстан → ${requiredCount} суроо`,
  );
}

function getTrialSubjectLabel(language, subjectId, totalCount) {
  return localizeText(
    language,
    `${getSubjectName(subjectId, language)} — ${totalCount} вопросов`,
    `${getSubjectName(subjectId, language)} — ${totalCount} суроо`,
  );
}

function getCountKey(subject, language, grade) {
  return buildQuestionTableName(subject, language, grade);
}

function invalidateQuestionCountsCache() {
  questionCountsCache.version += 1;
  questionCountsCache.value = null;
  questionCountsCache.expiresAt = 0;
  questionCountsCache.inflight = null;
}

// Returns counts for all question tables, including mathlogic split by question_type
async function loadQuestionCountsFresh(supabase) {
  // Regular subjects (non-mathlogic)
  const regularSubjects = ['history', 'english', 'russian', 'kyrgyz'];
  const regularTableNames = regularSubjects.flatMap((subject) =>
    LANGUAGES.flatMap((language) =>
      QUESTION_GRADES.map((grade) => buildQuestionTableName(subject, language, grade)),
    ),
  );

  // Mathlogic tables (only grades 6, 7)
  const mathlogicTableNames = LANGUAGES.flatMap((language) =>
    MATHLOGIC_GRADES.map((grade) => buildQuestionTableName('mathlogic', language, grade)),
  );

  const allTableNames = [...new Set([...regularTableNames, ...mathlogicTableNames])];

  const results = await Promise.all(
    allTableNames.map(async (tableName) => {
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });

      if (error) {
        console.error(`Error counting table ${tableName}:`, error.message);
        throw new Error(`Failed to count table ${tableName}: ${error.message}`);
      }

      return [tableName, count || 0];
    }),
  );

  const countsByTable = Object.fromEntries(results);

  // Also load math/logic type counts from mathlogic tables
  const processedMathlogicTables = new Set();
  for (const language of LANGUAGES) {
    for (const grade of MATHLOGIC_GRADES) {
      const tableName = buildQuestionTableName('mathlogic', language, grade);
      if (processedMathlogicTables.has(tableName)) continue;
      processedMathlogicTables.add(tableName);

      for (const qType of ['math', 'logic']) {
        const { count, error } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
          .eq('question_type', qType);

        if (error) {
          console.error(`Error counting mathlogic table ${tableName} type ${qType}:`, error.message);
          throw new Error(`Failed to count mathlogic table ${tableName}: ${error.message}`);
        }

        const key = `${tableName}__${qType}`;
        countsByTable[key] = count || 0;
      }
    }
  }

  return countsByTable;
}

async function loadQuestionCounts(supabase, options = {}) {
  const { forceRefresh = false } = options;
  const now = Date.now();

  if (!forceRefresh && questionCountsCache.value && questionCountsCache.expiresAt > now) {
    return questionCountsCache.value;
  }

  if (!forceRefresh && questionCountsCache.inflight) {
    return questionCountsCache.inflight;
  }

  const cacheVersion = questionCountsCache.version;
  const nextLoad = loadQuestionCountsFresh(supabase)
    .then((countsByTable) => {
      if (questionCountsCache.version === cacheVersion) {
        questionCountsCache.value = countsByTable;
        questionCountsCache.expiresAt = Date.now() + QUESTION_COUNTS_CACHE_TTL_MS;
      }
      return countsByTable;
    })
    .finally(() => {
      if (questionCountsCache.inflight === nextLoad) {
        questionCountsCache.inflight = null;
      }
    });

  questionCountsCache.inflight = nextLoad;
  return nextLoad;
}

// Get count for a mathlogic table filtered by question_type
function getMathLogicCount(countsByTable, language, grade, questionType) {
  const tableName = buildQuestionTableName('mathlogic', language, grade);
  return countsByTable[`${tableName}__${questionType}`] || 0;
}

function getMainQuestionsPerPart(availableCount) {
  return Math.floor(Number(availableCount || 0) / MAIN_TEST_PARTS);
}

function getMainUsableQuestionTotal(availableCount) {
  return getMainQuestionsPerPart(availableCount) * MAIN_TEST_PARTS;
}

function buildMainLine(language, grade, availableCount) {
  const partQuestionCount = getMainQuestionsPerPart(availableCount);
  const usableQuestionTotal = getMainUsableQuestionTotal(availableCount);

  return {
    grade,
    required: MAIN_QUESTIONS_PER_GRADE,
    available: availableCount,
    label: getMainGradeLineLabel(language, grade, MAIN_QUESTIONS_PER_GRADE),
    part_count: MAIN_TEST_PARTS,
    part_question_count: partQuestionCount,
    usable_question_total: usableQuestionTotal,
  };
}

function buildMainSubjects(grade, language, countsByTable) {
  const prevGrade = grade - 1;
  const regularSubjects = ['history', 'english', 'russian', 'kyrgyz', 'mathlogic'];

  const items = [];

  // All subjects including mathlogic (which will just pull from both types randomly for the whole 125 limit)
  for (const subjectId of regularSubjects) {
    // Mathlogic is only for grades 6 and 7
    if (subjectId === 'mathlogic' && grade < 6) continue;

    const prevAvailable = countsByTable[getCountKey(subjectId, language, prevGrade)] || 0;
    const currentAvailable = countsByTable[getCountKey(subjectId, language, grade)] || 0;

    let lines = [];
    if (subjectId === 'mathlogic' && grade === 6) {
      // Only current grade (6) for mathlogic
      lines = [
        buildMainLine(language, grade, currentAvailable),
      ];
    } else {
      lines = [
        buildMainLine(language, prevGrade, prevAvailable),
        buildMainLine(language, grade, currentAvailable),
      ];
    }

    const status = lines.every((line) => line.available >= line.required) ? 'ready' : 'locked';

    items.push({
      id: subjectId,
      title: getSubjectName(subjectId, language),
      ...(subjectId === 'mathlogic' ? { subject_table: 'mathlogic' } : {}),
      required_total: lines.reduce((sum, line) => sum + line.required, 0),
      available_total: lines.reduce((sum, line) => sum + line.available, 0),
      status,
      lines,
    });
  }

  return items;
}

function buildTrialRounds(grade, language, countsByTable) {
  const prevGrade = grade - 1;
  const trialStructure = getTrialStructure(grade);

  return Object.entries(trialStructure).map(([roundKey, config]) => {
    const subjects = config.subjects.map((subjectConfig) => {
      let lines;

      if (subjectConfig.isCombo) {
        let totalPrevAvailable = 0;
        let totalCurrAvailable = 0;
        let totalPrevRequired = 0;
        let totalCurrRequired = 0;

        const internalParts = [];

        for (const part of subjectConfig.parts) {
          totalPrevRequired += part.prev;
          totalCurrRequired += part.curr;
          const partPrevAvail = getMathLogicCount(countsByTable, language, prevGrade, part.questionType);
          const partCurrAvail = getMathLogicCount(countsByTable, language, grade, part.questionType);
          totalPrevAvailable += partPrevAvail;
          totalCurrAvailable += partCurrAvail;

          internalParts.push({
            subject: part.id,
            table: part.table,
            questionType: part.questionType,
            prev: part.prev,
            curr: part.curr,
            prevAvail: partPrevAvail,
            currAvail: partCurrAvail
          });
        }

        if (totalPrevRequired === 0) {
          lines = [
            { grade, required: totalCurrRequired, available: totalCurrAvailable, label: getTrialGradeLineLabel(language, grade, totalCurrRequired) }
          ];
        } else {
          lines = [
            { grade: prevGrade, required: totalPrevRequired, available: totalPrevAvailable, label: getTrialGradeLineLabel(language, prevGrade, totalPrevRequired) },
            { grade, required: totalCurrRequired, available: totalCurrAvailable, label: getTrialGradeLineLabel(language, grade, totalCurrRequired) }
          ]
        }

        const isReady = internalParts.every(p => p.prevAvail >= p.prev && p.currAvail >= p.curr);

        return {
          id: subjectConfig.id,
          title: getTrialSubjectLabel(language, subjectConfig.id, subjectConfig.total),
          display_name: getSubjectName(subjectConfig.id, language),
          required_total: subjectConfig.total,
          available_total: lines.reduce((sum, line) => sum + Math.min(line.available, line.required), 0),
          status: isReady ? 'ready' : 'locked',
          lines,
          fetch_parts: internalParts
        };
      } else {
        // Regular subjects
        const prevAvailable = countsByTable[getCountKey(subjectConfig.id, language, prevGrade)] || 0;
        const currentAvailable = countsByTable[getCountKey(subjectConfig.id, language, grade)] || 0;
        lines = [
          {
            grade: prevGrade,
            required: subjectConfig.prev,
            available: prevAvailable,
            label: getTrialGradeLineLabel(language, prevGrade, subjectConfig.prev),
          },
          {
            grade,
            required: subjectConfig.curr,
            available: currentAvailable,
            label: getTrialGradeLineLabel(language, grade, subjectConfig.curr),
          },
        ];
      }

      const status = lines.every((line) => line.available >= line.required) ? 'ready' : 'locked';

      return {
        id: subjectConfig.id,
        title: getTrialSubjectLabel(language, subjectConfig.id, subjectConfig.total),
        display_name: getSubjectName(subjectConfig.id, language),
        required_total: subjectConfig.total,
        available_total: lines.reduce((sum, line) => sum + Math.min(line.available, line.required), 0),
        status,
        lines,
        // Pass through extra info for test generation
        ...(subjectConfig.table ? { subject_table: subjectConfig.table, question_type: subjectConfig.questionType } : {}),
      };
    });

    return {
      id: Number(roundKey),
      title: config.title[normalizeLanguage(language)],
      required_total: subjects.reduce((sum, subject) => sum + subject.required_total, 0),
      available_total: subjects.reduce(
        (sum, subject) => sum + Math.min(subject.available_total, subject.required_total),
        0,
      ),
      status: subjects.every((subject) => subject.status === 'ready') ? 'ready' : 'locked',
      subjects,
    };
  });
}

function buildStudentCatalog(student, countsByTable) {
  const grade = Number(student.grade);
  const language = normalizeLanguage(student.language);
  const mainSubjects = buildMainSubjects(grade, language, countsByTable);
  const trialRounds = buildTrialRounds(grade, language, countsByTable);

  return {
    student: {
      id: student.id,
      fullName: student.full_name || student.fullName || '',
      grade,
      language,
      username: student.username || '',
    },
    branch: {
      grade,
      language,
      title: `${grade} класс / ${getBranchTitle(language)}`,
      class_title: `${grade} класс`,
      language_title: getBranchTitle(language),
    },
    test_types: [
      {
        id: 'MAIN',
        title: getTestTypeTitle('MAIN', language),
        status: mainSubjects.some((subject) => subject.status === 'ready') ? 'ready' : 'locked',
        items: mainSubjects,
      },
      {
        id: 'TRIAL',
        title: getTestTypeTitle('TRIAL', language),
        status: trialRounds.some((round) => round.status === 'ready') ? 'ready' : 'locked',
        rounds: trialRounds,
      },
    ],
  };
}

function buildContentReadiness(countsByTable) {
  return STUDENT_GRADES.flatMap((grade) =>
    LANGUAGES.map((language) =>
      buildStudentCatalog(
        {
          id: `${grade}-${language}`,
          full_name: '',
          grade,
          language,
          username: '',
        },
        countsByTable,
      ),
    ),
  );
}

module.exports = {
  SUBJECTS,
  LANGUAGES,
  QUESTION_GRADES,
  MATHLOGIC_GRADES,
  STUDENT_GRADES,
  MAIN_QUESTIONS_PER_GRADE,
  TEST_TYPES,
  MATH_LOGIC_META,
  normalizeLanguage,
  localizeText,
  getSubjectName,
  getBranchTitle,
  getTestTypeTitle,
  buildQuestionTableName,
  buildResultTableName,
  getTrialStructure,
  getMathLogicCount,
  loadQuestionCounts,
  invalidateQuestionCountsCache,
  buildMainSubjects,
  buildTrialRounds,
  buildStudentCatalog,
  buildContentReadiness,
};
