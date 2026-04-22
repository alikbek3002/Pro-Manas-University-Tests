/**
 * upload_chem_math.js
 * ─────────────────────────────────────────────────────────────
 * Загрузка тестов Химия и Математика в секцию Манас.
 *
 *   ХИМИЯ.docx  → uni_questions_chemistry  (subject: chemistry)
 *   МАТем.docx  → uni_questions_math       (subject: math)
 *
 * Скрипт сначала очищает существующие записи, потом загружает новые.
 * В математических вопросах автоматически конвертируются LaTeX-формулы:
 *   (expr с \команда)  →  $expr$        (inline)
 *   [expr с \ или ^]   →  $$expr$$      (display)
 * Уже поддерживается в student-frontend через KaTeX (MarkdownRenderer).
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
);

const ROOT = path.resolve(__dirname, '../..');

// ═══════════════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════════════

function toText(filePath) {
  try {
    return execSync(`textutil -convert txt "${filePath}" -stdout`).toString('utf-8');
  } catch (err) {
    console.error('textutil failed:', err.message);
    process.exit(1);
  }
}

/** Парсинг блока ответов в конце файла: "1-а  2-б  3-в ..." */
function parseAnswerBlock(text) {
  const answers = {};
  for (const part of text.split(/[\s,;]+/)) {
    const m = part.match(/^(\d+)\s*-\s*([абвгдАБВГД])$/);
    if (m) answers[parseInt(m[1], 10)] = m[2].toLowerCase();
  }
  return answers;
}

/**
 * Определяет начало блока ответов:
 * ищем строку, где 3+ паттернов "N-буква" рядом, в последних 30% файла.
 */
function findAnswerBlockStart(text) {
  const threshold = Math.floor(text.length * 0.70);
  const lines = text.split(/\r?\n|\u2028|\u2029/);
  let pos = 0;
  for (const line of lines) {
    if (pos >= threshold) {
      const hits = (line.match(/\d+-[абвгдАБВГД]/gi) || []).length;
      if (hits >= 3) return pos;
    }
    pos += line.length + 1;
  }
  return null;
}

/**
 * Конвертирует LaTeX-нотацию в строке в формат KaTeX:
 *   [expr]  →  $$expr$$   если есть \ или ^
 *   (expr)  →  $expr$     если есть LaTeX-команда (\frac, \sqrt, ...)
 */
function convertLatex(text) {
  if (!text) return text;

  // Display math: [формула] → $$формула$$
  text = text.replace(/\[([^\[\]\n]{2,200})\]/g, (match, inner) => {
    if (/\\[a-zA-Z]/.test(inner) || /[a-zA-Z0-9]\^/.test(inner)) {
      return `$$${inner.trim()}$$`;
    }
    return match;
  });

  // Inline math: (формула) → $формула$  — только если есть LaTeX-команда
  text = text.replace(/\(([^()\n]{2,200})\)/g, (match, inner) => {
    if (/\\[a-zA-Z]/.test(inner)) {
      return `$${inner.trim()}$`;
    }
    return match;
  });

  return text;
}

/**
 * Универсальный парсер вопросов формата "N-суроо".
 * @param {string}   text         — текст файла
 * @param {object}   answers      — { номер: буква }
 * @param {string[]} optLetters   — список допустимых букв вариантов
 * @param {boolean}  applyLatex   — конвертировать LaTeX-нотацию
 */
function parseQuestions(text, answers, optLetters, applyLatex = false) {
  const answerStart = findAnswerBlockStart(text);
  const regex = /^(\d+)-суроо/gm;
  const indices = [];
  let m;

  while ((m = regex.exec(text)) !== null) {
    if (answerStart && m.index >= answerStart) continue;
    indices.push({ index: m.index, num: parseInt(m[1], 10) });
  }

  const optPattern = new RegExp(`^([${optLetters.join('')}])\\)\\s*(.+)`, 'i');
  const questions = [];

  for (let i = 0; i < indices.length; i++) {
    const { index: start, num } = indices[i];
    const end = i + 1 < indices.length
      ? Math.min(indices[i + 1].index, answerStart || Infinity)
      : (answerStart || text.length);

    let block = text.slice(start, end).trim();

    // Убираем раздел ответов если попал в блок
    const joopIdx = Math.min(
      block.includes('Жооптору:') ? block.indexOf('Жооптору:') : Infinity,
      block.includes('Жообу:') ? block.indexOf('Жообу:') : Infinity,
    );
    if (isFinite(joopIdx)) block = block.slice(0, joopIdx).trim();

    const lines = block.split(/\r?\n|\u2028|\u2029/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    let questionText = '';
    const options = [];

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j];
      if (line === 'Суроо:' || line === 'Варианттар:') continue;

      const optMatch = line.match(optPattern);
      if (optMatch) {
        options.push({ letter: optMatch[1].toLowerCase(), text: optMatch[2] });
      } else if (options.length === 0) {
        questionText += (questionText ? '\n' : '') + line;
      } else {
        options[options.length - 1].text += ' ' + line;
      }
    }

    // Пропускаем вопросы без вариантов или с пустым текстом
    if (!questionText || options.length < 2) continue;

    // Пропускаем вопросы с пустыми вариантами (потерялись при конвертации OOXML)
    if (options.some(o => !o.text.trim())) continue;

    const correctLetter = answers[num];
    if (!correctLetter) {
      console.warn(`  ⚠ Q${num}: ответ не найден — пропускаю`);
      continue;
    }

    if (applyLatex) {
      questionText = convertLatex(questionText);
      options.forEach(o => { o.text = convertLatex(o.text); });
    }

    questions.push({
      num,
      question_text: questionText,
      options: options.map(o => ({
        text: o.text,
        is_correct: o.letter === correctLetter,
      })),
    });
  }

  return questions;
}

// ═══════════════════════════════════════════════════════════════
//  Upload runner
// ═══════════════════════════════════════════════════════════════

async function uploadSubject({ filePath, subjectCode, tableName, optLetters, applyLatex = false }) {
  console.log(`\n${'═'.repeat(62)}`);
  console.log(`📚  ${subjectCode.toUpperCase()}  →  ${tableName}`);
  console.log(`📄  ${path.basename(filePath)}`);
  console.log(`${'═'.repeat(62)}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Файл не найден: ${filePath}`);
    return;
  }

  // 1. Текст файла
  const text = toText(filePath);
  const answers = parseAnswerBlock(text);
  console.log(`🔑 Найдено ответов: ${Object.keys(answers).length}`);

  // 2. Парсинг
  const questions = parseQuestions(text, answers, optLetters, applyLatex);
  console.log(`❓ Распаршено вопросов: ${questions.length}`);

  // 3. Subject ID
  const { data: subjectRow, error: subjErr } = await supabase
    .from('uni_subjects')
    .select('id')
    .eq('code', subjectCode)
    .single();

  if (subjErr || !subjectRow) {
    console.error(`❌ Предмет "${subjectCode}" не найден в БД:`, subjErr?.message);
    return;
  }
  const subjectId = subjectRow.id;
  console.log(`🆔 subject_id: ${subjectId}`);

  // 4. Очищаем старые вопросы по этому предмету
  console.log(`🗑️  Удаляем существующие вопросы...`);
  const { error: delErr } = await supabase
    .from(tableName)
    .delete()
    .eq('subject_id', subjectId);

  if (delErr) {
    console.error(`❌ Ошибка удаления:`, delErr.message);
    return;
  }
  console.log(`✅ Старые вопросы удалены`);

  // 5. Загружаем батчами
  const BATCH = 50;
  let inserted = 0;

  for (let i = 0; i < questions.length; i += BATCH) {
    const batch = questions.slice(i, i + BATCH).map(q => ({
      subject_id: subjectId,
      template_id: null,
      question_text: q.question_text,
      options: q.options,
      explanation: '[MANAS_ONLY]',
      image_url: '',
    }));

    const { error } = await supabase.from(tableName).insert(batch);
    if (error) {
      console.error(`  ❌ Батч ${Math.floor(i / BATCH) + 1}:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`\r  📤 Загружено: ${inserted} / ${questions.length}`);
    }
  }

  console.log(`\n🎉 Итого загружено: ${inserted} вопросов\n`);
}

// ═══════════════════════════════════════════════════════════════
//  Main
// ═══════════════════════════════════════════════════════════════

async function run() {
  console.log('🚀 Загрузка Химии и Математики в Supabase (секция Манас)\n');

  // Химия — 5 вариантов (а-д), Unicode-формулы, без LaTeX-конвертации
  await uploadSubject({
    filePath: path.join(ROOT, 'ХИМИЯ.docx'),
    subjectCode: 'chemistry',
    tableName: 'uni_questions_chemistry',
    optLetters: ['а', 'б', 'в', 'г', 'д'],
    applyLatex: false,
  });

  // Математика — 5 вариантов (а-д), конвертируем LaTeX → $...$
  await uploadSubject({
    filePath: path.join(ROOT, 'МАТем.docx'),
    subjectCode: 'math',
    tableName: 'uni_questions_math',
    optLetters: ['а', 'б', 'в', 'г', 'д'],
    applyLatex: true,
  });

  console.log('✅ Все загрузки завершены!');
  process.exit(0);
}

run().catch(err => {
  console.error('💥 Критическая ошибка:', err);
  process.exit(1);
});
