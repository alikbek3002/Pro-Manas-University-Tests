/**
 * upload_new_subjects.js
 * ─────────────────────────────────────
 * Загрузка тестов по 4 предметам (Кыргыз тил, Тарых, Химия, Физика)
 * в секцию МАНАС (uni_questions_*).
 *
 * • Кыргыз тил  → uni_questions_kyrgyz_lang   (subject: kyrgyz_language)
 * • Тарых        → uni_questions_history        (subject: history)
 * • Химия        → uni_questions_chemistry      (subject: chemistry)
 * • Физика       → uni_questions_physics         (subject: physics)
 *
 * Картинки из Физика.docx выгружаются в Supabase Storage (question-images),
 * а ссылки прописываются в image_url соответствующих вопросов.
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

// ═══════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════

function convertDocxToText(filePath) {
  try {
    const output = execSync(`textutil -convert txt "${filePath}" -stdout`);
    return output.toString('utf-8');
  } catch (error) {
    console.error(`Failed to convert ${filePath}`, error);
    process.exit(1);
  }
}

/**
 * Парсинг блока ответов формата "N-X" (напр. "1-а  2-г  3-в")
 * в конце файла (Тарых, Физика, и часть Кыргыз тил).
 */
function parseAnswersBlock(text) {
  const answers = {};
  const lines = text.split(/\r?\n|\u2028|\u2029/);

  // Ищем строки, содержащие паттерн "ЦИФРА-БУКВА"
  // Поддержка: "1-а", "1-б", "1-в", "1-г", "1-д"
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Разбиваем по пробелам, запятым, табуляциям
    const parts = trimmed.split(/[\s,;]+/);
    for (const part of parts) {
      const match = part.match(/^(\d+)\s*-\s*([абвгдАБВГД])$/);
      if (match) {
        answers[parseInt(match[1], 10)] = match[2].toLowerCase();
      }
    }
  }
  return answers;
}

/**
 * Парсинг inline ответов формата "Жообу: X" (Кыргыз тил).
 */
function parseInlineAnswers(text) {
  const answers = {};
  const lines = text.split(/\r?\n|\u2028|\u2029/);
  let currentQuestion = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Определяем номер текущего вопроса
    const qMatch = trimmed.match(/^(\d+)-суроо/);
    if (qMatch) {
      currentQuestion = parseInt(qMatch[1], 10);
    }

    // Ищем "Жообу: X"
    const ansMatch = trimmed.match(/Жообу:\s*([абвгдАБВГД])/i);
    if (ansMatch && currentQuestion) {
      answers[currentQuestion] = ansMatch[1].toLowerCase();
    }
  }
  return answers;
}

/**
 * Парсинг блока ответов в формате "501-б, 502-в, 503-б, ..."
 * (Жооптору:) — встроенный в текст Тарых
 */
function parseJooptoru(text) {
  const answers = {};
  const lines = text.split(/\r?\n|\u2028|\u2029/);
  let inAnswersSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('Жооптору:') || trimmed.includes('Жооптору:')) {
      inAnswersSection = true;
    }

    if (inAnswersSection) {
      const parts = trimmed.split(/[\s,;]+/);
      for (const part of parts) {
        const match = part.match(/^(\d+)\s*-\s*([абвгдАБВГД])$/);
        if (match) {
          answers[parseInt(match[1], 10)] = match[2].toLowerCase();
        }
      }
    }
  }
  return answers;
}

/**
 * Универсальные парсер вопросов.
 * Формат: "N-суроо\n[Суроо:]\nТекст\n[Варианттар:]\nа) ...\nб) ...\n..."
 */
function parseQuestions(text, keys, optionLetters = ['а', 'б', 'в', 'г', 'д']) {
  const questions = [];
  const regex = /^(\d+)-суроо/gm;
  let match;
  const indices = [];

  while ((match = regex.exec(text)) !== null) {
    indices.push({ index: match.index, num: parseInt(match[1], 10) });
  }

  // Определяем где начинается блок ответов (чтобы не парсить его как вопрос)
  const answerBlockStart = findAnswerBlockStart(text);

  for (let i = 0; i < indices.length; i++) {
    const startObj = indices[i];

    // Пропускаем, если мы уже в блоке ответов
    if (answerBlockStart && startObj.index >= answerBlockStart) continue;

    const end = i + 1 < indices.length ? indices[i + 1].index : (answerBlockStart || text.length);
    let block = text.substring(startObj.index, end).trim();

    // Вырезаем "Жооптору:" если встретится
    const joopIdx = block.indexOf('Жооптору:');
    if (joopIdx !== -1) {
      block = block.substring(0, joopIdx).trim();
    }

    // Вырезаем inline ответ "Жообу:"
    const joobIdx = block.indexOf('Жообу:');
    if (joobIdx !== -1) {
      block = block.substring(0, joobIdx).trim();
    }

    const lines = block.split(/\r?\n|\u2028|\u2029/).map(l => l.trim()).filter(l => l);
    if (lines.length < 2) continue;

    let questionText = '';
    const options = [];
    const optionRegex = new RegExp(`^([${optionLetters.join('')}])\\)\\s*(.*)`, 'i');

    for (let j = 1; j < lines.length; j++) {
      const line = lines[j];
      if (line === 'Суроо:' || line === 'Варианттар:') continue;

      const optMatch = line.match(optionRegex);
      if (optMatch) {
        options.push({
          letter: optMatch[1].toLowerCase(),
          text: optMatch[2]
        });
      } else {
        if (options.length === 0) {
          questionText += (questionText ? '\n' : '') + line;
        } else {
          // Продолжение предыдущего варианта (перенос строки)
          options[options.length - 1].text += ' ' + line;
        }
      }
    }

    if (options.length > 0 && questionText) {
      const qNum = startObj.num;
      const keyLetter = keys[qNum];

      const finalOptions = options.map(opt => ({
        text: opt.text,
        is_correct: keyLetter ? opt.letter === keyLetter : false
      }));

      // Если ключ не найден, отмечаем первый вариант (fallback)
      if (!keyLetter) {
        console.warn(`  ⚠ Вопрос ${qNum}: ответ не найден, пропускаю...`);
      }

      // Гарантируем, что хотя бы один ответ отмечен правильным
      if (!finalOptions.some(o => o.is_correct) && keyLetter) {
        finalOptions[0].is_correct = true;
      }

      questions.push({
        num: qNum,
        question_text: questionText,
        options: finalOptions,
        has_answer: !!keyLetter
      });
    }
  }

  return questions;
}

/**
 * Определяет начало блока ответов в конце файла.
 * Ищем первое вхождение нескольких паттернов "N-буква" подряд
 * после последнего вопроса.
 */
function findAnswerBlockStart(text) {
  // Ищем паттерны блока ответов: строки с несколькими "N-X" подряд
  const patterns = [
    /\n\s*1-[абвгд]\s/m,
    /Жооптору:/m,
    /ЖООПТОР/m
  ];

  let earliest = null;
  for (const pat of patterns) {
    const m = text.match(pat);
    if (m) {
      const idx = text.indexOf(m[0]);
      // Проверяем что это действительно блок ответов (после вопросов)
      // — ищем паттерн далеко от начала файла
      if (idx > text.length * 0.7) {
        if (earliest === null || idx < earliest) {
          earliest = idx;
        }
      }
    }
  }

  // Дополнительная проверка: ищем строку, где идут подряд N-X без "суроо"
  const lines = text.split(/\r?\n|\u2028|\u2029/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    // Считаем количество "N-X" на строке
    const matches = line.match(/\d+-[абвгд]/gi);
    if (matches && matches.length >= 3) {
      // Это строка с ответами — ищем её позицию
      const lineStart = text.indexOf(line);
      if (earliest === null || lineStart < earliest) {
        earliest = lineStart;
      }
      break;
    }
  }

  return earliest;
}

// ═══════════════════════════════════════════════════════════════════
//  Physics Image Extraction — маппинг картинок к вопросам
// ═══════════════════════════════════════════════════════════════════

/**
 * Парсит document.xml из DOCX и определяет, какие картинки
 * к каким вопросам относятся (по порядку появления в документе).
 */
function parsePhysicsImageMapping(docXmlPath, relsXmlPath) {
  const docXml = fs.readFileSync(docXmlPath, 'utf-8');
  const relsXml = fs.readFileSync(relsXmlPath, 'utf-8');

  // 1. Строим маппинг rId → media filename
  const rIdToFile = {};
  const relRegex = /Id="(rId\d+)"[^>]*Target="media\/([^"]+)"/g;
  let relMatch;
  while ((relMatch = relRegex.exec(relsXml)) !== null) {
    rIdToFile[relMatch[1]] = relMatch[2];
  }

  // 2. Последовательно проходим по XML и фиксируем:
  //    - появление текста вопроса (N-суроо)  
  //    - появление картинки (r:embed="rIdXX")
  const events = [];

  // Ищем все позиции "N-суроо" в XML
  const qRegex = /(\d+)-суроо/g;
  let qMatch;
  while ((qMatch = qRegex.exec(docXml)) !== null) {
    events.push({ type: 'question', pos: qMatch.index, num: parseInt(qMatch[1], 10) });
  }

  // Ищем все позиции картинок
  const imgRegex = /r:embed="(rId\d+)"/g;
  let imgMatch;
  while ((imgMatch = imgRegex.exec(docXml)) !== null) {
    const rId = imgMatch[1];
    if (rIdToFile[rId]) {
      events.push({ type: 'image', pos: imgMatch.index, rId: rId, file: rIdToFile[rId] });
    }
  }

  // 3. Сортируем по позиции в документе
  events.sort((a, b) => a.pos - b.pos);

  // 4. Маппим: каждая картинка принадлежит последнему вопросу перед ней
  const questionImages = {}; // { questionNum: [file1, file2, ...] }
  let currentQ = null;

  for (const evt of events) {
    if (evt.type === 'question') {
      currentQ = evt.num;
    } else if (evt.type === 'image' && currentQ !== null) {
      if (!questionImages[currentQ]) questionImages[currentQ] = [];
      questionImages[currentQ].push(evt.file);
    }
  }

  return questionImages;
}

// ═══════════════════════════════════════════════════════════════════
//  Upload Logic
// ═══════════════════════════════════════════════════════════════════

async function uploadSubject(filePath, subjectCode, tableName, mode = 'auto', optionLetters = ['а', 'б', 'в', 'г']) {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📚 Предмет: ${subjectCode}`);
  console.log(`📄 Файл: ${path.basename(filePath)}`);
  console.log(`📊 Таблица: ${tableName}`);
  console.log(`${'═'.repeat(60)}`);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Файл ${filePath} не найден!`);
    return;
  }

  const text = convertDocxToText(filePath);

  // ─── Парсинг ответов ───
  let keys = {};

  if (mode === 'inline') {
    // Кыргыз тил: ответы встроены в каждый вопрос "Жообу: X"
    keys = parseInlineAnswers(text);
  } else if (mode === 'block') {
    // Тарых / Физика: ответы в конце файла "N-X"
    keys = { ...parseAnswersBlock(text), ...parseJooptoru(text) };
  } else {
    // auto: пробуем оба способа
    keys = parseInlineAnswers(text);
    const blockKeys = { ...parseAnswersBlock(text), ...parseJooptoru(text) };
    // Объединяем (block ключи имеют приоритет если есть)
    keys = { ...keys, ...blockKeys };
  }

  console.log(`🔑 Найдено ответов: ${Object.keys(keys).length}`);

  // ─── Парсинг вопросов ───
  const parsedQuestions = parseQuestions(text, keys, optionLetters);
  console.log(`❓ Распаршено вопросов: ${parsedQuestions.length}`);

  const withAnswers = parsedQuestions.filter(q => q.has_answer).length;
  const withoutAnswers = parsedQuestions.filter(q => !q.has_answer).length;
  console.log(`✅ С ответами: ${withAnswers}`);
  if (withoutAnswers > 0) {
    console.log(`⚠️  Без ответов: ${withoutAnswers}`);
  }

  // ─── Получаем subject_id из БД ───
  const { data: subjectRows, error: subjErr } = await supabase
    .from('uni_subjects')
    .select('id')
    .eq('code', subjectCode)
    .single();

  if (subjErr || !subjectRows) {
    console.error(`❌ Предмет ${subjectCode} не найден в БД:`, subjErr);
    return;
  }
  const subjectId = subjectRows.id;
  console.log(`🆔 Subject ID: ${subjectId}`);

  // ─── Загружаем вопросы батчами ───
  console.log(`\n📤 Загрузка ${parsedQuestions.length} вопросов в ${tableName}...`);
  
  let totalInserted = 0;
  const BATCH_SIZE = 50;

  for (let i = 0; i < parsedQuestions.length; i += BATCH_SIZE) {
    const batch = parsedQuestions.slice(i, i + BATCH_SIZE).map(q => ({
      subject_id: subjectId,
      template_id: null,
      question_text: q.question_text,
      options: q.options,
      explanation: '[MANAS_ONLY]',
      image_url: ''
    }));

    const { error: insertErr } = await supabase
      .from(tableName)
      .insert(batch);

    if (insertErr) {
      console.error(`  ❌ Ошибка батча ${Math.floor(i / BATCH_SIZE) + 1}:`, insertErr.message);
    } else {
      totalInserted += batch.length;
      console.log(`  ✅ Батч ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} вопросов`);
    }
  }

  console.log(`\n🎉 Загружено: ${totalInserted} / ${parsedQuestions.length} вопросов для ${subjectCode}`);
  return parsedQuestions;
}

// ═══════════════════════════════════════════════════════════════════
//  Physics Images Upload
// ═══════════════════════════════════════════════════════════════════

async function uploadPhysicsImages() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🖼️  Загрузка картинок физики в Supabase Storage...`);
  console.log(`${'═'.repeat(60)}`);

  const docXmlPath = path.join(ROOT, 'backend/tmp_images/physics_xml/word/document.xml');
  const relsXmlPath = path.join(ROOT, 'backend/tmp_images/physics_xml/word/_rels/document.xml.rels');
  const mediaDir = path.join(ROOT, 'backend/tmp_images/physics/word/media');

  if (!fs.existsSync(docXmlPath) || !fs.existsSync(relsXmlPath)) {
    console.error('❌ XML файлы физики не найдены! Сначала извлеките их.');
    return;
  }

  const questionImages = parsePhysicsImageMapping(docXmlPath, relsXmlPath);
  const questionsWithImages = Object.keys(questionImages).map(Number).sort((a, b) => a - b);
  console.log(`📊 Вопросы с картинками: ${questionsWithImages.length}`);
  console.log(`📋 Номера: ${questionsWithImages.join(', ')}`);

  let uploadedCount = 0;
  let failedCount = 0;

  for (const qNum of questionsWithImages) {
    const imageFiles = questionImages[qNum];

    for (let imgIdx = 0; imgIdx < imageFiles.length; imgIdx++) {
      const imageFile = imageFiles[imgIdx];
      const imagePath = path.join(mediaDir, imageFile);

      if (!fs.existsSync(imagePath)) {
        console.error(`  ❌ Файл не найден: ${imagePath}`);
        failedCount++;
        continue;
      }

      const ext = path.extname(imageFile).toLowerCase();
      const contentType = ext === '.jpeg' || ext === '.jpg' ? 'image/jpeg' : 'image/png';
      const storageName = `physics_q${qNum}_img${imgIdx + 1}_${Date.now()}${ext}`;

      const fileBuffer = fs.readFileSync(imagePath);

      console.log(`  📤 Загрузка ${imageFile} → ${storageName} (вопрос ${qNum})...`);

      const { error: uploadError } = await supabase.storage
        .from('question-images')
        .upload(storageName, fileBuffer, {
          contentType,
          upsert: false
        });

      if (uploadError) {
        console.error(`  ❌ Ошибка загрузки:`, uploadError.message);
        failedCount++;
        continue;
      }

      const { data: publicUrlData } = supabase.storage
        .from('question-images')
        .getPublicUrl(storageName);

      const publicUrl = publicUrlData.publicUrl;
      console.log(`  🔗 URL: ${publicUrl}`);

      // Берём часть текста вопроса для поиска
      // Используем номер вопроса — ищем вопрос по порядковому номеру (offset)
      // Обновляем вопрос, у которого image_url пустая и question_text содержит текст нашего вопроса
      const text = convertDocxToText(path.join(ROOT, 'Физика.docx'));
      const questions = parseQuestions(text, parseAnswersBlock(text), ['а', 'б', 'в', 'г', 'д']);
      const targetQ = questions.find(q => q.num === qNum);

      if (targetQ) {
        // Ищем первые 50 символов текста для LIKE-запроса
        const searchText = targetQ.question_text.substring(0, 50).replace(/[%_]/g, '\\$&');

        const { data: updateData, error: updateErr } = await supabase
          .from('uni_questions_physics')
          .update({ image_url: publicUrl })
          .like('question_text', `${searchText}%`)
          .eq('image_url', '')
          .select();

        if (updateErr) {
          console.error(`  ❌ Ошибка обновления:`, updateErr.message);
        } else {
          console.log(`  ✅ Обновлено записей: ${updateData.length}`);
          uploadedCount++;
        }
      }
    }
  }

  console.log(`\n🖼️  Итого картинок: загружено ${uploadedCount}, ошибок ${failedCount}`);
}

// ═══════════════════════════════════════════════════════════════════
//  Main Runner
// ═══════════════════════════════════════════════════════════════════

async function run() {
  console.log('🚀 Начинаем загрузку тестов в Supabase (секция МАНАС)...\n');

  // 1) Кыргыз тил — ответы inline "Жообу: X", 4 варианта (а-г)
  await uploadSubject(
    path.join(ROOT, 'Кыргыз тил.docx'),
    'kyrgyz_language',
    'uni_questions_kyrgyz_lang',
    'inline',
    ['а', 'б', 'в', 'г']
  );

  // 2) Тарых — ответы в конце + inline "Жооптору:", 4 варианта (а-г)
  await uploadSubject(
    path.join(ROOT, 'Тарых.docx'),
    'history',
    'uni_questions_history',
    'block',
    ['а', 'б', 'в', 'г']
  );

  // 3) Химия — 5 вариантов (а-д), ОТВЕТЫ ОТСУТСТВУЮТ В ФАЙЛЕ!
  // Пока загружаем без ответов — пользователь должен предоставить ключи
  console.log('\n⚠️  ВНИМАНИЕ: В файле Химия.docx НЕТ ключей ответов!');
  console.log('   Вопросы будут загружены БЕЗ правильных ответов.');
  console.log('   Пожалуйста, предоставьте ключи для обновления.\n');

  await uploadSubject(
    path.join(ROOT, 'химия.docx'),
    'chemistry',
    'uni_questions_chemistry',
    'block',     // попробуем block на случай если ответы где-то спрятаны
    ['а', 'б', 'в', 'г', 'д']
  );

  // 4) Физика — 5 вариантов (а-д), ответы в конце файла
  await uploadSubject(
    path.join(ROOT, 'Физика.docx'),
    'physics',
    'uni_questions_physics',
    'block',
    ['а', 'б', 'в', 'г', 'д']
  );

  // 5) Загрузка картинок для Физики
  await uploadPhysicsImages();

  console.log('\n\n✅ ВСЕ ЗАГРУЗКИ ЗАВЕРШЕНЫ!');
  console.log('──────────────────────────');
  console.log('📌 Напоминание: Химия загружена БЕЗ ответов. Нужны ключи!');
}

run().catch(err => {
  console.error('💥 Критическая ошибка:', err);
  process.exit(1);
});
