/* eslint-disable */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const supabase = require('../lib/supabase');

const TABLES = {
  math: 'uni_questions_math',
  russian: 'uni_questions_russian',
  physics: 'uni_questions_physics',
  chemistry: 'uni_questions_chemistry',
  biology: 'uni_questions_biology',
  kyrgyz_language: 'uni_questions_kyrgyz_lang',
  kyrgyz_literature: 'uni_questions_kyrgyz_literature',
  history: 'uni_questions_history',
  geography: 'uni_questions_geography',
  english: 'uni_questions_english',
};

// Cyrillic-only markers (а/б/в/г/д) — латинские игнорируем чтобы не путать
// с подписями переменных типа "A(a; b)".
const FIRST_MARKER_RX = /([\s\$\)\n])([абвгд])\)\s*/;

function splitFirstMarker(text) {
  const m = FIRST_MARKER_RX.exec(text);
  if (!m) return null;
  const startOfMarker = m.index + m[1].length;
  const startOfContent = m.index + m[0].length;
  return {
    stem: text.slice(0, startOfMarker).trim(),
    afterMarker: text.slice(startOfContent).trim(),
    letter: m[2],
  };
}

function looksLikeDuplicateOfStem(stem, afterMarker) {
  if (!afterMarker) return true;
  // Extract the longest math formula or numeric core from afterMarker.
  // If it occurs verbatim inside stem — afterMarker just repeats the problem statement.
  const cleanedAfter = afterMarker.replace(/\s+/g, '');
  const cleanedStem = stem.replace(/\s+/g, '');
  if (cleanedStem.includes(cleanedAfter)) return true;
  // Check for high overlap (≥80%)
  if (cleanedAfter.length > 12) {
    const overlap = [...cleanedAfter].filter((ch) => cleanedStem.includes(ch)).length;
    if (overlap / cleanedAfter.length > 0.95 && cleanedAfter.length > cleanedStem.length * 0.5) return true;
  }
  return false;
}

const APPLY = process.argv.includes('--apply');

(async () => {
  const auditPath = path.join(__dirname, 'question_audit.json');
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));

  const results = {
    fixed_with_inserted_A: [],
    fixed_only_stripped: [],
    skippedNoMarker: [],
    skippedAllEmpty: [],
    leftoverManual: [],
    errors: [],
  };

  for (const item of audit.embeddedOptions) {
    const tableName = TABLES[item.table];
    if (!tableName) continue;

    const { data: row, error: rowErr } = await supabase
      .from(tableName)
      .select('id, question_text, options')
      .eq('id', item.id)
      .maybeSingle();
    if (rowErr || !row) {
      results.errors.push({ id: item.id, table: item.table, reason: 'fetch failed' });
      continue;
    }

    const split = splitFirstMarker(row.question_text || '');
    if (!split) {
      results.skippedNoMarker.push({ id: item.id, table: item.table, text: (row.question_text || '').slice(0, 100) });
      continue;
    }

    const opts = Array.isArray(row.options) ? row.options : [];
    const hasMeaningfulOptions = opts.length >= 2 && opts.some((o) => o && o.is_correct && (o.text || '').trim().length > 1);

    // Case 1: stem is fine, options already correct, after-marker is empty or just dangling letters
    if (!split.afterMarker || /^[а-яёa-z\s\)\(]{0,4}$/i.test(split.afterMarker)) {
      // Just strip the dangling marker
      if (!hasMeaningfulOptions) {
        results.leftoverManual.push({
          id: item.id,
          table: item.table,
          reason: 'no marker content + no meaningful options',
          stem: split.stem.slice(0, 100),
          options: opts,
        });
        continue;
      }
      const fixed = { question_text: split.stem };
      if (APPLY) {
        const { error: e } = await supabase.from(tableName).update(fixed).eq('id', item.id);
        if (e) {
          results.errors.push({ id: item.id, table: item.table, reason: e.message });
          continue;
        }
      }
      results.fixed_only_stripped.push({ id: item.id, table: item.table, stem: split.stem.slice(0, 80) });
      continue;
    }

    // Case 2: after-marker duplicates the stem (junk repetition)
    if (looksLikeDuplicateOfStem(split.stem, split.afterMarker)) {
      if (!hasMeaningfulOptions) {
        results.leftoverManual.push({
          id: item.id,
          table: item.table,
          reason: 'after-marker is duplicate of stem + no meaningful options',
          stem: split.stem.slice(0, 100),
        });
        continue;
      }
      const fixed = { question_text: split.stem };
      if (APPLY) {
        const { error: e } = await supabase.from(tableName).update(fixed).eq('id', item.id);
        if (e) {
          results.errors.push({ id: item.id, table: item.table, reason: e.message });
          continue;
        }
      }
      results.fixed_only_stripped.push({
        id: item.id,
        table: item.table,
        stem: split.stem.slice(0, 80),
        note: 'dropped duplicate after-marker',
      });
      continue;
    }

    // Case 3: after-marker is real content → re-insert as option A (incorrect)
    if (!hasMeaningfulOptions) {
      results.leftoverManual.push({
        id: item.id,
        table: item.table,
        reason: 'no meaningful options to anchor',
        stem: split.stem.slice(0, 100),
        recoveredOptionA: split.afterMarker,
      });
      continue;
    }

    // Avoid duplicating: if afterMarker text already exists as some option — just strip
    const existsInOptions = opts.some((o) => (o.text || '').trim() === split.afterMarker);
    if (existsInOptions) {
      const fixed = { question_text: split.stem };
      if (APPLY) {
        const { error: e } = await supabase.from(tableName).update(fixed).eq('id', item.id);
        if (e) {
          results.errors.push({ id: item.id, table: item.table, reason: e.message });
          continue;
        }
      }
      results.fixed_only_stripped.push({
        id: item.id,
        table: item.table,
        stem: split.stem.slice(0, 80),
        note: 'after-marker already in options',
      });
      continue;
    }

    const newOptions = [{ text: split.afterMarker, is_correct: false }, ...opts];
    const fixed = { question_text: split.stem, options: newOptions };
    if (APPLY) {
      const { error: e } = await supabase.from(tableName).update(fixed).eq('id', item.id);
      if (e) {
        results.errors.push({ id: item.id, table: item.table, reason: e.message });
        continue;
      }
    }
    results.fixed_with_inserted_A.push({
      id: item.id,
      table: item.table,
      stem: split.stem.slice(0, 80),
      insertedA: split.afterMarker.slice(0, 80),
      options: newOptions.map((o) => o.text),
    });
  }

  console.log(`\nMode: ${APPLY ? 'APPLY (writes to DB)' : 'DRY-RUN'}`);
  console.log(`Total embedded: ${audit.embeddedOptions.length}`);
  console.log(`Fixed (stripped only): ${results.fixed_only_stripped.length}`);
  console.log(`Fixed (inserted recovered option A): ${results.fixed_with_inserted_A.length}`);
  console.log(`Skipped (no marker): ${results.skippedNoMarker.length}`);
  console.log(`Skipped (all empty): ${results.skippedAllEmpty.length}`);
  console.log(`Manual review needed: ${results.leftoverManual.length}`);
  console.log(`Errors: ${results.errors.length}`);

  const reportPath = path.join(__dirname, 'embedded_fix_report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nFull report → ${reportPath}`);
})();
