-- ============================================================================
-- ProManas University migration (ОРТ / Медицинский / Манас)
-- Creates a new normalized schema with RLS enabled for all uni_* tables.
-- Safe to run multiple times.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 0) Cleanup old school schema (legacy project)
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
BEGIN
  -- Drop old dynamic tables first
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND (
        tablename LIKE 'questions_%'
        OR tablename LIKE 'results_%'
      )
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE;', tbl);
  END LOOP;

  -- Drop old core tables
  EXECUTE 'DROP TABLE IF EXISTS public.students CASCADE;';
  EXECUTE 'DROP TABLE IF EXISTS public.admin_users CASCADE;';
END $$;

-- ----------------------------------------------------------------------------
-- 1) Programs and students
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.uni_programs (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('ort', 'medical', 'manas')),
  manas_track TEXT,
  description TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT uni_programs_manas_track_check CHECK (
    (account_type = 'manas' AND manas_track IN ('all_subjects', 'humanities', 'exact_sciences'))
    OR (account_type <> 'manas' AND manas_track IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.uni_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  plain_password TEXT,

  account_type TEXT NOT NULL CHECK (account_type IN ('ort', 'medical', 'manas')),
  manas_track TEXT,

  active_session_token TEXT,
  previous_session_token TEXT,

  blocked_until TIMESTAMPTZ,
  blocked_permanently BOOLEAN NOT NULL DEFAULT false,
  screenshot_strikes INTEGER NOT NULL DEFAULT 0,

  notes TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  CONSTRAINT uni_students_manas_track_check CHECK (
    (account_type = 'manas' AND manas_track IN ('all_subjects', 'humanities', 'exact_sciences'))
    OR (account_type <> 'manas' AND manas_track IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_uni_students_account_type ON public.uni_students (account_type);
CREATE INDEX IF NOT EXISTS idx_uni_students_manas_track ON public.uni_students (manas_track);

CREATE TABLE IF NOT EXISTS public.uni_student_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.uni_students(id) ON DELETE CASCADE,
  program_code TEXT NOT NULL REFERENCES public.uni_programs(code) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (student_id, program_code)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_uni_student_programs_primary
ON public.uni_student_programs(student_id)
WHERE is_primary = true;

-- ----------------------------------------------------------------------------
-- 2) Content taxonomy (subjects, lessons, videos)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.uni_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.uni_program_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_code TEXT NOT NULL REFERENCES public.uni_programs(code) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.uni_subjects(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  lessons_target INTEGER,
  UNIQUE (program_code, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_uni_program_subjects_program ON public.uni_program_subjects(program_code, sort_order);

CREATE TABLE IF NOT EXISTS public.uni_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_code TEXT NOT NULL REFERENCES public.uni_programs(code) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.uni_subjects(id) ON DELETE SET NULL,

  lesson_number INTEGER,
  title TEXT NOT NULL,
  lesson_kind TEXT NOT NULL DEFAULT 'video' CHECK (lesson_kind IN ('video', 'theory', 'practice', 'analysis')),

  video_url TEXT,
  video_provider TEXT,
  duration_seconds INTEGER,

  is_published BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_uni_lessons_program_subject_order
ON public.uni_lessons(program_code, subject_id, sort_order);

CREATE TABLE IF NOT EXISTS public.uni_video_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID REFERENCES public.uni_lessons(id) ON DELETE CASCADE,
  program_code TEXT NOT NULL REFERENCES public.uni_programs(code) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.uni_subjects(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  hls_url TEXT,
  file_url TEXT,
  duration_seconds INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_uni_video_assets_program_subject_order
ON public.uni_video_assets(program_code, subject_id, sort_order);

-- ----------------------------------------------------------------------------
-- 3) Tests and questions
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.uni_test_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  program_code TEXT NOT NULL REFERENCES public.uni_programs(code) ON DELETE CASCADE,
  subject_id UUID REFERENCES public.uni_subjects(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  test_kind TEXT NOT NULL CHECK (
    test_kind IN ('subject_test', 'mock_test', 'trial_test', 'lesson_quiz', 'final_test', 'random_ai_test')
  ),

  round_no INTEGER,
  lesson_no INTEGER,
  questions_total INTEGER,
  ai_generated BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,

  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_uni_test_templates_program_kind
ON public.uni_test_templates(program_code, test_kind, round_no);

CREATE TABLE IF NOT EXISTS public.uni_test_template_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.uni_test_templates(id) ON DELETE CASCADE,
  section_code TEXT,
  section_title TEXT NOT NULL,
  subject_id UUID REFERENCES public.uni_subjects(id) ON DELETE SET NULL,
  question_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_uni_test_template_sections_template
ON public.uni_test_template_sections(template_id, sort_order);

CREATE TABLE IF NOT EXISTS public.uni_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id UUID REFERENCES public.uni_subjects(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.uni_test_templates(id) ON DELETE SET NULL,
  lesson_id UUID REFERENCES public.uni_lessons(id) ON DELETE SET NULL,

  question_text TEXT NOT NULL,
  options JSONB NOT NULL,
  explanation TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',

  difficulty SMALLINT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_uni_questions_subject ON public.uni_questions(subject_id);
CREATE INDEX IF NOT EXISTS idx_uni_questions_template ON public.uni_questions(template_id);

-- Subject-specific question tables (performance-oriented split)
CREATE TABLE IF NOT EXISTS public.uni_questions_math (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS public.uni_questions_russian (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS public.uni_questions_physics (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS public.uni_questions_chemistry (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS public.uni_questions_biology (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS public.uni_questions_kyrgyz_lang (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS public.uni_questions_kyrgyz_literature (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS public.uni_questions_history (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS public.uni_questions_geography (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
CREATE TABLE IF NOT EXISTS public.uni_questions_english (LIKE public.uni_questions INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);

CREATE TABLE IF NOT EXISTS public.uni_test_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.uni_students(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.uni_test_templates(id) ON DELETE RESTRICT,

  generated_questions JSONB NOT NULL DEFAULT '{}'::jsonb,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score NUMERIC(8,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'expired')),

  started_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_uni_test_sessions_student_started
ON public.uni_test_sessions(student_id, started_at DESC);

-- ----------------------------------------------------------------------------
-- 4) Navigation tree (for UI rendering)
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.uni_navigation_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_code TEXT NOT NULL REFERENCES public.uni_programs(code) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.uni_navigation_nodes(id) ON DELETE CASCADE,

  node_key TEXT NOT NULL,
  node_type TEXT NOT NULL CHECK (node_type IN ('root', 'section', 'subject', 'lesson_group', 'test_group', 'test', 'item')),
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,

  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),

  UNIQUE (program_code, node_key)
);

CREATE INDEX IF NOT EXISTS idx_uni_navigation_nodes_program_parent_order
ON public.uni_navigation_nodes(program_code, parent_id, sort_order);

-- ----------------------------------------------------------------------------
-- 4b) Reconcile existing partial schema (safe for already-initialized Supabase)
-- ----------------------------------------------------------------------------

-- Add missing columns for core tables if they were created earlier in a reduced form.
ALTER TABLE IF EXISTS public.uni_programs
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS account_type TEXT,
  ADD COLUMN IF NOT EXISTS manas_track TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

ALTER TABLE IF EXISTS public.uni_subjects
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

ALTER TABLE IF EXISTS public.uni_program_subjects
  ADD COLUMN IF NOT EXISTS program_code TEXT,
  ADD COLUMN IF NOT EXISTS subject_id UUID,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lessons_target INTEGER;

ALTER TABLE IF EXISTS public.uni_students
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS plain_password TEXT,
  ADD COLUMN IF NOT EXISTS account_type TEXT,
  ADD COLUMN IF NOT EXISTS manas_track TEXT,
  ADD COLUMN IF NOT EXISTS active_session_token TEXT,
  ADD COLUMN IF NOT EXISTS previous_session_token TEXT,
  ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS blocked_permanently BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS screenshot_strikes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

ALTER TABLE IF EXISTS public.uni_test_templates
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS program_code TEXT,
  ADD COLUMN IF NOT EXISTS subject_id UUID,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS test_kind TEXT,
  ADD COLUMN IF NOT EXISTS round_no INTEGER,
  ADD COLUMN IF NOT EXISTS lesson_no INTEGER,
  ADD COLUMN IF NOT EXISTS questions_total INTEGER,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

ALTER TABLE IF EXISTS public.uni_navigation_nodes
  ADD COLUMN IF NOT EXISTS program_code TEXT,
  ADD COLUMN IF NOT EXISTS parent_id UUID,
  ADD COLUMN IF NOT EXISTS node_key TEXT,
  ADD COLUMN IF NOT EXISTS node_type TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());

-- Remove duplicates before creating unique indexes (needed for ON CONFLICT).
DELETE FROM public.uni_programs a
USING public.uni_programs b
WHERE a.ctid < b.ctid
  AND a.code IS NOT NULL
  AND b.code IS NOT NULL
  AND a.code = b.code;

DELETE FROM public.uni_subjects a
USING public.uni_subjects b
WHERE a.ctid < b.ctid
  AND a.code IS NOT NULL
  AND b.code IS NOT NULL
  AND a.code = b.code;

DELETE FROM public.uni_students a
USING public.uni_students b
WHERE a.ctid < b.ctid
  AND a.username IS NOT NULL
  AND b.username IS NOT NULL
  AND lower(a.username) = lower(b.username);

DELETE FROM public.uni_program_subjects a
USING public.uni_program_subjects b
WHERE a.ctid < b.ctid
  AND a.program_code IS NOT NULL
  AND b.program_code IS NOT NULL
  AND a.subject_id IS NOT NULL
  AND b.subject_id IS NOT NULL
  AND a.program_code = b.program_code
  AND a.subject_id = b.subject_id;

DELETE FROM public.uni_test_templates a
USING public.uni_test_templates b
WHERE a.ctid < b.ctid
  AND a.code IS NOT NULL
  AND b.code IS NOT NULL
  AND a.code = b.code;

DELETE FROM public.uni_navigation_nodes a
USING public.uni_navigation_nodes b
WHERE a.ctid < b.ctid
  AND a.program_code IS NOT NULL
  AND b.program_code IS NOT NULL
  AND a.node_key IS NOT NULL
  AND b.node_key IS NOT NULL
  AND a.program_code = b.program_code
  AND a.node_key = b.node_key;

-- Ensure unique indexes required by ON CONFLICT clauses.
CREATE UNIQUE INDEX IF NOT EXISTS uq_uni_programs_code ON public.uni_programs(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_uni_subjects_code ON public.uni_subjects(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_uni_students_username ON public.uni_students(lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS uq_uni_program_subjects_program_subject ON public.uni_program_subjects(program_code, subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_uni_test_templates_code ON public.uni_test_templates(code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_uni_navigation_nodes_program_key ON public.uni_navigation_nodes(program_code, node_key);

-- ----------------------------------------------------------------------------
-- 5) Seed: programs
-- ----------------------------------------------------------------------------

INSERT INTO public.uni_programs (code, name, account_type, manas_track, description)
VALUES
  ('ort_base', 'ОРТ', 'ort', NULL, 'Видеоуроки и пробные тесты'),
  ('medical_base', 'Медицинский', 'medical', NULL, 'Химия и Биология: видеоуроки и тесты'),
  ('manas_all_subjects', 'Манас: Все предметы', 'manas', 'all_subjects', '8 уроков по предметам + пробные тесты + общий тест'),
  ('manas_humanities', 'Манас: Гуманитарий', 'manas', 'humanities', '6 предметов + пробные тесты + общий тест'),
  ('manas_exact_sciences', 'Манас: Точные науки', 'manas', 'exact_sciences', '6 предметов + пробные тесты + общий тест')
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true;

-- ----------------------------------------------------------------------------
-- 6) Seed: subjects and program-subject mapping
-- ----------------------------------------------------------------------------

INSERT INTO public.uni_subjects (code, title, description)
VALUES
  ('ort_math', 'Математика', 'ОРТ'),
  ('ort_analogy', 'Аналогия', 'ОРТ'),
  ('ort_grammar', 'Грамматика', 'ОРТ'),
  ('ort_reading', 'Чтение', 'ОРТ'),

  ('med_chemistry', 'Химия', 'Медицинский трек'),
  ('med_biology', 'Биология', 'Медицинский трек'),

  ('manas_all_subj_1', 'Предмет 1', 'Манас: все предметы'),
  ('manas_all_subj_2', 'Предмет 2', 'Манас: все предметы'),
  ('manas_all_subj_3', 'Предмет 3', 'Манас: все предметы'),
  ('manas_all_subj_4', 'Предмет 4', 'Манас: все предметы'),
  ('manas_all_subj_5', 'Предмет 5', 'Манас: все предметы'),
  ('manas_all_subj_6', 'Предмет 6', 'Манас: все предметы'),
  ('manas_all_subj_7', 'Предмет 7', 'Манас: все предметы'),
  ('manas_all_subj_8', 'Предмет 8', 'Манас: все предметы'),

  ('manas_hum_subj_1', 'Гуманитарный предмет 1', 'Манас: гуманитарий'),
  ('manas_hum_subj_2', 'Гуманитарный предмет 2', 'Манас: гуманитарий'),
  ('manas_hum_subj_3', 'Гуманитарный предмет 3', 'Манас: гуманитарий'),
  ('manas_hum_subj_4', 'Гуманитарный предмет 4', 'Манас: гуманитарий'),
  ('manas_hum_subj_5', 'Гуманитарный предмет 5', 'Манас: гуманитарий'),
  ('manas_hum_subj_6', 'Гуманитарный предмет 6', 'Манас: гуманитарий'),

  ('manas_exact_subj_1', 'Точный предмет 1', 'Манас: точные науки'),
  ('manas_exact_subj_2', 'Точный предмет 2', 'Манас: точные науки'),
  ('manas_exact_subj_3', 'Точный предмет 3', 'Манас: точные науки'),
  ('manas_exact_subj_4', 'Точный предмет 4', 'Манас: точные науки'),
  ('manas_exact_subj_5', 'Точный предмет 5', 'Манас: точные науки'),
  ('manas_exact_subj_6', 'Точный предмет 6', 'Манас: точные науки')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order, lessons_target)
SELECT 'ort_base', s.id,
  CASE s.code
    WHEN 'ort_math' THEN 1
    WHEN 'ort_analogy' THEN 2
    WHEN 'ort_grammar' THEN 3
    WHEN 'ort_reading' THEN 4
    ELSE 999 END,
  CASE s.code
    WHEN 'ort_math' THEN 65
    WHEN 'ort_analogy' THEN 20
    WHEN 'ort_grammar' THEN 20
    WHEN 'ort_reading' THEN 25
    ELSE NULL END
FROM public.uni_subjects s
WHERE s.code IN ('ort_math', 'ort_analogy', 'ort_grammar', 'ort_reading')
ON CONFLICT (program_code, subject_id) DO NOTHING;

INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order)
SELECT 'medical_base', s.id,
  CASE s.code
    WHEN 'med_chemistry' THEN 1
    WHEN 'med_biology' THEN 2
    ELSE 999 END
FROM public.uni_subjects s
WHERE s.code IN ('med_chemistry', 'med_biology')
ON CONFLICT (program_code, subject_id) DO NOTHING;

INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order, lessons_target)
SELECT 'manas_all_subjects', s.id,
  row_number() OVER (ORDER BY s.code),
  8
FROM public.uni_subjects s
WHERE s.code LIKE 'manas_all_subj_%'
ON CONFLICT (program_code, subject_id) DO NOTHING;

INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order, lessons_target)
SELECT 'manas_humanities', s.id,
  row_number() OVER (ORDER BY s.code),
  8
FROM public.uni_subjects s
WHERE s.code LIKE 'manas_hum_subj_%'
ON CONFLICT (program_code, subject_id) DO NOTHING;

INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order, lessons_target)
SELECT 'manas_exact_sciences', s.id,
  row_number() OVER (ORDER BY s.code),
  8
FROM public.uni_subjects s
WHERE s.code LIKE 'manas_exact_subj_%'
ON CONFLICT (program_code, subject_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6b) University subject model (10 core subjects)
-- ----------------------------------------------------------------------------

INSERT INTO public.uni_subjects (code, title, description)
VALUES
  ('math', 'Математика', 'Университетский модуль'),
  ('russian', 'Русский язык', 'Университетский модуль'),
  ('physics', 'Физика', 'Университетский модуль'),
  ('chemistry', 'Химия', 'Университетский модуль'),
  ('biology', 'Биология', 'Университетский модуль'),
  ('kyrgyz_language', 'Кыргызский язык', 'Университетский модуль'),
  ('kyrgyz_literature', 'Кыргыз Адабият', 'Университетский модуль'),
  ('history', 'История', 'Университетский модуль'),
  ('geography', 'География', 'Университетский модуль'),
  ('english', 'Английский язык', 'Университетский модуль')
ON CONFLICT (code) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description;

-- ORT (облегчённый набор)
INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order, lessons_target)
SELECT 'ort_base', s.id, x.sort_order, 30
FROM public.uni_subjects s
JOIN (
  VALUES
    ('math', 1),
    ('russian', 2),
    ('history', 3),
    ('geography', 4),
    ('english', 5)
) AS x(code, sort_order)
  ON x.code = s.code
ON CONFLICT (program_code, subject_id) DO UPDATE
SET sort_order = EXCLUDED.sort_order;

-- Medical (профильный набор)
INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order, lessons_target)
SELECT 'medical_base', s.id, x.sort_order, 30
FROM public.uni_subjects s
JOIN (
  VALUES
    ('chemistry', 1),
    ('biology', 2),
    ('physics', 3),
    ('math', 4)
) AS x(code, sort_order)
  ON x.code = s.code
ON CONFLICT (program_code, subject_id) DO UPDATE
SET sort_order = EXCLUDED.sort_order;

-- Manas all subjects (10 предметов)
INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order, lessons_target)
SELECT 'manas_all_subjects', s.id, x.sort_order, x.lesson_target
FROM public.uni_subjects s
JOIN (
  VALUES
    ('math', 1, 30),
    ('russian', 2, 30),
    ('physics', 3, 30),
    ('chemistry', 4, 30),
    ('biology', 5, 30),
    ('kyrgyz_language', 6, 30),
    ('kyrgyz_literature', 7, 30),
    ('history', 8, 30),
    ('geography', 9, 30),
    ('english', 10, 40)
) AS x(code, sort_order, lesson_target)
  ON x.code = s.code
ON CONFLICT (program_code, subject_id) DO UPDATE
SET
  sort_order = EXCLUDED.sort_order,
  lessons_target = EXCLUDED.lessons_target;

-- Manas humanities (6)
INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order, lessons_target)
SELECT 'manas_humanities', s.id, x.sort_order, 30
FROM public.uni_subjects s
JOIN (
  VALUES
    ('russian', 1),
    ('kyrgyz_language', 2),
    ('kyrgyz_literature', 3),
    ('history', 4),
    ('geography', 5),
    ('english', 6)
) AS x(code, sort_order)
  ON x.code = s.code
ON CONFLICT (program_code, subject_id) DO UPDATE
SET sort_order = EXCLUDED.sort_order;

-- Manas exact sciences (6)
INSERT INTO public.uni_program_subjects (program_code, subject_id, sort_order, lessons_target)
SELECT 'manas_exact_sciences', s.id, x.sort_order, 30
FROM public.uni_subjects s
JOIN (
  VALUES
    ('math', 1),
    ('physics', 2),
    ('chemistry', 3),
    ('biology', 4),
    ('english', 5),
    ('geography', 6)
) AS x(code, sort_order)
  ON x.code = s.code
ON CONFLICT (program_code, subject_id) DO UPDATE
SET sort_order = EXCLUDED.sort_order;

-- ----------------------------------------------------------------------------
-- 7) Seed: test templates (based on your navigation trees)
-- ----------------------------------------------------------------------------

-- ORT: 5 trial tests with fixed 5x30 structure
INSERT INTO public.uni_test_templates (code, program_code, title, test_kind, round_no, questions_total, meta)
VALUES
  ('ort_trial_1', 'ort_base', 'ОРТ: Сынамык тест 1', 'trial_test', 1, 150, '{"subjects":["math_column","math_classic","analogy","reading","grammar"]}'::jsonb),
  ('ort_trial_2', 'ort_base', 'ОРТ: Сынамык тест 2', 'trial_test', 2, 150, '{"subjects":["math_column","math_classic","analogy","reading","grammar"]}'::jsonb),
  ('ort_trial_3', 'ort_base', 'ОРТ: Сынамык тест 3', 'trial_test', 3, 150, '{"subjects":["math_column","math_classic","analogy","reading","grammar"]}'::jsonb),
  ('ort_trial_4', 'ort_base', 'ОРТ: Сынамык тест 4', 'trial_test', 4, 150, '{"subjects":["math_column","math_classic","analogy","reading","grammar"]}'::jsonb),
  ('ort_trial_5', 'ort_base', 'ОРТ: Сынамык тест 5', 'trial_test', 5, 150, '{"subjects":["math_column","math_classic","analogy","reading","grammar"]}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- ORT sections (30 questions each)
INSERT INTO public.uni_test_template_sections (template_id, section_code, section_title, question_count, sort_order)
SELECT t.id, sec.code, sec.title, 30, sec.sort_order
FROM public.uni_test_templates t
CROSS JOIN (
  VALUES
    ('math_column', 'Математика (колонка)', 1),
    ('math_classic', 'Математика (классика)', 2),
    ('analogy', 'Аналогия', 3),
    ('reading', 'Чтение', 4),
    ('grammar', 'Грамматика', 5)
) AS sec(code, title, sort_order)
LEFT JOIN public.uni_test_template_sections x
  ON x.template_id = t.id AND x.section_code = sec.code
WHERE t.code LIKE 'ort_trial_%'
  AND x.id IS NULL;

-- Medical: chemistry/biology subject tests (12x10), mock tests (2x40), AI random (10)
DO $$
DECLARE
  idx INTEGER;
BEGIN
  FOR idx IN 1..12 LOOP
    INSERT INTO public.uni_test_templates (code, program_code, subject_id, title, test_kind, round_no, questions_total)
    SELECT
      format('med_chem_subject_%s', lpad(idx::text, 2, '0')),
      'medical_base',
      s.id,
      format('Химия: предметтик тест %s', idx),
      'subject_test',
      idx,
      10
    FROM public.uni_subjects s
    WHERE s.code = 'med_chemistry'
    ON CONFLICT (code) DO NOTHING;

    INSERT INTO public.uni_test_templates (code, program_code, subject_id, title, test_kind, round_no, questions_total)
    SELECT
      format('med_bio_subject_%s', lpad(idx::text, 2, '0')),
      'medical_base',
      s.id,
      format('Биология: предметтик тест %s', idx),
      'subject_test',
      idx,
      10
    FROM public.uni_subjects s
    WHERE s.code = 'med_biology'
    ON CONFLICT (code) DO NOTHING;
  END LOOP;
END $$;

INSERT INTO public.uni_test_templates (code, program_code, subject_id, title, test_kind, round_no, questions_total)
SELECT 'med_chem_mock_1', 'medical_base', s.id, 'Химия: сынамык тест 1', 'mock_test', 1, 40
FROM public.uni_subjects s WHERE s.code = 'med_chemistry'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.uni_test_templates (code, program_code, subject_id, title, test_kind, round_no, questions_total)
SELECT 'med_chem_mock_2', 'medical_base', s.id, 'Химия: сынамык тест 2', 'mock_test', 2, 40
FROM public.uni_subjects s WHERE s.code = 'med_chemistry'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.uni_test_templates (code, program_code, subject_id, title, test_kind, round_no, questions_total)
SELECT 'med_bio_mock_1', 'medical_base', s.id, 'Биология: сынамык тест 1', 'mock_test', 1, 40
FROM public.uni_subjects s WHERE s.code = 'med_biology'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.uni_test_templates (code, program_code, subject_id, title, test_kind, round_no, questions_total)
SELECT 'med_bio_mock_2', 'medical_base', s.id, 'Биология: сынамык тест 2', 'mock_test', 2, 40
FROM public.uni_subjects s WHERE s.code = 'med_biology'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.uni_test_templates (code, program_code, subject_id, title, test_kind, questions_total, ai_generated)
SELECT 'med_chem_ai_random', 'medical_base', s.id, 'Химия: AI рандомный тест', 'random_ai_test', 10, true
FROM public.uni_subjects s WHERE s.code = 'med_chemistry'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.uni_test_templates (code, program_code, subject_id, title, test_kind, questions_total, ai_generated)
SELECT 'med_bio_ai_random', 'medical_base', s.id, 'Биология: AI рандомный тест', 'random_ai_test', 10, true
FROM public.uni_subjects s WHERE s.code = 'med_biology'
ON CONFLICT (code) DO NOTHING;

-- Manas: common final tests for each subtype
INSERT INTO public.uni_test_templates (code, program_code, title, test_kind, questions_total, meta)
VALUES
  ('manas_all_final', 'manas_all_subjects', 'Манас (все предметы): общий тест', 'final_test', NULL, '{"subjects_count":10}'::jsonb),
  ('manas_humanities_final', 'manas_humanities', 'Манас (гуманитарий): общий тест', 'final_test', NULL, '{"subjects_count":6}'::jsonb),
  ('manas_exact_final', 'manas_exact_sciences', 'Манас (точные науки): общий тест', 'final_test', NULL, '{"subjects_count":6}'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- University subject tests: 20 tests x 20 questions for each linked subject
DO $$
DECLARE
  p RECORD;
  t_idx INTEGER;
  subject_code_safe TEXT;
BEGIN
  FOR p IN
    SELECT
      ps.program_code,
      s.id AS subject_id,
      s.code AS subject_code,
      s.title AS subject_title
    FROM public.uni_program_subjects ps
    JOIN public.uni_subjects s ON s.id = ps.subject_id
    WHERE s.code IN (
      'math',
      'russian',
      'physics',
      'chemistry',
      'biology',
      'kyrgyz_language',
      'kyrgyz_literature',
      'history',
      'geography',
      'english'
    )
  LOOP
    subject_code_safe := regexp_replace(lower(p.subject_code), '[^a-z0-9_]+', '_', 'g');

    FOR t_idx IN 1..20 LOOP
      INSERT INTO public.uni_test_templates (
        code,
        program_code,
        subject_id,
        title,
        test_kind,
        round_no,
        questions_total,
        is_active
      )
      VALUES (
        format('%s_%s_test_%s', p.program_code, subject_code_safe, lpad(t_idx::text, 2, '0')),
        p.program_code,
        p.subject_id,
        format('%s: предметтик тест %s', p.subject_title, t_idx),
        'subject_test',
        t_idx,
        20,
        true
      )
      ON CONFLICT (code) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- 8) Seed: navigation tree (ORT + MED + MANAS high-level)
-- ----------------------------------------------------------------------------

-- ORT root
INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
VALUES
  ('ort_base', NULL, 'ort_root', 'root', 'ОРТ / Логин пароль', 1, '{}'::jsonb)
ON CONFLICT (program_code, node_key) DO NOTHING;

-- ORT sections
INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'ort_base', n.id, 'ort_video_section', 'section', 'Видеоурок', 1, '{}'::jsonb
FROM public.uni_navigation_nodes n
WHERE n.program_code = 'ort_base' AND n.node_key = 'ort_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'ort_base', n.id, 'ort_trial_section', 'section', 'Сынамык тест (1,2,3,4,5)', 2, '{"rounds":[1,2,3,4,5]}'::jsonb
FROM public.uni_navigation_nodes n
WHERE n.program_code = 'ort_base' AND n.node_key = 'ort_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

-- ORT video leaves
INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'ort_base', p.id, x.node_key, 'subject', x.title, x.sort_order, x.meta
FROM public.uni_navigation_nodes p
JOIN (
  VALUES
    ('ort_video_math', 'Математика', 1, '{"lesson_count":65}'::jsonb),
    ('ort_video_analogy', 'Аналогия', 2, '{"lesson_count":20}'::jsonb),
    ('ort_video_grammar', 'Грамматика', 3, '{"lesson_count":20}'::jsonb),
    ('ort_video_reading', 'Чтение', 4, '{"lesson_count":25}'::jsonb)
) AS x(node_key, title, sort_order, meta)
ON true
WHERE p.program_code = 'ort_base' AND p.node_key = 'ort_video_section'
ON CONFLICT (program_code, node_key) DO NOTHING;

-- ORT trial structure (per round the same blocks)
INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'ort_base', p.id, x.node_key, 'item', x.title, x.sort_order, x.meta
FROM public.uni_navigation_nodes p
JOIN (
  VALUES
    ('ort_trial_math_column', 'Математика (колонка)', 1, '{"question_count":30}'::jsonb),
    ('ort_trial_math_classic', 'Математика (классика)', 2, '{"question_count":30}'::jsonb),
    ('ort_trial_analogy', 'Аналогия', 3, '{"question_count":30}'::jsonb),
    ('ort_trial_reading', 'Чтение', 4, '{"question_count":30}'::jsonb),
    ('ort_trial_grammar', 'Грамматика', 5, '{"question_count":30}'::jsonb)
) AS x(node_key, title, sort_order, meta)
ON true
WHERE p.program_code = 'ort_base' AND p.node_key = 'ort_trial_section'
ON CONFLICT (program_code, node_key) DO NOTHING;

-- Medical root
INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
VALUES
  ('medical_base', NULL, 'med_root', 'root', 'МЕД / Логин пароль', 1, '{}'::jsonb)
ON CONFLICT (program_code, node_key) DO NOTHING;

-- Medical subject roots
INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order)
SELECT 'medical_base', r.id, 'med_chemistry_root', 'subject', 'Химия', 1
FROM public.uni_navigation_nodes r
WHERE r.program_code = 'medical_base' AND r.node_key = 'med_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order)
SELECT 'medical_base', r.id, 'med_biology_root', 'subject', 'Биология', 2
FROM public.uni_navigation_nodes r
WHERE r.program_code = 'medical_base' AND r.node_key = 'med_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

-- Chemistry branches
INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order)
SELECT 'medical_base', p.id, 'med_chem_theory', 'section', 'Теория', 1
FROM public.uni_navigation_nodes p
WHERE p.program_code = 'medical_base' AND p.node_key = 'med_chemistry_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'medical_base', p.id, 'med_chem_subject_tests', 'test_group', 'Предметтик тесттер', 2, '{"tests_count":12,"question_count":10}'::jsonb
FROM public.uni_navigation_nodes p
WHERE p.program_code = 'medical_base' AND p.node_key = 'med_chemistry_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'medical_base', p.id, 'med_chem_mock_tests', 'test_group', 'Сынамык тесттер', 3, '{"tests":[{"round":1,"question_count":40},{"round":2,"question_count":40}]}'::jsonb
FROM public.uni_navigation_nodes p
WHERE p.program_code = 'medical_base' AND p.node_key = 'med_chemistry_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'medical_base', p.id, x.node_key, 'item', x.title, x.sort_order, x.meta
FROM public.uni_navigation_nodes p
JOIN (
  VALUES
    ('med_chem_theory_video', 'Видеоурок', 1, '{"count":60}'::jsonb),
    ('med_chem_theory_practice', 'Тапшырма', 2, '{"count":60}'::jsonb),
    ('med_chem_theory_review', 'Разбор', 3, '{"count":60}'::jsonb)
) AS x(node_key, title, sort_order, meta)
ON true
WHERE p.program_code = 'medical_base' AND p.node_key = 'med_chem_theory'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'medical_base', p.id, 'med_chem_ai_random', 'test', 'ИИ менен рандомный тест', 99, '{"question_count":10}'::jsonb
FROM public.uni_navigation_nodes p
WHERE p.program_code = 'medical_base' AND p.node_key = 'med_chem_subject_tests'
ON CONFLICT (program_code, node_key) DO NOTHING;

-- Biology branches
INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order)
SELECT 'medical_base', p.id, 'med_bio_theory', 'section', 'Теория', 1
FROM public.uni_navigation_nodes p
WHERE p.program_code = 'medical_base' AND p.node_key = 'med_biology_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'medical_base', p.id, 'med_bio_subject_tests', 'test_group', 'Предметтик тесттер', 2, '{"tests_count":12,"question_count":10}'::jsonb
FROM public.uni_navigation_nodes p
WHERE p.program_code = 'medical_base' AND p.node_key = 'med_biology_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'medical_base', p.id, 'med_bio_mock_tests', 'test_group', 'Сынамык тесттер', 3, '{"tests":[{"round":1,"question_count":40},{"round":2,"question_count":40}]}'::jsonb
FROM public.uni_navigation_nodes p
WHERE p.program_code = 'medical_base' AND p.node_key = 'med_biology_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'medical_base', p.id, x.node_key, 'item', x.title, x.sort_order, x.meta
FROM public.uni_navigation_nodes p
JOIN (
  VALUES
    ('med_bio_theory_video', 'Видеоурок', 1, '{"count":80}'::jsonb),
    ('med_bio_theory_practice', 'Тапшырма', 2, '{"count":80}'::jsonb),
    ('med_bio_theory_review', 'Разбор', 3, '{"count":80}'::jsonb)
) AS x(node_key, title, sort_order, meta)
ON true
WHERE p.program_code = 'medical_base' AND p.node_key = 'med_bio_theory'
ON CONFLICT (program_code, node_key) DO NOTHING;

-- Manas roots (high-level structure based on your description)
INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
VALUES
  ('manas_all_subjects', NULL, 'manas_all_root', 'root', 'Манас: Все предметы', 1, '{}'::jsonb),
  ('manas_humanities', NULL, 'manas_human_root', 'root', 'Манас: Гуманитарий', 1, '{}'::jsonb),
  ('manas_exact_sciences', NULL, 'manas_exact_root', 'root', 'Манас: Точные науки', 1, '{}'::jsonb)
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'manas_all_subjects', r.id, 'manas_all_subjects_branch', 'section', 'Предметы', 1, '{"subjects_count":10,"lessons_per_subject":30,"has_trial_per_lesson":true}'::jsonb
FROM public.uni_navigation_nodes r
WHERE r.program_code = 'manas_all_subjects' AND r.node_key = 'manas_all_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'manas_all_subjects', r.id, 'manas_all_general_test', 'test', 'Общий тест', 2, '{}'::jsonb
FROM public.uni_navigation_nodes r
WHERE r.program_code = 'manas_all_subjects' AND r.node_key = 'manas_all_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'manas_humanities', r.id, 'manas_human_subjects_branch', 'section', 'Предметы', 1, '{"subjects_count":6,"lessons_per_subject":30,"has_trial_per_lesson":true}'::jsonb
FROM public.uni_navigation_nodes r
WHERE r.program_code = 'manas_humanities' AND r.node_key = 'manas_human_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'manas_humanities', r.id, 'manas_human_general_test', 'test', 'Общий тест', 2, '{}'::jsonb
FROM public.uni_navigation_nodes r
WHERE r.program_code = 'manas_humanities' AND r.node_key = 'manas_human_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'manas_exact_sciences', r.id, 'manas_exact_subjects_branch', 'section', 'Предметы', 1, '{"subjects_count":6,"lessons_per_subject":30,"has_trial_per_lesson":true}'::jsonb
FROM public.uni_navigation_nodes r
WHERE r.program_code = 'manas_exact_sciences' AND r.node_key = 'manas_exact_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

INSERT INTO public.uni_navigation_nodes (program_code, parent_id, node_key, node_type, title, sort_order, meta)
SELECT 'manas_exact_sciences', r.id, 'manas_exact_general_test', 'test', 'Общий тест', 2, '{}'::jsonb
FROM public.uni_navigation_nodes r
WHERE r.program_code = 'manas_exact_sciences' AND r.node_key = 'manas_exact_root'
ON CONFLICT (program_code, node_key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 9) Storage bucket for question images
-- ----------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('question-images', 'question-images', true)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'question_images_public_read'
  ) THEN
    CREATE POLICY question_images_public_read
      ON storage.objects
      FOR SELECT
      TO anon, authenticated
      USING (bucket_id = 'question-images');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'question_images_service_role_all'
  ) THEN
    CREATE POLICY question_images_service_role_all
      ON storage.objects
      FOR ALL
      TO service_role
      USING (bucket_id = 'question-images')
      WITH CHECK (bucket_id = 'question-images');
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 10) RLS policies
-- ----------------------------------------------------------------------------

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOR table_name IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename LIKE 'uni_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role;', table_name);

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'service_role_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY service_role_all ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);',
        table_name
      );
    END IF;
  END LOOP;
END $$;

-- Read-only policy for authenticated users on safe catalog/content tables
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'uni_programs',
    'uni_subjects',
    'uni_program_subjects',
    'uni_navigation_nodes',
    'uni_lessons',
    'uni_video_assets',
    'uni_test_templates',
    'uni_test_template_sections'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = table_name
        AND policyname = 'authenticated_read'
    ) THEN
      EXECUTE format(
        'CREATE POLICY authenticated_read ON public.%I FOR SELECT TO authenticated USING (true);',
        table_name
      );
    END IF;
  END LOOP;
END $$;

COMMIT;
