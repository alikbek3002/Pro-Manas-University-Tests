const express = require('express');
const { buildStudentCatalog, loadQuestionCounts } = require('./lib/testCatalog');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: `${__dirname}/.env` });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testGenerate() {
    const normalizedType = 'MAIN';
    const normalizedSubject = 'history';
    const testPart = 1;

    const student = { grade: 6, language: 'ru' };
    const countsByTable = await loadQuestionCounts(supabase);
    const catalog = buildStudentCatalog(student, countsByTable);
    const mainNode = catalog.test_types.find((node) => node.id === 'MAIN');
    const leaf = mainNode?.items?.find((item) => item.id === normalizedSubject) || null;

    let linesToFetch = leaf.lines;
    console.log('linesToFetch:', linesToFetch);

    const fetchPlan = [];
    for (const line of linesToFetch) {
        fetchPlan.push({
            subject: normalizedSubject,
            grade: line.grade,
            count: 25,
            partNumber: testPart,
        });
    }

    console.log('fetchPlan:', fetchPlan);
}

testGenerate();
