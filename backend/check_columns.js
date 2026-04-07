require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.rpc('get_table_info', { t_name: 'questions_history_kg_5' });
    // Since I might not have rpc, I'll just select all from one row and log keys
    const { data: row, error: err } = await supabase.from('questions_history_kg_5').select('*').limit(1).single();
    console.log('Keys:', row ? Object.keys(row) : 'null');
    console.log('Row:', JSON.stringify(row, null, 2));
}
check();
