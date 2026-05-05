-- Apply this in the Supabase SQL editor before running scripts/upload_english_tests.js.
-- It is also included in migration_university_schema_rls.sql for fresh installs.

CREATE TABLE IF NOT EXISTS public.uni_english_passages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_number SMALLINT NOT NULL,
  passage_index SMALLINT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (test_number, passage_index)
);

ALTER TABLE public.uni_english_passages ENABLE ROW LEVEL SECURITY;
