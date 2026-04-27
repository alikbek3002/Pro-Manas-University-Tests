/* eslint-disable */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../lib/supabase');

const TABLES = [
  ['uni_questions_math', 'math'],
  ['uni_questions_russian', 'russian'],
  ['uni_questions_physics', 'physics'],
  ['uni_questions_chemistry', 'chemistry'],
  ['uni_questions_biology', 'biology'],
  ['uni_questions_kyrgyz_lang', 'kyrgyz_language'],
  ['uni_questions_kyrgyz_literature', 'kyrgyz_literature'],
  ['uni_questions_history', 'history'],
  ['uni_questions_geography', 'geography'],
  ['uni_questions_english', 'english'],
];

const RX_OPTION_MARKERS = /(?:^|\s|\$|\))\s*[абвгд]\s*\)\s*\(?/;
const RX_EMPTY_VAR = /=\s*[,;.)]/;
const RX_DOUBLE_SPACE_AFTER_EQ = /=\s{2,}/;
const RX_EMPTY_DOLLAR = /\$\s*\$/;

(async () => {
  const audit = {
    embeddedOptions: [],
    emptyVars: [],
    duplicateOptions: [],
    emptyOptions: [],
    emptyDollar: [],
    suspicious: [],
  };

  let totalScanned = 0;

  for (const [table, code] of TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('id, question_text, options')
      .limit(50000);
    if (error) {
      console.error(code, error.message);
      continue;
    }

    totalScanned += (data || []).length;

    for (const q of data || []) {
      const qt = q.question_text || '';
      const opts = Array.isArray(q.options) ? q.options : [];

      if (RX_OPTION_MARKERS.test(qt)) {
        audit.embeddedOptions.push({ table: code, id: q.id, text: qt.slice(0, 140) });
      }
      if (RX_EMPTY_VAR.test(qt) || RX_DOUBLE_SPACE_AFTER_EQ.test(qt)) {
        audit.emptyVars.push({ table: code, id: q.id, text: qt.slice(0, 140) });
      }
      if (RX_EMPTY_DOLLAR.test(qt) || opts.some((o) => RX_EMPTY_DOLLAR.test(o.text || ''))) {
        audit.emptyDollar.push({ table: code, id: q.id, text: qt.slice(0, 140) });
      }
      if (opts.length >= 2) {
        const texts = opts.map((o) => (o.text || '').trim());
        const uniq = new Set(texts);
        if (uniq.size === 1 && texts[0]) {
          audit.duplicateOptions.push({ table: code, id: q.id, sample: texts[0], count: opts.length });
        }
      }
      if (opts.some((o) => !(o.text || '').trim())) {
        audit.emptyOptions.push({ table: code, id: q.id, count: opts.length });
      }
      if (
        opts.length >= 2 &&
        opts.every((o) => (o.text || '').trim().length <= 2 && !/[$\\]/.test(o.text || ''))
      ) {
        audit.suspicious.push({ table: code, id: q.id, opts: opts.map((o) => o.text) });
      }
    }
  }

  console.log('=== AUDIT REPORT ===');
  console.log(`Total questions scanned: ${totalScanned}`);
  console.log('embeddedOptions (варианты внутри текста):', audit.embeddedOptions.length);
  console.log('emptyVars (пустые "="):', audit.emptyVars.length);
  console.log('emptyDollar ($$ пустые):', audit.emptyDollar.length);
  console.log('duplicateOptions (все варианты одинаковые):', audit.duplicateOptions.length);
  console.log('emptyOptions (пустые варианты):', audit.emptyOptions.length);
  console.log('suspicious (короткие варианты без формул):', audit.suspicious.length);
  console.log();
  console.log('--- embeddedOptions (first 5) ---');
  console.log(JSON.stringify(audit.embeddedOptions.slice(0, 5), null, 2));
  console.log('--- duplicateOptions (first 10) ---');
  console.log(JSON.stringify(audit.duplicateOptions.slice(0, 10), null, 2));
  console.log('--- emptyVars (first 5) ---');
  console.log(JSON.stringify(audit.emptyVars.slice(0, 5), null, 2));
  console.log('--- suspicious (first 5) ---');
  console.log(JSON.stringify(audit.suspicious.slice(0, 5), null, 2));

  const reportPath = path.join(__dirname, 'question_audit.json');
  fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));
  console.log();
  console.log(`Full report saved to ${reportPath}`);
})();
