/* eslint-disable */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../lib/supabase');

const TO_DELETE = [
  // Текст без условия / варианты все одинаковые / нечего исправлять
  'eaf8b622-a24f-4d7a-805e-1d506183458b', // "Запишите в виде неправильной дроби числа: ; ;" — без чисел
  'f5a566b6-5f6e-4c5c-a359-cdc017267998', // "a = , b = , c = " — все варианты "1"
  '1d20f8ca-4b7c-448d-a562-54e5da9a26a1', // "8 − 4" — все варианты "3", без формул
  '5c4b519c-424f-4350-8a46-78aa2bbaa74f', // "Сократите дроби , , ." — без дробей
  'a679757e-50bb-4177-a93e-a6bbbd4f81ca', // "Вычислите сумму." — без слагаемых, всего 2 варианта
  'd664c1b7-1a46-45ec-9651-7df82dbddb4f', // "Приведите подобные слагаемые. а)" — без слагаемых
  '493d4c7d-6a3c-4623-a9e5-602a0ca1936b', // "Решить уравнение." — без уравнения
  '1382e753-63f7-4253-8ea3-569ccc3f4f99', // Текст полный, но в options всего 2 варианта (мусор "г) д)" внутри)
  '70a35bcb-2826-4090-8869-48a8ab61cbf2', // 3 варианта, ни один не помечен правильным, мусор "д)" в варианте
];

const TO_UPDATE = [
  {
    id: '3070dc25-d9ed-4bf7-9ed0-2aa56ca2a959',
    question_text:
      'Эсептегиле. / Вычислить.\n$$\\frac{(\\sqrt[3]{5}-\\sqrt[3]{9})(\\sqrt{32}-\\sqrt{8})^2}{\\sqrt[3]{40}-\\sqrt[3]{72}}$$',
    options: [
      { text: '2', is_correct: false },
      { text: '4', is_correct: true },
      { text: '6', is_correct: false },
      { text: '9', is_correct: false },
      { text: '8', is_correct: false },
    ],
  },
  {
    id: 'b8b69d5d-86e3-4829-a3bc-c0ce90c51b1f',
    question_text:
      'Эсептегиле. / Вычислить.\n$$\\frac{(\\sqrt{45}-\\sqrt{20})(\\sqrt{12}+\\sqrt{75})\\sqrt{3}}{\\sqrt{5}+\\sqrt{180}}$$',
    options: [
      { text: '2', is_correct: true },
      { text: '7', is_correct: false },
      { text: '$\\sqrt{5}$', is_correct: false },
      { text: '3', is_correct: false },
      { text: '24', is_correct: false },
    ],
  },
  {
    id: '57b2c9f8-061d-4d56-b8a4-fdbdd26c1820',
    question_text:
      'Эсептегиле. / Вычислить.\n$$\\left(\\left(\\frac{1}{3^{\\frac{1}{4}}}\\right)^{8}+\\left(\\frac{3}{2}\\right)^{0}\\right)^{-1}$$',
    options: [
      { text: '0,5', is_correct: false },
      { text: '1', is_correct: false },
      { text: '2', is_correct: false },
      { text: '0,1', is_correct: true },
      { text: '0,9', is_correct: false },
    ],
  },
  {
    id: 'ca60be1b-5d4a-42c7-8a03-279b0c2b280e',
    question_text:
      '$\\vec a$ жана $\\vec b$ векторлорунун арасындагы бурч $\\varphi=\\frac{2\\pi}{3}$ ге барабар. $|\\vec a|=3,\\ |\\vec b|=4$ экендигин пайдаланып, $(3\\vec a-2\\vec b)(\\vec a+2\\vec b)$ скалярдык көбөйтүндүсүн тапкыла. / Угол между векторами $\\vec a$ и $\\vec b$ равен $\\varphi=\\frac{2\\pi}{3}$. Зная, что $|\\vec a|=3,\\ |\\vec b|=4$, найдите скалярное произведение $(3\\vec a-2\\vec b)(\\vec a+2\\vec b)$.',
    options: [
      { text: '60', is_correct: false },
      { text: '61', is_correct: false },
      { text: '−61', is_correct: true },
      { text: '59', is_correct: false },
      { text: '12', is_correct: false },
    ],
  },
  {
    id: '855b74d7-b80e-494b-8fc5-f5eed81c1dfd',
    question_text:
      'Тикбурчтуктун узундугу $\\frac{4}{5}$ м, туурасы $\\frac{1}{4}$ м. Тикбурчтуктун периметрин тапкыла. / Длина прямоугольника $\\frac{4}{5}$ м, ширина $\\frac{1}{4}$ м. Найдите периметр прямоугольника.',
    options: [
      { text: '$1\\frac{1}{20}$ м', is_correct: false },
      { text: '$\\frac{21}{20}$ м', is_correct: false },
      { text: '$\\frac{4}{20}$ м', is_correct: false },
      { text: '$2\\frac{1}{10}$ м', is_correct: true },
      { text: '$\\frac{7}{9}$ м', is_correct: false },
    ],
  },
  {
    id: '20d7eb51-47cc-4d8d-91d7-da21612e61ee',
    question_text:
      'Туюнтманы жөнөкөйлөткүлө жана параметрлердин берилген маанилеринде туюнтманын маанисин эсептегиле. / Упростить и вычислить значение выражения при заданных значениях параметров.\n$$\\left(\\frac{m^{-2}n^{-1}-m^{-1}n^{-2}}{m^{-2}-n^{-2}}-\\frac{1}{m}\\right)\\cdot\\left(mn^{-1}+2+m^{-1}n\\right)^{-1},\\quad m=0{,}003;\\ n=0{,}007$$',
    options: [
      { text: '0,01', is_correct: false },
      { text: '0,3', is_correct: false },
      { text: '3', is_correct: false },
      { text: '30', is_correct: true },
      { text: '0,001', is_correct: false },
    ],
  },
  {
    id: 'cef82aa5-0c12-49e0-9bef-9044b2119298',
    question_text:
      'Функциянын аныкталуу областын тапкыла. / Найдите область определения функции.\n$$y=\\frac{1}{\\sqrt{112x+64+49x^{2}}}$$',
    options: [
      { text: '$(-\\infty;0)$', is_correct: false },
      { text: '$\\left(-\\frac{8}{7};\\frac{8}{7}\\right)$', is_correct: false },
      { text: '$(-\\infty;0]\\cup[0;+\\infty)$', is_correct: false },
      { text: '$\\left(-\\infty;-\\frac{8}{7}\\right)\\cup\\left(-\\frac{8}{7};+\\infty\\right)$', is_correct: true },
      { text: '$\\left(-\\infty;-\\frac{8}{7}\\right]$', is_correct: false },
    ],
  },
];

(async () => {
  const allIds = [...TO_DELETE, ...TO_UPDATE.map((q) => q.id)];

  // 1. Бэкап
  const { data: backup, error: backupErr } = await supabase
    .from('uni_questions_math')
    .select('*')
    .in('id', allIds);
  if (backupErr) {
    console.error('Backup failed:', backupErr.message);
    process.exit(1);
  }
  const backupPath = path.join(__dirname, `broken_math_backup_${Date.now()}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log(`Backup saved: ${backupPath} (${backup.length} rows)`);

  // 2. UPDATE починенных
  let updated = 0;
  for (const q of TO_UPDATE) {
    const { error } = await supabase
      .from('uni_questions_math')
      .update({ question_text: q.question_text, options: q.options })
      .eq('id', q.id);
    if (error) {
      console.error(`UPDATE FAIL ${q.id}:`, error.message);
    } else {
      updated += 1;
      console.log(`UPDATED ${q.id}`);
    }
  }

  // 3. DELETE безнадёжных
  let deleted = 0;
  for (const id of TO_DELETE) {
    const { error } = await supabase.from('uni_questions_math').delete().eq('id', id);
    if (error) {
      console.error(`DELETE FAIL ${id}:`, error.message);
    } else {
      deleted += 1;
      console.log(`DELETED ${id}`);
    }
  }

  console.log(`\nDone: updated=${updated}/${TO_UPDATE.length}, deleted=${deleted}/${TO_DELETE.length}`);
})();
