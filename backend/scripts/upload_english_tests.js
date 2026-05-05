/* eslint-disable no-console */
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const SUBJECT_CODE = 'english';
const QUESTION_TABLE = 'uni_questions_english';
const PASSAGE_TABLE = 'uni_english_passages';
const SOURCE_DIR = path.resolve(__dirname, '../../eng_tests');
const FILENAME_RE = /^Англиский\s+(\d+)-тест\.docx$/i;

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д'];
const LETTER_RE = /[АБВГД]/;

function parseArgs(argv) {
  const args = { dryRun: false, testNumbers: null, all: false };
  for (const raw of argv.slice(2)) {
    if (raw === '--dry-run' || raw === '-n') args.dryRun = true;
    else if (raw === '--all') args.all = true;
    else if (raw.startsWith('--test=')) {
      args.testNumbers = raw
        .slice('--test='.length)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
  }
  return args;
}

function listTestFiles() {
  const entries = fs
    .readdirSync(SOURCE_DIR)
    .map((rawName) => {
      // macOS returns NFD-decomposed Unicode; normalize so the regex against "й" matches.
      const name = rawName.normalize('NFC');
      const match = name.match(FILENAME_RE);
      if (!match) return null;
      return { name, number: Number(match[1]), full: path.join(SOURCE_DIR, rawName) };
    })
    .filter(Boolean)
    .sort((a, b) => a.number - b.number);
  return entries;
}

function readDocxAsText(filePath) {
  const out = execSync(`textutil -convert txt "${filePath}" -stdout`, { maxBuffer: 16 * 1024 * 1024 });
  return out.toString('utf-8').replace(/\r/g, '');
}

function parseAnswerKey(text) {
  const idx = text.search(/Жооптор[а-я]*/i);
  const tail = idx >= 0 ? text.slice(idx) : text;
  const map = {};
  const tokenRe = /(\d{1,2})\s*[-–—]\s*([АБВГД])/g;
  let m;
  while ((m = tokenRe.exec(tail))) {
    map[Number(m[1])] = m[2];
  }
  return map;
}

// Splits a single line "А) foo Б) bar В) baz Г) qux Д) quux" into 5 strings.
// Some option texts contain commas/dots — we split strictly on " <KIRYL>) ".
function splitOptionsLine(line) {
  const re = /(^|\s)([АБВГД])\)\s*/g;
  const marks = [];
  let mm;
  while ((mm = re.exec(line))) {
    marks.push({ letter: mm[2], start: mm.index + mm[1].length, contentStart: re.lastIndex });
  }
  if (marks.length === 0) return null;
  const parts = {};
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].start : line.length;
    parts[marks[i].letter] = line.slice(marks[i].contentStart, end).trim().replace(/\s+/g, ' ');
  }
  return parts;
}

function isPassageHeading(line) {
  // Heading is wrapped in “…” or "..." (or rarely «…»). Russian curly quotes are common.
  const trimmed = line.trim();
  return /^[“"«].+[”"»]$/.test(trimmed);
}

function stripQuotes(line) {
  return line.trim().replace(/^[“"«]+/, '').replace(/[”"»]+$/, '').trim();
}

function parseTest(rawText, testNumber) {
  const lines = rawText.split('\n').map((l) => l.replace(/ /g, ' ').trimEnd());

  const answerKey = parseAnswerKey(rawText);
  const totalAnswers = Object.keys(answerKey).length;

  // Find boundary where answer-key section starts so we don't ingest it as content.
  const answersStart = lines.findIndex((l) => /Жооптор/i.test(l));
  const contentLines = answersStart >= 0 ? lines.slice(0, answersStart) : lines;

  // Locate "Reading Text 1" marker; everything before it is plain Q1..Q40 territory,
  // and everything after holds the two passages plus their question groups.
  const readingMarkerIdx = contentLines.findIndex((l) => /^Reading Text\s*1\b/i.test(l.trim()));

  // --- Pass 1: collect all questions (number + question_text + options) ---
  const questions = [];
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i].trim();
    const qm = line.match(/^(\d{1,2})\.\s+(.*)$/);
    if (!qm) continue;
    const num = Number(qm[1]);
    if (num < 1 || num > 60) continue;

    // Question stem may span multiple lines until we hit the options block.
    // Options block itself can wrap onto the next line (seen in test 14 / Q52),
    // so we keep concatenating subsequent lines as long as they extend the option set.
    let stem = qm[2].trim();
    let optionsParts = null;
    let cursor = i + 1;
    while (cursor < contentLines.length) {
      const next = contentLines[cursor].trim();
      if (!next) {
        cursor++;
        continue;
      }
      // Stop if we hit another numbered question that is clearly not an option line.
      if (/^\d{1,2}\.\s+/.test(next) && !LETTER_RE.test(next.slice(0, 4))) break;

      const parsed = splitOptionsLine(next);
      if (parsed) {
        // Found the start of the options block. Greedily merge follow-up lines
        // until we have all 5 letters or the next line clearly isn't a continuation.
        let merged = next;
        let lookahead = cursor + 1;
        while (lookahead < contentLines.length) {
          const peek = contentLines[lookahead].trim();
          if (!peek) break;
          if (/^\d{1,2}\.\s+/.test(peek) && !LETTER_RE.test(peek.slice(0, 4))) break;
          // Continuation either contains another option marker, or is the tail of the
          // last option (no marker but follows immediately).
          const peekParsed = splitOptionsLine(peek);
          const merge = peekParsed || /^[А-Яа-яA-Za-z(]/.test(peek);
          if (!merge) break;
          merged += ' ' + peek;
          lookahead++;
          const reparsed = splitOptionsLine(merged);
          if (reparsed && Object.keys(reparsed).length >= 5) break;
        }
        optionsParts = splitOptionsLine(merged);
        cursor = lookahead;
        break;
      }
      // Otherwise treat as continuation of the stem.
      stem += '\n' + next;
      cursor++;
    }

    if (!optionsParts || Object.keys(optionsParts).length < 4) {
      continue;
    }

    const correctLetter = answerKey[num];
    const options = LETTERS.map((letter) => ({
      text: optionsParts[letter] || '',
      is_correct: letter === correctLetter,
    }));
    if (!options.some((o) => o.is_correct)) {
      // Defensive: if answer key missing/invalid, mark first as correct so DB stays consistent.
      options[0].is_correct = true;
    }

    questions.push({ num, question_text: stem.trim(), options });
    i = cursor - 1;
  }

  // --- Pass 2: extract passages from the reading section ---
  const passages = [];
  if (readingMarkerIdx >= 0) {
    const readingSlice = contentLines.slice(readingMarkerIdx);

    // Find passage heading lines (in quotes), excluding the literal "Reading Text N" markers.
    const headingIndices = [];
    for (let i = 0; i < readingSlice.length; i++) {
      const t = readingSlice[i].trim();
      if (!t) continue;
      if (/^Reading Text\s*\d+\b/i.test(t)) continue;
      if (isPassageHeading(t)) headingIndices.push(i);
    }

    for (let h = 0; h < headingIndices.length && h < 2; h++) {
      const startIdx = headingIndices[h];
      const endIdx = h + 1 < headingIndices.length ? headingIndices[h + 1] : readingSlice.length;
      const block = readingSlice.slice(startIdx, endIdx);
      const title = stripQuotes(block[0]);

      const bodyLines = [];
      for (let i = 1; i < block.length; i++) {
        const ln = block[i];
        const trimmed = ln.trim();
        // Stop at the first numbered question of this group.
        if (/^\d{1,2}\.\s+/.test(trimmed)) break;
        // Skip the literal "Reading Text 2" separator if it ever sits inside body.
        if (/^Reading Text\s*\d+\b/i.test(trimmed)) continue;
        bodyLines.push(ln);
      }
      const body = bodyLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
      if (body) passages.push({ index: h + 1, title, body });
    }
  }

  return {
    testNumber,
    totalAnswers,
    questions,
    passages,
  };
}

function attachPassageRefs(parsed, passageIdByIndex) {
  // Q41–50 -> passage 1, Q51–60 -> passage 2.
  return parsed.questions.map((q) => {
    let passageIndex = null;
    if (q.num >= 41 && q.num <= 50) passageIndex = 1;
    else if (q.num >= 51 && q.num <= 60) passageIndex = 2;
    const tags = passageIndex
      ? { passage_id: passageIdByIndex[passageIndex] || null, passage_index: passageIndex }
      : {};
    return { ...q, tags };
  });
}

function summarize(parsed) {
  const lines = [];
  lines.push(`Test ${parsed.testNumber}: ${parsed.questions.length} questions, ${parsed.passages.length} passages, ${parsed.totalAnswers} answer keys`);
  for (const p of parsed.passages) {
    lines.push(`  Passage ${p.index}: "${p.title}" (${p.body.length} chars, ${p.body.split(/\s+/).length} words)`);
  }
  const missing = [];
  for (let n = 1; n <= 60; n++) {
    if (!parsed.questions.find((q) => q.num === n)) missing.push(n);
  }
  if (missing.length) lines.push(`  MISSING question numbers: ${missing.join(', ')}`);
  // Sample first + last + a passage-bound one
  for (const sampleNum of [1, 25, 41, 51, 60]) {
    const q = parsed.questions.find((qq) => qq.num === sampleNum);
    if (!q) continue;
    const correct = q.options.find((o) => o.is_correct);
    lines.push(`  Q${q.num}: ${q.question_text.slice(0, 80)}${q.question_text.length > 80 ? '…' : ''}`);
    lines.push(`         correct = ${correct ? correct.text : '(none)'}`);
  }
  return lines.join('\n');
}

async function loadSubjectId(supabase) {
  const { data, error } = await supabase
    .from('uni_subjects')
    .select('id')
    .eq('code', SUBJECT_CODE)
    .single();
  if (error || !data) throw new Error(`Cannot find subject "${SUBJECT_CODE}": ${error?.message || 'not found'}`);
  return data.id;
}

async function upsertPassages(supabase, testNumber, passages) {
  // Delete-then-insert keeps it idempotent for the same test_number.
  const { error: delErr } = await supabase.from(PASSAGE_TABLE).delete().eq('test_number', testNumber);
  if (delErr) throw new Error(`Failed to clear old passages: ${delErr.message}`);

  if (passages.length === 0) return {};

  const rows = passages.map((p) => ({
    test_number: testNumber,
    passage_index: p.index,
    title: p.title,
    body: p.body,
  }));

  const { data, error } = await supabase.from(PASSAGE_TABLE).insert(rows).select('id, passage_index');
  if (error) throw new Error(`Failed to insert passages: ${error.message}`);

  const map = {};
  for (const row of data) map[row.passage_index] = row.id;
  return map;
}

async function deleteOldQuestionsForTest(supabase, subjectId, testNumber) {
  // We tag every uploaded question with tags.test_number so reruns can wipe them safely.
  const { error } = await supabase
    .from(QUESTION_TABLE)
    .delete()
    .eq('subject_id', subjectId)
    .filter('tags->>test_number', 'eq', String(testNumber));
  if (error) throw new Error(`Failed to delete old questions for test ${testNumber}: ${error.message}`);
}

async function insertQuestions(supabase, subjectId, testNumber, questions) {
  const rows = questions
    .slice()
    .sort((a, b) => a.num - b.num)
    .map((q, idx) => ({
      subject_id: subjectId,
      template_id: null,
      question_text: q.question_text,
      options: q.options,
      explanation: '',
      image_url: '',
      tags: {
        ...q.tags,
        test_number: testNumber,
        question_number: q.num,
        sort_index: idx,
      },
    }));

  const BATCH = 30;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from(QUESTION_TABLE).insert(batch);
    if (error) throw new Error(`Insert batch failed at offset ${i}: ${error.message}`);
  }
}

async function uploadOne(supabase, subjectId, file, parsed) {
  console.log(`\n=== Uploading test ${parsed.testNumber} (${file.name}) ===`);

  // 1) Wipe previous version of this test (questions + passages).
  await deleteOldQuestionsForTest(supabase, subjectId, parsed.testNumber);
  const passageIdByIndex = await upsertPassages(supabase, parsed.testNumber, parsed.passages);

  // 2) Attach passage_id refs to questions and insert.
  const enriched = attachPassageRefs(parsed, passageIdByIndex);
  await insertQuestions(supabase, subjectId, parsed.testNumber, enriched);

  console.log(`  ✓ Inserted ${enriched.length} questions, ${parsed.passages.length} passages.`);
}

async function main() {
  const args = parseArgs(process.argv);
  const files = listTestFiles();
  if (files.length === 0) {
    console.error(`No test files found in ${SOURCE_DIR}`);
    process.exit(1);
  }

  const filtered = args.all
    ? files
    : args.testNumbers
      ? files.filter((f) => args.testNumbers.includes(f.number))
      : files.slice(0, 1); // safe default: only first test

  console.log(`Found ${files.length} test files. Processing ${filtered.length}.`);
  console.log(`Mode: ${args.dryRun ? 'DRY-RUN (no DB writes)' : 'LIVE (will write to Supabase)'}\n`);

  const parsedAll = [];
  for (const file of filtered) {
    const text = readDocxAsText(file.full);
    const parsed = parseTest(text, file.number);
    console.log(summarize(parsed));
    parsedAll.push({ file, parsed });
  }

  if (args.dryRun) {
    console.log('\nDry-run complete. Re-run without --dry-run to write to Supabase.');
    return;
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env');
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const subjectId = await loadSubjectId(supabase);
  console.log(`Resolved subject_id for "${SUBJECT_CODE}" = ${subjectId}`);

  for (const { file, parsed } of parsedAll) {
    if (parsed.questions.length !== 60) {
      console.warn(`  ! Test ${parsed.testNumber}: expected 60 questions, got ${parsed.questions.length}. Skipping.`);
      continue;
    }
    if (parsed.passages.length !== 2) {
      console.warn(`  ! Test ${parsed.testNumber}: expected 2 passages, got ${parsed.passages.length}. Skipping.`);
      continue;
    }
    await uploadOne(supabase, subjectId, file, parsed);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
