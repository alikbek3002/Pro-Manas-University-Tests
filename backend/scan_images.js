require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SUBJECTS = ['math', 'logic', 'history', 'english', 'russian', 'kyrgyz'];
const LANGUAGES = ['ru', 'kg'];
const GRADES = [5, 6, 7];

async function scan() {
    for (const s of SUBJECTS) {
        for (const l of LANGUAGES) {
            for (const g of GRADES) {
                const table = `questions_${s}_${l}_${g}`;
                try {
                    const { data, error } = await supabase.from(table).select('id, image_url').not('image_url', 'eq', '').limit(5);
                    if (data && data.length > 0) {
                        console.log(`Table ${table} has images:`, data);
                    }
                } catch (e) {
                    // table might not exist
                }
            }
        }
    }
}
scan();
