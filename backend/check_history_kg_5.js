require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await supabase.from('questions_history_kg_5').select('id, question_text, image_url').limit(10);
    console.log('Error:', error);
    console.log('Data:', JSON.stringify(data, null, 2));
}
check();
