const { createClient } = require('@supabase/supabase-js');

function stripWrappingQuotes(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

const supabaseUrl = stripWrappingQuotes(process.env.SUPABASE_URL);
const supabaseKey = stripWrappingQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY. ' +
    'Set them in Railway Variables or in a local .env file.',
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
