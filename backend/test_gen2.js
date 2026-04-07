const { createClient } = require('@supabase/supabase-js');
const { fetchRandomQuestionsStrict } = require('./routes/testRoutes'); // wait, I can just copy the func here.
require('dotenv').config({ path: `${__dirname}/.env` });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

function buildQuestionTableName(subject, language, grade) {
    const normLang = subject === 'mathlogic' ? 'ru' : language;
    return `questions_${subject}_${normLang}_${grade}`;
}

async function fetchQuestions({ subject, language, grade, requiredCount, subjectTable, questionType, partNumber }) {
    const actualTable = subjectTable || subject;
    const tableName = buildQuestionTableName(actualTable, language, grade);
    let selectFields = 'id, question_text, options, topic, explanation, image_url';

    let query = supabase.from(tableName).select(selectFields).order('id', { ascending: true });
    if (questionType) query = query.eq('question_type', questionType);

    if (partNumber) {
        const limit = requiredCount;
        const offset = (partNumber - 1) * limit;
        query = query.range(offset, offset + limit - 1);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

async function testGenerate() {
    const fetchPlan = [
        { subject: 'history', grade: 5, count: 25, partNumber: 1 },
        { subject: 'history', grade: 6, count: 25, partNumber: 1 }
    ];

    const groupedQuestions = await Promise.all(
        fetchPlan.map(planItem => fetchQuestions({ ...planItem, language: 'ru' }))
    );

    const questions = groupedQuestions.flat();
    console.log('generated questions count:', questions.length);
}

testGenerate();
