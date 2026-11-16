# Meridian

Live: [Meridian](https://meridian.insforge.site). Existing Next.js + TypeScript + Tailwind + InsForge project 52590b98-ea17-4cb4-aacf-49528d17a5ef. Email/password only, verified six-digit codes, no paid AI or LLM APIs.

## What changed

Explore `/projects` lists open projects newest first, with neutral filters and date/open-role sorting. Raw cosine is informational. Every application is pending until manually reviewed; invitations always require consent. A single Under the Hood FAB on your profile and project details opens a slide-over containing stored traces, 384 numbers, canonical inputs, pooling/hashing steps, statistics, and copy/download. Similarity explainers expose actual products, running sums, norms, app/pgvector parity and angle. Profile vectors are private to their owners.

See DECISIONS.md for the diagnosed logo issue, version changes, privacy boundaries and assumptions. The only sign-out action is the explicit button. Authenticated root/sign-in visits go to `/projects`; bootstrap restores cookie sessions before client navigation decisions.

## Local setup

Node 22+, npm. This workspace already has ignored `.env.local` credentials. On a new checkout:

```sh
npm ci
npx -y @insforge/cli login
npx -y @insforge/cli link --project-id 52590b98-ea17-4cb4-aacf-49528d17a5ef
```

Copy `.env.example` to `.env.local`. Use the linked project's URL and anon key for NEXT_PUBLIC_INSFORGE_URL/NEXT_PUBLIC_INSFORGE_ANON_KEY. INSFORGE_API_KEY is server-only. Never commit keys. NEXT_PUBLIC_APP_URL is localhost during development and the hosted URL in production. EMBEDDING_PROVIDER is hashed or minilm. There is no MATCH_MODE.

```sh
npx -y @insforge/cli config apply --auto-approve
npx -y @insforge/cli db migrations up --all
npm run validate-seed
npm run seed:taxonomy
# Only on a fresh development backend: create avatars bucket, then npm run seed
npm run reembed-all
npm run dev
```

Old migrations are immutable; the new change-set migration removes obsolete columns/functions and adds domains/trace RLS. Taxonomy seed files are per field under seed/. They upsert by slug and preserve IDs. There are 2,108 skills and 83 domains; validation prints every field/domain count and rejects alias/slug collisions, missing domains and minimum-count failures. Existing demo accounts have reserved addresses and random passwords; create your own account to use the app.

## Auth configuration

insforge.toml requires email verification with code, password recovery with code, and ten-character passwords with uppercase/lowercase/number. OAuth remains disabled. Verification input supports paste/advance/resend cooldown. Forgot/reset use built-in InsForge code exchange. Existing redirect allowlists include localhost and the InsForge Site. Real-inbox verification/reset delivery must be checked with your own mailbox. Avatar bucket is public-read with writes restricted to the owner's UUID folder; UI accepts JPG/PNG/WebP <=2MB.

## Offline embeddings

[Model source](https://huggingface.co/Xenova/all-MiniLM-L6-v2), **Apache 2.0**, pinned revision `751bff37182d3f1213fa05d7196b954e230abad9`.

```sh
npm run download-model
npm run verify-model
npm run build # prebuild downloads/verifies the five files
npm start
```

models/ is git-ignored. MANIFEST.json stores each SHA-256. Only onnx/model_quantized.onnx, config.json, tokenizer.json, tokenizer_config.json and special_tokens_map.json are needed. Build/download needs Hugging Face network; runtime uses an absolute local model path, allowLocalModels=true, allowRemoteModels=false, dtype=q8 and native Node ONNX. No runtime download is permitted. Missing/corrupt files or failed model loading log a full Meridian: error and return 503 without saving profile/project data. There is no automatic fallback. GET `/api/health/embedding` reports the active provider and checksums. EMBEDDING_PROVIDER must explicitly be minilm or hashed; missing/unknown values fail startup. Hosted and local default is minilm, proven with native inference on the deployed host. [Transformers.js environment documentation](https://huggingface.co/docs/transformers.js/api/env) describes the verified option names.

Embeddings regenerate only after relevant saves change SHA-256(canonical text + provider + version). Reads/matching never embed. Profiles/projects/roles include sorted domains. Hashed provider version is domains-tfidf-v5 and MiniLM is domains-minilm-751bff37-q8-v3. Never compare versions/providers. After switching providers, run reembed-all once. It skips unchanged hashes. Backfill-traces only processes missing traces, checks the reconstructed source hash and vector tolerance, and never replaces stored vectors. Run migrations/reembed-all before backfilling legacy rows.

## Tests and calibration

```sh
npm test
npm run typecheck
npm run validate-seed
npm run verify-model
npm run calibrate -- --all
npm run build
npm start
# Separate terminal, dedicated test backend recommended:
npm run test:integration
npx playwright install chromium
npm run test:e2e
npm run backfill-traces
```

Integration creates disposable verified users and closes its test project; fixtures remain as audit records and are hidden from talent discovery. E2E reuses the ignored test credentials from integration. Run browser checks with next start, since development watchers can reload while test artifacts are written. Unit tests cover aliases, domain canonical ordering, hash skipping, trace data, cosine, seed validity, remote-disabled configuration and missing-model errors without fallback. Integration covers low-cosine pending applications, structural rejection, snapshots, concurrent slots, vector privacy, neutral ordering, endpoints and pgvector parity. E2E covers logo/reload/session persistence, sorting and real vector arithmetic. Calibration records 26 pairs per provider including engineering disciplines, not a validated measure of capability.

## Deployment

PowerShell `./scripts/deploy.ps1` configures server/public environment variables without printing secrets and publishes through InsForge Sites. Source upload excludes models/ to respect upload limits; prebuild downloads them and Next tracing includes runtime assets. `.vercelignore` must include scripts/download-model.ts and its dependencies. Deployments are Vercel-backed Next.js SSR/API routes in sin1. Check deployments list/status if CLI polling times out; do not submit duplicates.

## External services and free limits

Verified from primary documentation 16 November 2026; no new external runtime service was introduced by change set 1.

| Service                                                                         | Usage and free limits                                                                                                      |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| [InsForge Cloud](https://docs.insforge.dev/pricing)                             | Auth/Postgres/Storage: 50k MAU, 500MB DB, 1GB files, 5GB bandwidth; free projects pause after one inactive week.           |
| [InsForge Sites](https://docs.insforge.dev/core-concepts/sites/overview)        | Next SSR/API hosting. InsForge lists 600 build minutes; separate hosted request/CPU quotas are not published.              |
| [Managed auth mail](https://docs.insforge.dev/core-concepts/messaging/overview) | Available free; numeric daily email cap is not publicly specified. Resend has a 60-second cooldown.                        |
| [Hugging Face](https://huggingface.co/Xenova/all-MiniLM-L6-v2)                  | Optional build-time public model download only. Local inference has no API quota; host compute/storage limits still apply. |
| npm                                                                             | Public development/build packages.                                                                                         |

Optional custom SMTP: [Brevo Free](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) documents 300 sends/day. Not configured or required. Configure a verified sender and SMTP credentials in [InsForge Custom SMTP](https://docs.insforge.dev/core-concepts/messaging/custom-smtp) if the managed sender's account cap is insufficient. Keep SMTP secrets out of the frontend.

## Change set 1 acceptance (17 November 2026)

- Done: logo/root/sign-in preserve cookie sessions; diagnosis is in DECISIONS.md.
- Done: personalized feed, score bands/composite weights and auto-approval code/columns removed through new migrations.
- Done: all applications start pending; low/missing cosine never blocks participation; raw cosine and skill snapshots are server-generated.
- Done: profile, project and role embedding explainers show stored traces and vectors, virtualized numbers, heatmaps, copy and JSON download.
- Done: similarity shows all 384 products, running sums, norms, app/pgvector parity, contributors, angle and reading guide. Application snapshots are distinguished from current-vector calculations.
- Done: 2,108 validated skills, 83 domains, ten fields, editable templates and domain-aware pickers/filters.
- Done: pinned build-time model download, SHA-256 manifest, offline runtime/fallback and working health endpoint.

Validation: 14 unit tests, 12 real-backend integration checks, three end-to-end browser tests against the live site, native offline model verification, TypeScript and production build. Reports: docs/change-set-integration.json, docs/calibration.json, docs/seed-counts.txt. Public embedding health confirms model files present and checksums valid with remoteModelsAllowed=false. The optional interactive reproducibility button and optional linguistic gauge are intentionally omitted; reproducibility scripts are included.

## Change set 3: Under the Hood slide-over

The only explainer entry point is the floating bottom-right button on your profile and signed-in project detail pages. Normal pages contain no explainer content and request no vectors or traces. Dedicated under-the-hood page routes do not exist. Existing small cosine badges remain informational.

The panel has project/role/similarity tabs, lazy code/data loading, cached tabs, sticky header, expand control, responsive step navigation, internal scrolling, and focus/scroll locking. Escape, X, backdrop or Back closes it. Refresh restores query state such as `?panel=under-the-hood&tab=similarity&role=<id>`. Profile/project/role vectors and traces are never regenerated by viewing. Owner similarity mode shows applicant snapshots and skill overlap with the formula, never private applicant vectors.

Heavy endpoints, called only after opening:

- GET /api/embeddings/me: only the signed-in viewer's embedding.
- GET /api/projects/[id]/embedding?role=<id>: one project or role embedding.
- GET /api/projects/[id]/similarity?role=<id>: viewer comparison/snapshot, or summary-only owner mode.

Each endpoint validates the session and role/project identity, uses existing RLS, and sends private/no-store headers. The obsolete combined /api/embeddings/project endpoint returns 404. No new migration or service is needed for this change.

Rename the shared label/title or change the icon in src/lib/under-the-hood.ts. `SHOW_MATCH_PERCENT=false` in the server environment hides badges while preserving the panel (default true; restart/redeploy to apply). FAB/panel/dialog CSS layer tokens are 60/100/200. Toasts are bottom-center with clearance for the FAB; safe-area insets and page padding protect content.

Run `npm run build` then `npm start`. In another terminal run `npm run test:integration` to populate disposable member/owner browser fixtures, then `npm run test:e2e`. To run the badge-flag case too, start the same build on a second port with SHOW_MATCH_PERCENT=false and PORT=3001, and set TEST_FLAG_URL=http://localhost:3001 for Playwright. Saved test sessions in .cache are ignored and used only for disposable test accounts. No production user credentials are added to tests.

Change set 3 validation: 14 unit tests, 12 real-backend regression checks and 9 browser tests passed against production builds (including a badge-disabled instance). TypeScript and the production build pass. Desktop/mobile previews are saved in docs/under-the-hood-project.png and docs/under-the-hood-mobile.png.


## Change set 4: explicit MiniLM and canonical v3

The deployed host probe passed on Node v26.13.1, Linux x64, Transformers.js 3.8.1 and onnxruntime-node 1.21.0. Next tracing explicitly includes the CPU binding, its shared libraries and all five pinned model assets for API routes. Darwin, Windows, ARM64, CUDA and TensorRT binaries are excluded from deployment. The initial missing libonnxruntime.so.1 error was a tracing omission, not an unsupported runtime. The GPU-inclusive diagnostic probe was 450,500,195 bytes visible under /var/task; final CPU-only measurements are recorded in docs/change4-host-final.json. This runtime footprint is not an official Vercel archive-size measurement. Vercel documents a standard 250 MB uncompressed function limit: https://vercel.com/docs/functions/limitations.

GET /api/health/embedding is public and minimal. GET /api/health/embedding/detail requires x-health-token equal to HEALTH_TOKEN; use the secret in your local environment without putting it in URLs or logs. It reports live environment flags, host/package versions, native-file inventory and a live smoke test cached for 60 seconds. A null remoteModelsAllowed means the Transformers module could not load, rather than an invented false value. EMBEDDING_WRITES_PAUSED is a temporary rollout gate, normally false. Selection failures never silently change providers. Model inference errors preserve the old record because generation finishes before the atomic save RPC.

Canonical v3 omits empty proficiency/domain/interests/bio sections and sorts skills and domains. Both providers have new versions because their input format changed. The packaged tokenizer supports 512 tokens, but the app explicitly caps both actual inference and its trace at the upstream sentence-transformer default of 256 word pieces. npm run audit-truncation reports stored and candidate text lengths without writing database data. The rollout audit found 0% truncation for all three tables; full role text remains in project canonical text. The longest v3 project text was 167 tokens. Upstream model card: https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2.

New projects and onboarding require at least one domain. New roles inherit project domains unless separately chosen. Legacy records load and remain editable with empty domains; none are assigned automatically. Their owner sees a dismissible reminder. Form suggestions count distinct selected skills through the actual skill_domains join, with alphabetical tie breaking; Confirm suggested domains changes only the form until Save. A single database trigger maintains profile/project/role domain joins from the arrays. scripts/sql/domain-consistency.sql must return no inconsistent rows.

For a deliberate provider/version rollout: pause embedding saves, prove the model on the host, deploy the new identity, immediately run npm run reembed-all, then npm run verify-embeddings and scripts/sql/embedding-verification.sql before lifting the pause. The script batches reads, commits each profile or project atomically, skips identical hashes on reruns and refuses a mixed/incorrect final identity or invalid/missing-trace vector. It does not invent embeddings for blank accounts. Applications retain their original cosine snapshots. Current null/incompatible comparisons display Embedding is being updated; they are never coerced to zero. Back up the backend through your normal operational process before future rollouts.

Under the Hood identifies the model that produced each stored vector separately from live health. A mismatch offers an authenticated, rate-limited regenerate control only for the owner, reusing saved source data and the normal hash-skip save path. Opening or reading the panel still never generates vectors. MiniLM vectors use nine decimal places and a heatmap scaled to their own positive/negative extrema. The normal pages still load neither heavy vectors nor explainer code.

npm run build uses Next.js webpack mode because this local Next/Turbopack installation failed to launch its CSS worker. No app behavior depends on that bundler choice. No standalone embedding service or paid service was added.

The final calibration uses 34 pairs per provider, including ECE/EEE/mechanical and eight semantic examples. Display thresholds in src/lib/matching/gauge.ts are MiniLM Fair=0.20, Good=0.45, Strong=0.75 and hashed 0.08/0.30/0.65. The fixture ranges overlap, so the gauge is explicitly informational; it is never imported by application/invitation decisions. Snapshot badges preserve old values and do not apply the new current-vector gauge. Full distributions are in docs/calibration.json.

PowerShell SQL verification: collapse newlines before passing SQL through npx.cmd, for example `$sql=(Get-Content scripts/sql/embedding-verification.sql -Raw) -replace '\r?\n',' '; npx -y @insforge/cli db query $sql --json`. Domain verification returns three rows, each with inconsistent_rows=0. npm run verify-embeddings fails on any incorrect or mixed identity, invalid vector or missing trace. Rollout measurements and SQL results live in docs/change4-*.json.

Change set 4 validation: production build, type check, 22 unit tests, 14 backend checks, 11 local browser cases and 5 deployed-host cases passed. A repeated reembed-all updated zero records. Final database counts including disposable QA fixtures are 45 profiles, 27 projects and 41 roles, all MiniLM v3. Deployment and measurement evidence is in docs/change4-validation.json; the production save pause is off. Existing real users must confirm their own domain choices; none were assigned automatically.


## Change set 5: role percentages

Normal pages display one calibrated percentage per role and a best-open-role sentence; there is no project-level percentage. `src/lib/matching/matchScore.ts` implements `100 / (1 + exp(-k * (cosine - c0)))`, clamped to 1–99 and rounded. The only parameter source is `src/lib/matching/match-calibration.json`, calibration version `role-percent-2026-11-v1`. MiniLM's accepted fit is c0=0.49966375338843566, k=11.31196095168161; hashed retains c0=0.30, k=10 because its fitted curve failed the 0.20 sanity anchor. The default hashed curve also maps 0.20 to 27%; it is retained exactly as requested, not represented as passing that anchor. Percentages are estimates from stored embedding alignment, not probabilities or ability measurements. They never affect application eligibility or Explore ordering.

Run `npm run calibrate -- --from-report --write-config` to refit the 34 existing labelled pairs per provider without running an embedding model. Without --from-report, calibration embeds only its in-memory fixtures. Reports include fitted/selected parameters, every anchor, distributions and a conversion table in docs/change5-calibration.json. Only accept a fit when mean irrelevant maps below 30, median relevant above 90, 0.20 below 15, and slope is positive. The continuous curve is strictly increasing; rounded/clamped integer output is necessarily nondecreasing with plateaus. Parameter updates require a new calibrationVersion and new SQL migration; never rewrite historical snapshot percentages.

The best role has the highest rounded percentage among open roles, then most remaining slots, then first display order. Role display order is deterministic by title and ID across Explore and details. Full copy bands start at 85 (excellent fit), 70 (best fit), 50 (closest role), otherwise Closest role plus an optional-skills suggestion. All copy is in src/lib/matching/roleMatch.ts. Shared RoleMatchBadge and BestRoleMatch components handle formatting, tooltips and missing/updating states. Full roles keep badges, but cannot become the headline. No roles means no percentage. Owners see no personal role match.

The server batches current stored-vector comparisons for every requested role through role_matches_for_viewer, validates provider/version identity, then uses the shared formula. No re-embedding or per-project seed update is needed. Normal Explore/detail/application/applicant/talent/action responses use explicit projections and never return raw values, including nested breakdowns. Applicants default to newest; Find Talent retains its lead-only ranking. Under the Hood is the sole app endpoint surface for raw comparisons and adds a worked substitution, curve and all-role table. Operational health smoke tests return a boolean ordering check instead of raw comparison numbers.

Migration 20261117040000_role-percentages.sql adds nullable match_percent/calibration_version snapshots. A service-only calibration-table mirror is generated from the single JSON config and checked for exact parity by integration tests. An INSERT trigger computes the percentage in the same transaction as the existing cosine snapshot, avoiding a race between application creation and percentage storage. Compatible historical role snapshots are backfilled; older versions and whole-project applications remain null. Existing raw cosine columns, embeddings, versions and matching math are untouched. Invitation match numbers were removed; invitation consent and skill chips remain.

SHOW_MATCH_PERCENT replaces the old display flag, defaults true, and hides normal badges/headlines and the percentage explainer when false. The remaining panel and raw technical explanation work normally. Set it in the server environment and restart/redeploy. The env template is updated locally but excluded from the requested commit together with every .env file.

Tests: `npm test` includes the static UI/API terminology guard and response-projection checks. `.github/workflows/checks.yml` runs that guard in CI without backend credentials. Run the existing backend suite, then `npx tsx --env-file=.env.local scripts/change5-integration.ts` for the normal two-role create/apply flow. Browser tests consume ignored disposable fixtures. `scripts/check-vector-preservation.ts --snapshot` / its no-argument check prove that pre-existing vectors and traces remain byte-for-byte unchanged; these fingerprints are private and ignored. A new project test necessarily generates only that new project's and new accounts' vectors. Existing browser snapshot-copy tests now mock historical responses instead of modifying saved profiles.


Rolling deployment order for change set 5: apply migrations 040000 and 050000, deploy the percentage app, wait for READY and verify pages, then apply 060000 to retire the old project-match RPC. A fresh backend can apply all migrations before starting the new app. The compatibility migration exists because the initial rollout retired the old RPC too early; it was restored immediately. No existing embedding is changed by these migrations.


Change set 5 pre-commit verification: 29 unit tests (including the CI display/response guard), 14 existing backend checks, 7 new normal-flow percentage checks, and 15 browser tests all pass. Production build and type check pass. The preserved-vector check confirms all 113 pre-existing embedding rows, traces, versions and timestamps are unchanged. The user authorized a complete working-app snapshot commit because the earlier baseline was uncommitted; every .env* file, model asset, dependency directory and build output is excluded. No push is performed.
