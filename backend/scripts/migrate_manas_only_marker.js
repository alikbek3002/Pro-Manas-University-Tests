/* eslint-disable */
/**
 * One-shot: переносит маркер [MANAS_ONLY] из колонки explanation в tags (тег 'manas_only')
 * и очищает остаток explanation. Если после удаления маркера остаётся пробел/мусор —
 * explanation становится пустой строкой.
 *
 *   node backend/scripts/migrate_manas_only_marker.js          # dry-run
 *   node backend/scripts/migrate_manas_only_marker.js --apply  # запись
 */
require('dotenv').config();
const supabase = require('../lib/supabase');

const TABLES = [
  'uni_questions_math',
  'uni_questions_russian',
  'uni_questions_physics',
  'uni_questions_chemistry',
  'uni_questions_biology',
  'uni_questions_kyrgyz_lang',
  'uni_questions_kyrgyz_literature',
  'uni_questions_history',
  'uni_questions_geography',
  'uni_questions_english',
];

const APPLY = process.argv.includes('--apply');

(async () => {
  let totalScanned = 0;
  let totalToFix = 0;
  let totalApplied = 0;
  const errors = [];

  for (const table of TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select('id, explanation, tags')
      .ilike('explanation', '%[MANAS_ONLY]%');

    if (error) {
      console.error(`[${table}] fetch error:`, error.message);
      continue;
    }

    totalScanned += (data || []).length;
    if (!data || data.length === 0) {
      console.log(`[${table}] no rows with [MANAS_ONLY] marker.`);
      continue;
    }

    console.log(`[${table}] found ${data.length} rows to migrate`);
    totalToFix += data.length;

    for (const row of data) {
      const cleanedExplanation = String(row.explanation || '').replace(/\[MANAS_ONLY\]/g, '').trim();
      const baseTags = Array.isArray(row.tags) ? row.tags : [];
      const tagSet = new Set(baseTags.map((t) => String(t).trim()).filter(Boolean));
      tagSet.add('manas_only');
      const newTags = [...tagSet];

      if (!APPLY) continue;

      const { error: updErr } = await supabase
        .from(table)
        .update({ explanation: cleanedExplanation, tags: newTags })
        .eq('id', row.id);

      if (updErr) {
        errors.push({ table, id: row.id, error: updErr.message });
        console.error(`  [${table}/${row.id}] update failed:`, updErr.message);
        continue;
      }
      totalApplied += 1;
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`Rows with marker: ${totalToFix}`);
  if (APPLY) {
    console.log(`Rows updated: ${totalApplied}`);
    console.log(`Errors: ${errors.length}`);
    if (errors.length) console.log(JSON.stringify(errors.slice(0, 20), null, 2));
  } else {
    console.log('Run with --apply to write changes.');
  }
})();
