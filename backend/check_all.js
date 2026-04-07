const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: `${__dirname}/.env` });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

async function checkAll() {
    const tables = ['results_main_ru_6', 'results_main_ru_7', 'results_main_kg_6', 'results_main_kg_7'];
    let allTests = [];

    for (const table of tables) {
        const { data, error } = await supabase.from(table).select('id, student_id, answers, total_score, completed_at').order('completed_at', { ascending: false }).limit(3);
        if (data) Object.assign(allTests, [...allTests, ...data.map(d => ({ ...d, table }))]);
    }

    allTests.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
    console.log('Last 5 tests across ALL main tables:');
    console.dir(allTests.slice(0, 5), { depth: null });
}

checkAll();
