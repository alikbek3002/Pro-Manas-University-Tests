/**
 * upload_adabiyat.js
 * ─────────────────────────────────────
 * Загрузка тестов по "Кыргыз адабият" (Адабият.docx)
 * в таблицу uni_questions_kyrgyz_literature (subject: kyrgyz_literature).
 *
 * Формат файла такой же как у Тарых/Физика:
 *   N-суроо
 *   Суроо: <текст>
 *   Варианттар: а) ... б) ... в) ... г) ... д) ...
 * Ответы блоком в конце: "1-д 2-б 3-а ..."
 *
 * Шаблоны uni_test_templates для kyrgyz_literature уже существуют
 * (manas_humanities + manas_all_subjects, по 20 предметтик тестов).
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY
);

const ROOT = path.resolve(__dirname, '../..');
const FILE = path.join(ROOT, 'Адабият.docx');
const SUBJECT_CODE = 'kyrgyz_literature';
const TABLE = 'uni_questions_kyrgyz_literature';
const OPTION_LETTERS = ['а', 'б', 'в', 'г', 'д'];

function convertDocxToText(filePath) {
  return execSync(`textutil -convert txt "${filePath}" -stdout`).toString('utf-8');
}

function parseAnswersBlock(text) {
  const answers = {};
  const lines = text.split(/\r?\n|\u2028|\u2029/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/[\s,;]+/);
    for (const part of parts) {
      const m = part.match(/^(\d+)\s*-\s*([абвгдАБВГД])$/);
      if (m) answers[parseInt(m[1], 10)] = m[2].toLowerCase();
    }
  }
  return answers;
}

function findAnswerBlockStart(text) {
  const lines = text.split(/\r?\n|\u2028|\u2029/);
  // The answer block is the longest contiguous run at the bottom whose
  // non-whitespace content is purely "N-X" tokens (one or many per line).
  const offsets = [];
  let off = 0;
  for (const line of lines) {
    offsets.push(off);
    off += line.length + 1;
  }
  const classify = (line) => {
    const t = line.trim();
    if (!t) return 'blank';
    if (/суроо/i.test(t)) return 'other';
    const stripped = t.replace(/\d+\s*-\s*[абвгдАБВГД?]/g, '').replace(/[\s,;]+/g, '');
    return stripped.length === 0 ? 'answer' : 'other';
  };
  let runStartLine = null;
  for (let i = lines.length - 1; i >= 0; i--) {
    const c = classify(lines[i]);
    if (c === 'answer') runStartLine = i;
    else if (c === 'blank') continue;
    else break;
  }
  if (runStartLine === null) return null;
  return offsets[runStartLine];
}

function parseQuestions(text, keys) {
  const questions = [];
  const regex = /^(\d+)-суроо/gm;
  const indices = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    indices.push({ index: m.index, num: parseInt(m[1], 10) });
  }
  const answerBlockStart = findAnswerBlockStart(text);

  for (let i = 0; i < indices.length; i++) {
    const startObj = indices[i];
    if (answerBlockStart !== null && startObj.index >= answerBlockStart) continue;
    const end = i + 1 < indices.length ? indices[i + 1].index : (answerBlockStart || text.length);
    const block = text.substring(startObj.index, end).trim();

    const lines = block.split(/\r?\n|\u2028|\u2029/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;

    let questionText = '';
    const options = [];
    const optionRegex = new RegExp(`^([${OPTION_LETTERS.join('')}])\\)\\s*(.*)`, 'i');

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j];
      if (line === 'Суроо:' || line === 'Варианттар:') continue;

      // First strip leading "Суроо: " / "Варианттар: " inline
      let cleaned = line.replace(/^Суроо:\s*/i, '').replace(/^Варианттар:\s*/i, '');

      // A line may contain multiple inline options: "а) ... б) ... в) ..."
      const inlineSplit = cleaned.split(/(?=\b[абвгд]\)\s)/i).filter(s => s.trim());
      const optionsOnLine = inlineSplit.filter(s => optionRegex.test(s.trim()));
      if (optionsOnLine.length > 0 && optionsOnLine.length === inlineSplit.length) {
        for (const part of optionsOnLine) {
          const om = part.trim().match(optionRegex);
          if (om) options.push({ letter: om[1].toLowerCase(), text: om[2].trim() });
        }
      } else {
        const om = cleaned.match(optionRegex);
        if (om) {
          options.push({ letter: om[1].toLowerCase(), text: om[2].trim() });
        } else if (options.length === 0) {
          questionText += (questionText ? '\n' : '') + cleaned;
        } else {
          options[options.length - 1].text += ' ' + cleaned;
        }
      }
    }

    if (options.length > 0 && questionText) {
      const qNum = startObj.num;
      const keyLetter = keys[qNum];
      const finalOptions = options.map(opt => ({
        text: opt.text,
        is_correct: keyLetter ? opt.letter === keyLetter : false,
      }));
      questions.push({
        num: qNum,
        question_text: questionText,
        options: finalOptions,
        has_answer: !!keyLetter,
      });
    }
  }
  return questions;
}

async function run() {
  console.log(`📄 ${path.basename(FILE)} → ${TABLE} (${SUBJECT_CODE})`);
  if (!fs.existsSync(FILE)) {
    console.error(`❌ ${FILE} not found`);
    process.exit(1);
  }

  const text = convertDocxToText(FILE);
  const keys = parseAnswersBlock(text);
  console.log(`🔑 answers: ${Object.keys(keys).length}`);

  const parsed = parseQuestions(text, keys);
  console.log(`❓ parsed: ${parsed.length}`);
  const withAns = parsed.filter(q => q.has_answer).length;
  console.log(`✅ with answer: ${withAns}`);
  console.log(`⚠️  without answer: ${parsed.length - withAns}`);

  const noAns = parsed.filter(q => !q.has_answer).map(q => q.num);
  if (noAns.length) console.log(`   missing answer for: ${noAns.join(', ')}`);

  // Drop questions without a known correct answer; otherwise they pollute
  // the bank (no green option) and break tests that require is_correct=true.
  const ready = parsed.filter(q => q.has_answer);
  console.log(`📦 will upload: ${ready.length}`);

  // Sanity samples
  const show = [parsed[0], parsed[1], parsed[Math.floor(parsed.length/2)], parsed[parsed.length-1]].filter(Boolean);
  for (const q of show) {
    console.log(`\n--- Q${q.num} ---`);
    console.log((q.question_text||'').substring(0, 120));
    for (const o of q.options) console.log(`  ${o.is_correct ? '✓' : ' '} ${o.text.substring(0, 80)}`);
  }

  if (process.argv.includes('--dry-run')) {
    console.log('\n[dry-run] skipping insert');
    return;
  }

  const { data: subjRow, error: subjErr } = await supabase
    .from('uni_subjects')
    .select('id')
    .eq('code', SUBJECT_CODE)
    .single();
  if (subjErr || !subjRow) {
    console.error('❌ subject row missing:', subjErr?.message);
    process.exit(1);
  }
  const subjectId = subjRow.id;
  console.log(`🆔 subject_id=${subjectId}`);

  const { count: existing } = await supabase.from(TABLE).select('*', { count: 'exact', head: true });
  console.log(`📊 existing rows in ${TABLE}: ${existing}`);
  if (existing > 0) {
    console.log('⚠️  Table is not empty. Aborting to avoid duplicates. If you want to re-upload, delete rows first.');
    process.exit(1);
  }

  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < ready.length; i += BATCH) {
    const batch = ready.slice(i, i + BATCH).map(q => ({
      subject_id: subjectId,
      template_id: null,
      question_text: q.question_text,
      options: q.options,
      explanation: '[MANAS_ONLY]',
      image_url: '',
    }));
    const { error } = await supabase.from(TABLE).insert(batch);
    if (error) {
      console.error(`  ❌ batch ${Math.floor(i / BATCH) + 1}: ${error.message}`);
    } else {
      inserted += batch.length;
      console.log(`  ✅ batch ${Math.floor(i / BATCH) + 1}: ${batch.length}`);
    }
  }
  console.log(`\n🎉 inserted ${inserted}/${ready.length}`);
}

run().catch(err => {
  console.error('💥', err);
  process.exit(1);
});
