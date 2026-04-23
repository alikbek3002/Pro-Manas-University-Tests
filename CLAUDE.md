# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo layout

Four independent npm projects (each with its own `package.json`, no root workspace):

- `backend/` — Node 22 / Express 5 API (CommonJS). Deploys to Railway. Talks to Supabase (Postgres) and Cloudflare R2.
- `admin-frontend/` — React 19 + Vite + TypeScript + Tailwind v4 + shadcn/Radix + Zustand. Admin panel (students, videos, questions, tests catalog).
- `student-frontend/` — React 19 + Vite + TS + Tailwind + React Query + Zustand + `hls.js`. Main learner app (login, dashboard, test flow, history, video lessons).
- `demo-frontend/` — Trimmed public demo flow; shares shape with `student-frontend` but hits `/api/demo-tests`.

The UI copy and most identifiers are in Russian / Kyrgyz. Preserve the language of existing text when editing.

## Commands

All commands run from the relevant package directory.

Backend (`backend/`):
- `npm run dev` — nodemon on `index.js`, port `5050` (configurable via `PORT`).
- `npm start` — production start (`node index.js`).
- `npm run videos:sync:manas` / `npm run videos:upload:r2` — one-shot scripts in `scripts/` for seeding the Manas video catalog and uploading video files to Cloudflare R2.
- Ad-hoc diagnostics live at the root of `backend/` (`check_*.js`, `debug*.js`, `test_*.js`) — run with `node <file>.js`. There is **no test runner wired up**; these are manual probes.

Each frontend (`admin-frontend/`, `student-frontend/`, `demo-frontend/`):
- `npm run dev` — Vite dev server. Fixed ports: admin `5174`, student `5173`. Each proxies `/api` → `http://localhost:5050`.
- `npm run build` — `tsc -b && vite build`. TypeScript errors fail the build; there is no separate typecheck script.
- `npm run lint` — ESLint.
- `npm start` — runs `server.cjs` (tiny Express app that serves `dist/` and proxies `/api` to `API_TARGET`, default `http://localhost:5050`). Used in the Railway/Vercel deploy; not usually needed locally.

Typical dev loop: `backend && npm run dev` in one terminal, `admin-frontend && npm run dev` (or `student-frontend`) in another. Visit the frontend port — do not visit `5050` directly, the API has no UI.

## Backend architecture

Entry: [backend/index.js](backend/index.js). Wires CORS (allowlist from `CORS_ORIGIN` env, comma-separated), `express.json`, an in-memory per-IP rate limiter (stricter on `/api/tests/login` and `/api/tests/generate`), then mounts three routers:

- `/api/tests` → [backend/routes/testRoutes.js](backend/routes/testRoutes.js) — student-facing: login, generate test, answer, submit, history, video listing/proxy, screenshot-violation reporting.
- `/api/demo-tests` → [backend/routes/demoTestRoutes.js](backend/routes/demoTestRoutes.js) — anonymous demo flow; `answer`/`submit` are stateless (no persistence).
- `/api/admin` → [backend/routes/adminRoutes.js](backend/routes/adminRoutes.js) — CRUD for students, programs, questions, videos, stats; gated by `requireAdmin` middleware.

Supporting libs in [backend/lib/](backend/lib/):

- `supabase.js` — single `@supabase/supabase-js` client constructed from `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Fails fast if the key's JWT `role` isn't `service_role`. This is the service-role client — it bypasses RLS, so every query must be gated by route-level auth.
- `adminAuth.js` / `studentAuth.js` — hand-rolled HMAC-SHA256 signed tokens (not real JWT). `base64url(payload).base64url(sig)`. Payloads carry `role: 'admin' | 'student'` and `exp`. Both use the same `JWT_SECRET`. Student tokens also support sliding refresh (`X-Student-Token` response header when expiry is < 5 min).
- `universitySubjects.js` — the **single source of truth for subjects**. Each subject has a canonical code (`math`, `russian`, `physics`, `chemistry`, `biology`, `kyrgyz_language`, `kyrgyz_literature`, `history`, `geography`, `english`), its per-subject question table (`uni_questions_<code>`), and legacy aliases (e.g. `manas_exact_subj_1` → `math`). Always go through `canonicalizeSubjectCode` / `getQuestionTableBySubjectCode` — never hard-code subject codes or table names in routes.
- `videoCatalog.js` — uses a direct `pg.Pool` against `RAILWAY_VIDEO_DATABASE_URL` / `VIDEO_DATABASE_URL` / `DATABASE_URL` (connection-pooler URL) for the `uni_video_lessons` table. The rest of the backend uses Supabase JS; only the video catalog uses raw SQL.
- `videoUploader.js` + `videoPresigner.js` — Cloudflare R2 upload (via `@aws-sdk/lib-storage` multipart) and presigned GET URLs. Configured via `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_S3_ENDPOINT` (or derived from `CLOUDFLARE_ACCOUNT_ID`).
- `migrate.js` — **not a migration runner**. On boot, it checks that the `uni_*` tables exist and prints a warning if any are missing. The actual schema lives in [migration_university_schema_rls.sql](migration_university_schema_rls.sql) and must be applied by hand in the Supabase SQL editor.

## Database schema (Supabase / Postgres)

All application tables are prefixed `uni_*` (see [migration_university_schema_rls.sql](migration_university_schema_rls.sql)). Key tables:

- `uni_programs`, `uni_students`, `uni_student_programs`, `uni_subjects`, `uni_program_subjects` — students, programs, and the many-to-many subject mapping.
- `uni_questions` + one table per subject: `uni_questions_math`, `uni_questions_russian`, `uni_questions_physics`, `uni_questions_chemistry`, `uni_questions_biology`, `uni_questions_kyrgyz_lang`, `uni_questions_kyrgyz_literature`, `uni_questions_history`, `uni_questions_geography`, `uni_questions_english`. Question options and `is_correct` flags live inside a JSONB `options` column.
- `uni_test_templates`, `uni_test_sessions` — catalog of tests and active/submitted sessions.
- `uni_video_lessons` — one row per video, references an R2 object key and (optionally) an HLS manifest URL.
- `uni_navigation_nodes` — menu/structure tree.

RLS is enabled; the backend uses the service-role key and bypasses it, so authorization is enforced in Express, not in Postgres.

Students come in three `account_type`s: `ort`, `medical`, `manas`. `manas` further branches by `manas_track` (`all_subjects`, `humanities`, `exact_sciences`). The default subject set per account/track is computed in [adminRoutes.js](backend/routes/adminRoutes.js) (`DEFAULT_PROGRAM_BY_*`) and mirrored in [testRoutes.js](backend/routes/testRoutes.js) (`getDefaultSubjectCodesForProgram`) — if you add an account type or track, update **both**.

## Frontend architecture

All three frontends share the same shape:

- `src/App.tsx` — `BrowserRouter` with `lazy`-loaded routes and a `ProtectedRoute` wrapper that reads auth from the store.
- `src/store/authStore.ts` — Zustand store with `persist` middleware → `localStorage`. Holds `token` + user object. On 401, the student frontend calls `setOnUnauthorized` to clear test snapshots, purge React Query cache, and log out (soft redirect, no hard reload — see the comment in [student-frontend/src/App.tsx](student-frontend/src/App.tsx) about Android rehydration races).
- `src/lib/api.ts` — thin `fetch` wrappers. Reads `VITE_API_URL` env (falls back to `/api`). In dev the Vite proxy forwards to `http://localhost:5050`; in prod the frontend's `server.cjs` proxies to `API_TARGET`.
- Math rendering uses `react-markdown` + `remark-math` + `rehype-katex` (see `MarkdownRenderer.tsx`). Admin-side math input additionally uses `mathlive` + a `MathToolbar` / `VisualMathModal`.
- Vite `manualChunks` split vendors (`react-core`, `markdown`, `forms`, `supabase`, `mathlive`, `ui-vendor`) to keep the initial bundle small — keep new heavy deps in a matching chunk.

## Architectural invariants (do not violate)

These are spelled out in [ARCHITECTURE_AND_RULES.md](ARCHITECTURE_AND_RULES.md), [backend/BACKEND_GUIDELINES.md](backend/BACKEND_GUIDELINES.md), and [admin-frontend/FRONTEND_GUIDELINES.md](admin-frontend/FRONTEND_GUIDELINES.md). In short:

1. **Railway never serves media.** The API returns JSON + signed URLs only. Never stream `.mp4`/`.ts` bytes through Express, and never add a route that reads a video file into memory. Video chunks must go client ↔ Cloudflare R2 / HLS CDN directly. The one exception is the tightly rate-limited grant-token proxy at `/api/tests/videos/proxy/:grantId`, which exists to avoid leaking presigned URLs into browser history — treat it as a narrow signed-redirect, not a streaming endpoint.
2. **Supabase connections must use the transaction pooler (port 6543).** This matters for `DATABASE_URL`-style envs (the `pg.Pool` in `videoCatalog.js`). The JS client via `supabase.js` pools internally.
3. **No frontend deploy on Railway.** Frontends go to Vercel / Cloudflare Pages. The `server.cjs` files exist only for local `npm start` parity and the Railway preview if someone does run it there.
4. **HLS, not raw MP4, for playback.** The student frontend uses `hls.js`; the admin frontend only uploads — it does not embed a player.
5. **Async all the way.** No sync Supabase / R2 calls on the request path; it will pin the event loop under load.

## Environment variables

Minimum for the backend to boot:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — required; server throws otherwise.
- `JWT_SECRET` — required for admin + student + video-grant tokens (same secret for all three).
- `CORS_ORIGIN` — comma-separated list of allowed origins in addition to the localhost defaults (`5173`, `5174`, `5175`, `3001`).
- `DATABASE_URL` (pooler URL, port 6543) — needed for `uni_video_lessons` reads/writes.
- R2 vars (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_S3_ENDPOINT` or `CLOUDFLARE_ACCOUNT_ID`) — needed for video upload/presign; optional if the feature is disabled.
- Optional TTL tuning: `ADMIN_TOKEN_TTL_SECONDS`, `STUDENT_TOKEN_TTL_SECONDS`, `VIDEO_GRANT_TTL_SECONDS`, `VIDEO_SEGMENT_GRANT_TTL_SECONDS`, `R2_PRESIGNED_TTL_SECONDS`.
- Optional grant hardening: `VIDEO_GRANT_BIND_IP`, `VIDEO_GRANT_BIND_UA` (both `true`/`false`).

Frontends read `VITE_API_URL` at build time (default `/api`, which relies on the proxy). `.env*` files are gitignored except `.env.example`.

## Files that must stay in sync

- Subject codes / tables: [backend/lib/universitySubjects.js](backend/lib/universitySubjects.js) ↔ `uni_questions_*` tables in [migration_university_schema_rls.sql](migration_university_schema_rls.sql) ↔ any subject labels in the frontends.
- Default subjects per account type / manas track: [backend/routes/adminRoutes.js](backend/routes/adminRoutes.js) ↔ [backend/routes/testRoutes.js](backend/routes/testRoutes.js).
- Required-tables list in [backend/lib/migrate.js](backend/lib/migrate.js) ↔ actual tables created by the migration SQL (the boot check will warn otherwise).
