const crypto = require('crypto');
const express = require('express');
const supabase = require('../lib/supabase');
const {
  LANGUAGES,
  SUBJECTS,
  getSubjectName,
  loadQuestionCounts,
  normalizeLanguage,
} = require('../lib/testCatalog');

const router = express.Router();

const DEFAULT_DEMO_LANGUAGE = 'ru';
const DEMO_QUESTION_LIMIT = 3;
const DEMO_SESSION_CACHE_TTL_MS = Number(process.env.DEMO_SESSION_CACHE_TTL_MS || 2 * 60 * 60 * 1000);
const DEMO_SESSION_CACHE_MAX_SIZE = Number(process.env.DEMO_SESSION_CACHE_MAX_SIZE || 5000);
const DEMO_CATALOG_CACHE_TTL_MS = Number(process.env.DEMO_CATALOG_CACHE_TTL_MS || 10 * 60 * 1000);
const DEMO_QUESTION_PAYLOAD_CACHE_TTL_MS = Number(process.env.DEMO_QUESTION_PAYLOAD_CACHE_TTL_MS || 30 * 60 * 1000);
const DEMO_QUESTION_PAYLOAD_CACHE_MAX_SIZE = Number(process.env.DEMO_QUESTION_PAYLOAD_CACHE_MAX_SIZE || 100);
const DEMO_SUBJECT_GRADES = {
  history: [5, 6, 7],
  english: [5, 6, 7],
  russian: [5, 6, 7],
  kyrgyz: [5, 6, 7],
  mathlogic: [6, 7],
};

const demoSessionCache = new Map();
const demoQuestionPayloadCache = new Map();
const demoCatalogCache = {
  value: null,
  expiresAt: 0,
  inflight: null,
};

function pruneDemoSessionCache() {
  const now = Date.now();

  for (const [sessionId, session] of demoSessionCache.entries()) {
    if (session.expiresAt <= now) {
      demoSessionCache.delete(sessionId);
    }
  }

  while (demoSessionCache.size > DEMO_SESSION_CACHE_MAX_SIZE) {
    const oldestKey = demoSessionCache.keys().next().value;
    if (!oldestKey) break;
    demoSessionCache.delete(oldestKey);
  }
}

function pruneDemoQuestionPayloadCache() {
  const now = Date.now();

  for (const [cacheKey, entry] of demoQuestionPayloadCache.entries()) {
    if (entry.expiresAt <= now) {
      demoQuestionPayloadCache.delete(cacheKey);
    }
  }

  while (demoQuestionPayloadCache.size > DEMO_QUESTION_PAYLOAD_CACHE_MAX_SIZE) {
    const oldestKey = demoQuestionPayloadCache.keys().next().value;
    if (!oldestKey) break;
    demoQuestionPayloadCache.delete(oldestKey);
  }
}

function getEmptyAnswersState() {
  return {
    by_question: {},
    answered_count: 0,
    correct_count: 0,
    total_questions: 0,
    score_percent: 0,
    submitted_at: null,
  };
}

function sanitizeOptionsForStudent(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options.map((option) => {
    if (typeof option === 'string') {
      return { text: option };
    }

    return {
      text: String(option?.text || ''),
    };
  });
}

function getCorrectOptionIndex(options) {
  if (!Array.isArray(options)) {
    return -1;
  }

  return options.findIndex((option) => Boolean(option?.is_correct));
}

function buildDemoQuestionTableName(subject, language, grade) {
  const normalizedLanguage = subject === 'mathlogic' ? 'ru' : language;
  return `questions_${subject}_${normalizedLanguage}_${grade}`;
}

function resolveDemoLanguage(rawLanguage) {
  const normalizedLanguage = normalizeLanguage(rawLanguage || DEFAULT_DEMO_LANGUAGE);
  return LANGUAGES.includes(normalizedLanguage) ? normalizedLanguage : DEFAULT_DEMO_LANGUAGE;
}

function getDemoCatalogItem(subjectId, countsByTable, language) {
  const grades = DEMO_SUBJECT_GRADES[subjectId] || [];
  const lines = grades
    .map((grade) => {
      const available = countsByTable[buildDemoQuestionTableName(subjectId, language, grade)] || 0;

      return {
        grade,
        required: DEMO_QUESTION_LIMIT,
        available,
        label: `${grade} класс`,
        status: available >= DEMO_QUESTION_LIMIT ? 'ready' : 'locked',
        demo_question_count: Math.min(DEMO_QUESTION_LIMIT, available),
      };
    })
    .filter((line) => line.available > 0);

  if (lines.length === 0) {
    return null;
  }

  return {
    id: subjectId,
    title: getSubjectName(subjectId, language),
    required_total: lines.length * DEMO_QUESTION_LIMIT,
    available_total: lines.reduce((sum, line) => sum + line.available, 0),
    status: lines.some((line) => line.status === 'ready') ? 'ready' : 'locked',
    lines,
  };
}

async function buildDemoCatalog(language) {
  const now = Date.now();
  const cacheKey = resolveDemoLanguage(language);
  const cached = demoCatalogCache.value?.[cacheKey] || null;

  if (cached && demoCatalogCache.expiresAt > now) {
    return cached;
  }

  if (demoCatalogCache.inflight?.[cacheKey]) {
    return demoCatalogCache.inflight[cacheKey];
  }

  const nextLoad = loadQuestionCounts(supabase)
    .then((countsByTable) => {
      const items = SUBJECTS
        .map((subjectId) => getDemoCatalogItem(subjectId, countsByTable, cacheKey))
        .filter(Boolean);

      const catalog = {
        branch: {
          language: cacheKey,
          title: 'Демо-тесты',
          class_title: '5-7 классы',
          language_title: cacheKey === 'kg' ? 'Кыргызский язык' : 'Русский язык',
        },
        test_types: [
          {
            id: 'MAIN',
            title: 'Демо-тесты',
            status: items.some((item) => item.status === 'ready') ? 'ready' : 'locked',
            items,
          },
        ],
      };

      demoCatalogCache.value = {
        ...(demoCatalogCache.value || {}),
        [cacheKey]: catalog,
      };
      demoCatalogCache.expiresAt = Date.now() + DEMO_CATALOG_CACHE_TTL_MS;
      return catalog;
    })
    .finally(() => {
      if (demoCatalogCache.inflight?.[cacheKey] === nextLoad) {
        delete demoCatalogCache.inflight[cacheKey];
      }
    });

  demoCatalogCache.inflight = {
    ...(demoCatalogCache.inflight || {}),
    [cacheKey]: nextLoad,
  };
  return nextLoad;
}

async function loadFirstDemoQuestions({ subject, grade, language }) {
  const tableName = buildDemoQuestionTableName(subject, language, grade);
  let selectFields = 'id, question_text, options, topic, explanation, image_url';

  if (subject === 'mathlogic') {
    selectFields += ', question_type';
  }

  const { data, error } = await supabase
    .from(tableName)
    .select(selectFields)
    .order('id', { ascending: true })
    .limit(DEMO_QUESTION_LIMIT);

  if (error) {
    const nextError = new Error(`Не удалось загрузить демо-вопросы из ${tableName}`);
    nextError.cause = error;
    throw nextError;
  }

  const questions = (data || []).map((row) => ({
    ...row,
    subject,
    grade,
  }));

  if (questions.length < DEMO_QUESTION_LIMIT) {
    const nextError = new Error(`Недостаточно демо-вопросов в ${tableName}`);
    nextError.code = 'NOT_ENOUGH_QUESTIONS';
    nextError.meta = {
      tableName,
      requiredCount: DEMO_QUESTION_LIMIT,
      availableCount: questions.length,
    };
    throw nextError;
  }

  return questions;
}

function buildQuestionPayload(questions) {
  return {
    questions,
    responseQuestions: questions.map((question) => ({
      id: String(question.id),
      text: question.question_text,
      options: sanitizeOptionsForStudent(question.options),
      topic: question.topic || '',
      imageUrl: question.image_url || '',
      question_type: question.question_type || null,
    })),
  };
}

async function fetchFirstDemoQuestionsCached({ subject, grade, language }) {
  pruneDemoQuestionPayloadCache();

  const cacheKey = `${language}:${subject}:${grade}`;
  const cached = demoQuestionPayloadCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const questions = await loadFirstDemoQuestions({ subject, grade, language });
  const payload = buildQuestionPayload(questions);

  demoQuestionPayloadCache.set(cacheKey, {
    expiresAt: Date.now() + DEMO_QUESTION_PAYLOAD_CACHE_TTL_MS,
    payload,
  });
  pruneDemoQuestionPayloadCache();

  return payload;
}

function createDemoSession({ subject, grade, questions, language }) {
  pruneDemoSessionCache();

  const sessionId = crypto.randomUUID();
  const answersState = {
    ...getEmptyAnswersState(),
    total_questions: questions.length,
  };

  demoSessionCache.set(sessionId, {
    id: sessionId,
    subject,
    grade,
    language,
    expiresAt: Date.now() + DEMO_SESSION_CACHE_TTL_MS,
    answersState,
    questions,
    questionsById: Object.fromEntries(
      questions.map((question) => [
        String(question.id),
        {
          id: String(question.id),
          explanation: String(question.explanation || ''),
          options: question.options,
          correct_index: getCorrectOptionIndex(question.options),
          question_type: question.question_type || null,
        },
      ]),
    ),
  });

  return sessionId;
}

function getDemoSession(sessionId) {
  pruneDemoSessionCache();

  const session = demoSessionCache.get(String(sessionId));
  if (!session) {
    return null;
  }

  session.expiresAt = Date.now() + DEMO_SESSION_CACHE_TTL_MS;
  return session;
}

function finalizeAnswersState(session) {
  const answeredCount = Object.keys(session.answersState.by_question).length;
  const correctCount = Object.values(session.answersState.by_question).reduce(
    (sum, answer) => sum + (answer.is_correct ? 1 : 0),
    0,
  );
  const totalQuestions = session.questions.length;

  session.answersState = {
    ...session.answersState,
    answered_count: answeredCount,
    correct_count: correctCount,
    total_questions: totalQuestions,
    score_percent: totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0,
  };

  return session.answersState;
}

router.get('/available', async (_req, res) => {
  try {
    const language = resolveDemoLanguage(_req.query?.language);
    const catalog = await buildDemoCatalog(language);
    res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600, stale-while-revalidate=60');
    return res.json(catalog);
  } catch (error) {
    console.error('Demo catalog error:', error);
    return res.status(500).json({ error: 'Не удалось загрузить демо-тесты' });
  }
});

router.post('/generate', async (req, res) => {
  try {
    const normalizedSubject = String(req.body?.subject || '').trim().toLowerCase();
    const grade = Number(req.body?.grade);
    const language = resolveDemoLanguage(req.body?.language);
    const validGrades = DEMO_SUBJECT_GRADES[normalizedSubject] || [];

    if (!SUBJECTS.includes(normalizedSubject)) {
      return res.status(400).json({ error: 'Некорректный предмет для демо-теста' });
    }

    if (!validGrades.includes(grade)) {
      return res.status(400).json({ error: 'Некорректный класс для демо-теста' });
    }

    const questionPayload = await fetchFirstDemoQuestionsCached({
      subject: normalizedSubject,
      grade,
      language,
    });

    const sessionId = createDemoSession({
      subject: normalizedSubject,
      grade,
      questions: questionPayload.questions,
      language,
    });

    return res.json({
      test_session_id: sessionId,
      test_info: {
        type: 'MAIN',
        subject: normalizedSubject,
        round: null,
        part: null,
        language,
        grade,
        grade_window: [grade, grade],
      },
      breakdown: {
        [normalizedSubject]: {
          total: questionPayload.questions.length,
          by_grade: {
            [grade]: questionPayload.questions.length,
          },
        },
      },
      total_questions: questionPayload.questions.length,
      questions: questionPayload.responseQuestions,
    });
  } catch (error) {
    if (error.code === 'NOT_ENOUGH_QUESTIONS') {
      return res.status(409).json({
        error: 'Для этого демо-теста пока недостаточно вопросов.',
        details: error.meta,
      });
    }

    console.error('Demo generate error:', error);
    return res.status(500).json({ error: 'Не удалось создать демо-тест' });
  }
});

router.post('/answer', (req, res) => {
  try {
    const sessionId = String(req.body?.test_session_id || '').trim();
    const questionId = String(req.body?.question_id || '').trim();
    const selectedIndex = Number(req.body?.selected_index);

    if (!sessionId || !questionId) {
      return res.status(400).json({ error: 'Некорректные данные ответа' });
    }

    if (!Number.isInteger(selectedIndex) || selectedIndex < 0) {
      return res.status(400).json({ error: 'selected_index должен быть неотрицательным числом' });
    }

    const session = getDemoSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Демо-сессия истекла. Начните тест заново.' });
    }

    if (session.answersState.submitted_at) {
      return res.status(409).json({ error: 'Демо-тест уже завершён' });
    }

    if (session.answersState.by_question[questionId]) {
      return res.status(409).json({ error: 'Ответ на этот вопрос уже зафиксирован' });
    }

    const question = session.questionsById[questionId];
    if (!question) {
      return res.status(404).json({ error: 'Вопрос не найден в демо-сессии' });
    }

    if (!Array.isArray(question.options) || selectedIndex >= question.options.length) {
      return res.status(400).json({ error: 'selected_index выходит за пределы вариантов ответа' });
    }

    const isCorrect = question.correct_index >= 0 && selectedIndex === question.correct_index;
    session.answersState = {
      ...session.answersState,
      by_question: {
        ...session.answersState.by_question,
        [questionId]: {
          selected_index: selectedIndex,
          is_correct: isCorrect,
          correct_index: question.correct_index,
          answered_at: new Date().toISOString(),
        },
      },
    };

    const nextAnswers = finalizeAnswersState(session);

    return res.json({
      is_correct: isCorrect,
      correct_index: question.correct_index,
      explanation: question.explanation,
      can_continue: true,
      answered_count: nextAnswers.answered_count,
      total_questions: session.questions.length,
    });
  } catch (error) {
    console.error('Demo answer error:', error);
    return res.status(500).json({ error: 'Не удалось проверить ответ в демо-тесте' });
  }
});

router.post('/submit', (req, res) => {
  try {
    const sessionId = String(req.body?.test_session_id || '').trim();
    if (!sessionId) {
      return res.status(400).json({ error: 'Некорректный идентификатор демо-сессии' });
    }

    const session = getDemoSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Демо-сессия истекла. Начните тест заново.' });
    }

    if (session.answersState.submitted_at) {
      return res.status(409).json({ error: 'Демо-тест уже завершён' });
    }

    const finalAnswers = finalizeAnswersState(session);
    finalAnswers.submitted_at = new Date().toISOString();
    session.answersState = finalAnswers;
    demoSessionCache.delete(sessionId);

    return res.json({
      message: 'Демо-тест завершён',
      score: finalAnswers.score_percent,
      correct: finalAnswers.correct_count,
      answered: finalAnswers.answered_count,
      total: finalAnswers.total_questions,
    });
  } catch (error) {
    console.error('Demo submit error:', error);
    return res.status(500).json({ error: 'Не удалось завершить демо-тест' });
  }
});

module.exports = router;
