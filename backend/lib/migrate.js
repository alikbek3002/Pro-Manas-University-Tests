const supabase = require('./supabase');

async function tableExists(tableName) {
  const { error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1);

  return !error;
}

async function runMigrations() {
  try {
    console.log('Checking university schema...');

    const requiredTables = [
      'uni_programs',
      'uni_students',
      'uni_student_programs',
      'uni_subjects',
      'uni_program_subjects',
      'uni_questions',
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
      'uni_test_templates',
      'uni_test_sessions',
      'uni_navigation_nodes',
    ];

    const missing = [];
    for (const table of requiredTables) {
      const exists = await tableExists(table);
      if (!exists) {
        missing.push(table);
      }
    }

    if (missing.length > 0) {
      console.warn('\n⚠️  Missing university tables in Supabase:');
      for (const t of missing) {
        console.warn(` - ${t}`);
      }
      console.warn('\nRun migration_university_schema_rls.sql in Supabase SQL Editor.\n');
      return false;
    }

    console.log('University schema is ready.');
    return true;
  } catch (error) {
    console.error('Schema check failed:', error.message);
    return false;
  }
}

module.exports = { runMigrations };
