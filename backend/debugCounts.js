require('dotenv').config();
const supabase = require('./lib/supabase');
const { loadQuestionCounts } = require('./lib/testCatalog');

async function check() {
  try {
    const counts = await loadQuestionCounts(supabase, { forceRefresh: true });
    console.log("Counts:", JSON.stringify(counts, null, 2));
  } catch (err) {
    console.error(err);
  }
}
check();
