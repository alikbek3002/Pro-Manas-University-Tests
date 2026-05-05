/* eslint-disable */
require('dotenv').config();
const supabase = require('../lib/supabase');

const IDS = [
  'a679757e-50bb-4177-a93e-a6bbbd4f81ca',
  'd664c1b7-1a46-45ec-9651-7df82dbddb4f',
  '1382e753-63f7-4253-8ea3-569ccc3f4f99',
  '493d4c7d-6a3c-4623-a9e5-602a0ca1936b',
  '70a35bcb-2826-4090-8869-48a8ab61cbf2',
  'f5a566b6-5f6e-4c5c-a359-cdc017267998',
  '3070dc25-d9ed-4bf7-9ed0-2aa56ca2a959',
  'b8b69d5d-86e3-4829-a3bc-c0ce90c51b1f',
  '57b2c9f8-061d-4d56-b8a4-fdbdd26c1820',
  'ca60be1b-5d4a-42c7-8a03-279b0c2b280e',
  '855b74d7-b80e-494b-8fc5-f5eed81c1dfd',
  '20d7eb51-47cc-4d8d-91d7-da21612e61ee',
  'cef82aa5-0c12-49e0-9bef-9044b2119298',
  'eaf8b622-a24f-4d7a-805e-1d506183458b',
  '1d20f8ca-4b7c-448d-a562-54e5da9a26a1',
  '5c4b519c-424f-4350-8a46-78aa2bbaa74f',
];

(async () => {
  const { data, error } = await supabase
    .from('uni_questions_math')
    .select('id, question_text, options, explanation, image_url, tags')
    .in('id', IDS);
  if (error) {
    console.error(error);
    process.exit(1);
  }
  for (const q of data) {
    console.log('========================================');
    console.log('ID:', q.id);
    console.log('TEXT:', JSON.stringify(q.question_text));
    console.log('OPTIONS:', JSON.stringify(q.options, null, 2));
    console.log('IMAGE:', q.image_url || '-');
  }
  console.log('Found:', data.length, '/ expected', IDS.length);
})();
