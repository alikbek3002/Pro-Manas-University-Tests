require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const { execSync } = require('child_process');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

function convertDocxToText(filePath) {
  try {
    const output = execSync(`textutil -convert txt "${filePath}" -stdout`);
    return output.toString('utf-8');
  } catch (error) {
    console.error(`Failed to convert ${filePath}`, error);
    process.exit(1);
  }
}

function parseAnswers(text) {
  const answers = {};
  const lines = text.split(/\r?\n|\u2028|\u2029/);
  let inAnswersSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes('ЖООПТОР') || trimmed.includes('1-б') && trimmed.includes('2-')) {
      inAnswersSection = true;
    }

    if (inAnswersSection || trimmed.match(/^\d+-[абвгд]$/i)) {
      // Sometimes multiple answers occur on the same line separated by spaces or tabs
      const parts = trimmed.split(/[\s,]+/);
      for (const part of parts) {
        const match = part.match(/^(\d+)-([абвгд])$/i);
        if (match) {
          answers[parseInt(match[1], 10)] = match[2].toLowerCase();
        }
      }
    }
  }
  return answers;
}

function parseQuestions(text, keys) {
  const questions = [];
  // Match any block starting with a number and "-суроо"
  const regex = /^(\d+)-суроо/gm;
  let match;
  const indices = [];
  while ((match = regex.exec(text)) !== null) {
    indices.push({ index: match.index, num: parseInt(match[1], 10) });
  }

  const optionRegex = /^([абвгд])\)\s*(.*)$/im;

  for (let i = 0; i < indices.length; i++) {
    const startObj = indices[i];
    const end = i + 1 < indices.length ? indices[i + 1].index : text.length;
    let block = text.substring(startObj.index, end).trim();

    // Stop parsing if we hit the answers section
    const answersIndex = block.indexOf('ЖООПТОР');
    if(answersIndex !== -1) {
       block = block.substring(0, answersIndex).trim();
    }
    
    // Stop if we hit image list
    const imgListIndex = block.indexOf('Сүрөт/схема колдонулганын көргөн суроолор:');
    if (imgListIndex !== -1) {
       block = block.substring(0, imgListIndex).trim();
    }

    const lines = block.split(/\r?\n|\u2028|\u2029/).map(l => l.trim()).filter(l => l);
    if (lines.length < 2) continue; // Needs at least the header and question text

    let questionText = "";
    const options = [];
    
    for (let j = 1; j < lines.length; j++) {
      const line = lines[j];
      if (line === 'Суроо:') continue;
      
      const optMatch = line.match(/^([абвгд])\)\s*(.*)/i);
      if (optMatch) {
         options.push({
             letter: optMatch[1].toLowerCase(),
             text: optMatch[2]
         });
      } else {
         if (options.length === 0) {
             questionText += (questionText ? "\n" : "") + line;
         } else {
             // Append to last option if it wrapped
             options[options.length-1].text += " " + line;
         }
      }
    }

    if (options.length > 0 && questionText) {
      const qNum = startObj.num;
      const keyLetter = keys[qNum] || 'а'; // default to 'а' if not found
      
      const finalOptions = options.map(opt => ({
          text: opt.text,
          is_correct: opt.letter === keyLetter
      }));

      // Ensure at least one true
      if (!finalOptions.some(o => o.is_correct)) {
          finalOptions[0].is_correct = true;
      }

      questions.push({
          num: qNum,
          question_text: questionText,
          options: finalOptions,
          explanation: '[MANAS_ONLY]'
      });
    }
  }

  return questions;
}

async function uploadSubject(filePath, subjectCode, tableName) {
  console.log(`Processing ${filePath} for subject ${subjectCode}...`);
  if (!fs.existsSync(filePath)) {
    console.error(`File ${filePath} not found!`);
    return;
  }

  const text = convertDocxToText(filePath);
  const keys = parseAnswers(text);
  console.log(`Found ${Object.keys(keys).length} answer keys.`);

  const parsedQuestions = parseQuestions(text, keys);
  console.log(`Parsed ${parsedQuestions.length} questions.`);

  const { data: subjectRows, error: subjErr } = await supabase
    .from('uni_subjects')
    .select('id')
    .eq('code', subjectCode)
    .single();

  if (subjErr || !subjectRows) {
     console.error(`Failed to find subject_id for ${subjectCode}:`, subjErr);
     return;
  }
  const subjectId = subjectRows.id;

  console.log(`Uploading ${parsedQuestions.length} items to ${tableName} with subject_id ${subjectId}...`);
  
  const BATCH_SIZE = 50;
  for (let i = 0; i < parsedQuestions.length; i += BATCH_SIZE) {
     const batch = parsedQuestions.slice(i, i + BATCH_SIZE).map(q => ({
        subject_id: subjectId,
        template_id: null,
        question_text: q.question_text,
        options: q.options,
        explanation: q.explanation,
        image_url: ""
     }));

     const { error: insertErr } = await supabase
        .from(tableName)
        .insert(batch);
     
     if (insertErr) {
        console.error(`Error inserting batch ${i / BATCH_SIZE}:`, insertErr);
     } else {
        console.log(`Inserted batch ${i / BATCH_SIZE + 1} (${batch.length} items).`);
     }
  }

  console.log(`Done for ${subjectCode}.`);
}

async function run() {
  await uploadSubject('/Users/alikbekmukanbetov/Desktop/ProManas/География.docx', 'geography', 'uni_questions_geography');
  await uploadSubject('/Users/alikbekmukanbetov/Desktop/ProManas/Биология.docx', 'biology', 'uni_questions_biology');
  console.log("All uploads complete.");
}

run();
