/* eslint-disable */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../lib/supabase');

// Latest backup created during fix_broken_math.js
const BACKUP_FILE = path.join(__dirname, 'broken_math_backup_1777914435380.json');
const backupRows = JSON.parse(fs.readFileSync(BACKUP_FILE, 'utf-8'));
const byId = Object.fromEntries(backupRows.map((r) => [r.id, r]));

// 9 questions to restore (re-INSERT with corrected text + options, same UUID, same subject_id/template_id)
const RESTORE = [
  {
    id: 'eaf8b622-a24f-4d7a-805e-1d506183458b', // Q30
    question_text:
      'Төмөнкү сандарды буруш бөлчөк түрүндө жазгыла. / Запишите в виде неправильной дроби числа.\n$5\\frac{3}{2}$; $3\\frac{2}{7}$; $2\\frac{1}{5}$',
    options: [
      { text: '$\\frac{11}{2}$; $\\frac{22}{7}$; $\\frac{7}{5}$', is_correct: false },
      { text: '$\\frac{7}{2}$; $\\frac{10}{7}$; $\\frac{9}{5}$', is_correct: false },
      { text: '$\\frac{5}{2}$; $\\frac{9}{7}$; $\\frac{6}{5}$', is_correct: false },
      { text: '$\\frac{13}{2}$; $\\frac{23}{7}$; $\\frac{11}{5}$', is_correct: true },
      { text: '$\\frac{8}{2}$; $\\frac{5}{7}$; $\\frac{3}{5}$', is_correct: false },
    ],
  },
  {
    id: 'f5a566b6-5f6e-4c5c-a359-cdc017267998', // Q37
    question_text:
      'Эгерде $a=\\frac{30}{31}$, $b=\\frac{25}{31}$ жана $c=\\frac{17}{31}$ болсо, анда $a+b-c$ туюнтмасынын маанисин тапкыла жана аны аралаш бөлчөк түрүндө жазгыла. / Вычислить значение и выделить целую и дробную части выражения $a+b-c$, если $a=\\frac{30}{31}$; $b=\\frac{25}{31}$; $c=\\frac{17}{31}$.',
    options: [
      { text: '$1\\frac{7}{31}$', is_correct: true },
      { text: '$1\\frac{6}{31}$', is_correct: false },
      { text: '$1\\frac{8}{31}$', is_correct: false },
      { text: '$1\\frac{5}{31}$', is_correct: false },
      { text: '$1\\frac{4}{31}$', is_correct: false },
    ],
  },
  {
    id: '1d20f8ca-4b7c-448d-a562-54e5da9a26a1', // Q38
    question_text: 'Эсептегиле. / Вычислить.\n$8\\frac{3}{17}-4\\frac{11}{17}$',
    options: [
      { text: '$3\\frac{3}{17}$', is_correct: false },
      { text: '$3\\frac{8}{17}$', is_correct: false },
      { text: '$3\\frac{5}{17}$', is_correct: false },
      { text: '$3\\frac{9}{17}$', is_correct: true },
      { text: '$3\\frac{10}{17}$', is_correct: false },
    ],
  },
  {
    id: '5c4b519c-424f-4350-8a46-78aa2bbaa74f', // Q85
    question_text:
      'Бөлчөктөрдү кыскарткыла. / Сократите дроби $\\frac{9}{15}$, $\\frac{24}{36}$, $\\frac{9}{54}$.',
    options: [
      { text: '$\\frac{3}{5}$, $\\frac{6}{9}$, $\\frac{3}{18}$', is_correct: false },
      { text: '$\\frac{3}{5}$, $\\frac{12}{58}$, $\\frac{9}{54}$', is_correct: false },
      { text: '$\\frac{3}{5}$, $\\frac{2}{3}$, $\\frac{1}{6}$', is_correct: true },
      { text: '$\\frac{3}{5}$, $\\frac{4}{6}$, $\\frac{1}{6}$', is_correct: false },
      { text: '$\\frac{3}{5}$, $\\frac{8}{12}$, $\\frac{1}{6}$', is_correct: false },
    ],
  },
  {
    id: 'a679757e-50bb-4177-a93e-a6bbbd4f81ca', // Q105
    question_text:
      'Сумманы эсептегиле. / Вычислите сумму.\n$$1-\\frac{1}{2}+\\frac{1}{2}-\\frac{1}{3}+\\frac{1}{3}-\\dots+\\frac{1}{19}-\\frac{1}{20}$$',
    options: [
      { text: '$20\\frac{19}{20}$', is_correct: false },
      { text: '$21\\frac{1}{20}$', is_correct: false },
      { text: '$\\frac{19}{20}$', is_correct: true },
      { text: '21', is_correct: false },
      { text: '0', is_correct: false },
    ],
  },
  {
    id: 'd664c1b7-1a46-45ec-9651-7df82dbddb4f', // Q111
    question_text:
      'Окшош кошулуучуларды топтогула. / Приведите подобные слагаемые.\n$19\\frac{5}{8}a-24a+4\\frac{3}{8}a$',
    options: [
      { text: '$22\\frac{3}{8}$', is_correct: false },
      { text: '0', is_correct: true },
      { text: '$-2a$', is_correct: false },
      { text: '$48a$', is_correct: false },
      { text: '$42a$', is_correct: false },
    ],
  },
  {
    id: '1382e753-63f7-4253-8ea3-569ccc3f4f99', // Q194
    question_text:
      'ABC үч бурчтугунун B жана C чокуларындагы сырткы бурчтарынын биссектрисаларын камтыган түз сызыктар O чекитинде кесилишет. Эгерде $\\angle A=\\alpha$ болсо, BOC бурчун тапкыла. / Прямые, содержащие биссектрисы внешних углов при вершинах B и C треугольника ABC, пересекаются в точке O. Найдите угол BOC, если угол A равен $\\alpha$.',
    options: [
      { text: '$180^{\\circ}-2\\alpha$', is_correct: false },
      { text: '$90^{\\circ}+\\alpha$', is_correct: false },
      { text: '$4\\alpha$', is_correct: false },
      { text: '$\\dfrac{\\alpha}{2}$', is_correct: false },
      { text: '$90^{\\circ}-\\dfrac{\\alpha}{2}$', is_correct: true },
    ],
  },
  {
    id: '493d4c7d-6a3c-4623-a9e5-602a0ca1936b', // Q258
    question_text:
      'Теңдемени чыгаргыла. / Решите уравнение.\n$|5-3x|+1-4x=0$',
    options: [
      { text: '$-4;\\ \\frac{6}{7}$', is_correct: false },
      { text: '$-4$', is_correct: false },
      { text: '$-\\frac{6}{7};\\ 4$', is_correct: false },
      { text: '4', is_correct: false },
      { text: '$\\frac{6}{7}$', is_correct: true },
    ],
  },
  {
    id: '70a35bcb-2826-4090-8869-48a8ab61cbf2', // Q518
    question_text:
      'Жактары 13 см, 14 см, 15 см болгон үч бурчтукка сырттан сызылган айлананын радиусун тапкыла. / Найдите радиус окружности, описанной около треугольника со сторонами 13 см, 14 см и 15 см.',
    options: [
      { text: '$8\\frac{1}{8}$ см', is_correct: true },
      { text: '8 см', is_correct: false },
      { text: '4 см', is_correct: false },
      { text: '12 см', is_correct: false },
      { text: '$4\\frac{1}{2}$ см', is_correct: false },
    ],
  },
];

// Q420: previously updated, but is_correct was wrong — fix to "0,9"
const Q420_ID = '57b2c9f8-061d-4d56-b8a4-fdbdd26c1820';
const Q420_OPTIONS = [
  { text: '0,5', is_correct: false },
  { text: '1', is_correct: false },
  { text: '2', is_correct: false },
  { text: '0,1', is_correct: false },
  { text: '0,9', is_correct: true },
];

(async () => {
  // 1. Re-insert restored questions
  let inserted = 0;
  for (const q of RESTORE) {
    const original = byId[q.id];
    if (!original) {
      console.error(`Backup row missing for ${q.id}`);
      continue;
    }
    // Build full row preserving subject_id, template_id, etc.
    const row = {
      ...original,
      question_text: q.question_text,
      options: q.options,
    };
    // Remove server-generated fields so insert works
    delete row.created_at;
    delete row.updated_at;

    const { error } = await supabase.from('uni_questions_math').insert(row);
    if (error) {
      console.error(`INSERT FAIL ${q.id}:`, error.message);
    } else {
      inserted += 1;
      console.log(`INSERTED ${q.id}`);
    }
  }

  // 2. Fix Q420 correct answer
  const { error: updErr } = await supabase
    .from('uni_questions_math')
    .update({ options: Q420_OPTIONS })
    .eq('id', Q420_ID);
  if (updErr) {
    console.error('Q420 UPDATE failed:', updErr.message);
  } else {
    console.log('UPDATED Q420 is_correct → 0,9');
  }

  console.log(`\nDone: inserted=${inserted}/${RESTORE.length}`);
})();
