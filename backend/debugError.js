require('dotenv').config();
const supabase = require('./lib/supabase');
async function test() {
  const res = await supabase.from('non_existent_table').select('*', { count: 'exact', head: true });
  console.log(JSON.stringify(res, null, 2));
}
test();
