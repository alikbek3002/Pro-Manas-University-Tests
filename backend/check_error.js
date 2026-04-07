const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: `${__dirname}/.env` });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase
        .from('results_main_ru_6')
        .select('id, student_id, answers, total_score, completed_at')
        .order('completed_at', { ascending: false })
        .limit(3);

    console.log('Error:', error);
    console.log('Data:', data);
}

check();
