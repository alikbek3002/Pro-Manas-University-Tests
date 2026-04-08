const { createClient } = require('@supabase/supabase-js');

function stripWrappingQuotes(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1).trim();
  }
  return raw;
}

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

const supabaseUrl = stripWrappingQuotes(process.env.SUPABASE_URL);
const supabaseKey = stripWrappingQuotes(process.env.SUPABASE_SERVICE_ROLE_KEY);

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
    'Set them in Railway Variables or in a local .env file.',
  );
}

const supabaseKeyPayload = decodeJwtPayload(supabaseKey);
if (supabaseKeyPayload?.role !== 'service_role') {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY is invalid for backend usage. ' +
    'Use the Service Role key from the same Supabase project as SUPABASE_URL.',
  );
}

const supabase = createClient(supabaseUrl, supabaseKey);

module.exports = supabase;
