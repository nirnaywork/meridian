# Meridian

A student-first team matching platform. Next.js App Router + TypeScript + Tailwind CSS + InsForge Auth, Postgres/pgvector, Storage, and Sites. No LLM, paid inference API, analytics service, remote font, or image service is used.

**Live:** [Meridian on InsForge Sites](https://tyhutf3c.insforge.site). Deployment `a8545fc7-e405-4265-b8c8-b944a474141b` reached READY on 16 November 2026. The linked backend, auth settings, three migrations, avatar bucket, and demo seed are applied. Both local `.env.local` and hosted environment variables are configured.

Validation: 12 unit tests, 24 real-backend integration checks, production build/type checking, and seven hosted smoke checks passed. Reports are in `docs/integration-results.json`, `docs/production-smoke.json`, and `docs/calibration.json`. Browser checks covered desktop/mobile layouts, profile editing, role selection, score breakdowns, signup navigation, and light/dark themes. Real-inbox verification and reset delivery still need manual acceptance.

## Start locally

Use Node.js 22+ and npm. This workspace is already linked to project `52590b98-ea17-4cb4-aacf-49528d17a5ef`, with an ignored `.env.local` configured. On a new checkout:

```sh
npm ci
npx -y @insforge/cli login
npx -y @insforge/cli link --project-id 52590b98-ea17-4cb4-aacf-49528d17a5ef
```

Copy `.env.example` to `.env.local`. Get the URL from `.insforge/project.json`, the anon key with `npx -y @insforge/cli secrets get ANON_KEY`, and the server API key from the project's settings/link file. Keep the API key in `INSFORGE_API_KEY` only. Never prefix it with `NEXT_PUBLIC_`, commit it, or paste it into client code.

```sh
npx -y @insforge/cli config apply --auto-approve
npx -y @insforge/cli db migrations up --all
npx -y @insforge/cli storage create-bucket avatars
npm run seed
npm run dev
```

Do not recreate the avatar bucket if it already exists. Open http://localhost:3000. Create your own account using a real email, enter the verification code, and finish onboarding. Seed users have random passwords, reserved `.example` addresses, and are clearly marked as demo profiles. There is no public demo-login backdoor.

`npm run seed` installs 372 taxonomy entries, 10 fictional members, 15 projects and 30 roles, and their stored vectors. It uses the admin user API rather than writing to `auth.users`. Stable project/role IDs and a local ignored demo-user map make reruns idempotent; the script also searches existing demo identities if the map is absent. Rerunning seed updates demo project content to the fixtures.

## Environment

| Variable                        | Purpose                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_INSFORGE_URL`      | Backend URL, safe for browser code                                                   |
| `NEXT_PUBLIC_INSFORGE_ANON_KEY` | Public anon key; RLS still governs access                                            |
| `INSFORGE_API_KEY`              | Full-access key, server and maintenance scripts only                                 |
| `NEXT_PUBLIC_APP_URL`           | App origin for deployment documentation/configuration                                |
| `EMBEDDING_PROVIDER`            | `hashed` (default) or `minilm`                                                       |
| `MATCH_MODE`                    | `composite` (default) or `cosine_only`; run `reembed-all` to synchronize DB settings |
| `MODEL_CACHE_DIR`               | Optional MiniLM disk cache, default `.cache/models`                                  |
| `MODEL_LOCAL_ONLY`              | `true` disables model downloads after caching                                        |
| `TEST_APP_URL`                  | Optional integration-test app origin, defaults to localhost:3000                     |

## Auth configuration

In InsForge Authentication settings: email/password only; **requireEmailVerification=true**, **verifyEmailMethod=code**, **resetPasswordMethod=code**. Passwords need 10–128 characters, lowercase, uppercase, and a digit. These settings are tracked in `insforge.toml` and applied to the linked project. Default shared-key Google and GitHub configurations were removed through the verified dedicated OAuth configuration API; no OAuth UI or OAuth callback route is implemented.

For another project, remove social providers under Authentication → Auth Methods. The CLI's TOML config does not manage OAuth provider resources. The installed SDK's auth calls and SSR cookie helpers are used directly. Refresh tokens are httpOnly; short-lived access tokens are browser-readable for authenticated Storage uploads. Auth mutations validate same-origin requests. Protected pages verify the user with InsForge and enforce onboarding. Database policies independently require verified identities.

The verification screen supports six boxes, keyboard movement, paste, resend, a 60-second cooldown, and backend error messages for invalid/expired codes and rate limits. Signing in with an unverified email redirects to verification. Forgot/reset password uses InsForge's code exchange and password-reset flow. No reset token is returned to the browser by our server.

If switching reset to **link** later, implement the link-specific UI and allowlist the exact reset URL: InsForge requires `redirectTo` in `allowedRedirectUrls`. The current allowlist includes localhost and the default hosted sign-in/reset pages. See [InsForge auth reference](https://docs.insforge.dev/sdks/rest/auth). Both flows must stay consistent with the dashboard method.

## Architecture and integrity

- `src/app`: landing/auth pages, protected workspace routes, authenticated API handlers.
- `src/components`: forms, skill picker, feed, project workspace, applications and invitations.
- `src/lib/matching`: provider interface, canonical text, SHA-256 change detection, local MiniLM and portable hashed TF-IDF.
- `src/lib/server`: session verification, rate limiting, validation, normalization, and atomic saves.
- `migrations`: tables, RLS, vector indexes, matching RPCs, state transitions and capacity locks.
- `scripts`: seed, calibration, vector migration, integration checks, deployment.

All 14 app tables have RLS. Normal clients have read permissions scoped by policy, and **no direct write privileges**. Server endpoints authorize the actor, validate with Zod, and call service-only RPCs. Every score and decision is computed from stored vectors inside Postgres; browser-supplied embeddings, scores and ownership fields are stripped/ignored. Raw vector tables and settings are service-only.

Profile/project saves compute embeddings first, then atomically commit content, skill relations and vectors. A failed embedding leaves existing content intact. Revision checks reject stale saves instead of overwriting concurrent edits. The skills onboarding step prepares and saves a profile with onboarding incomplete; only the final intent step completes it. Display name/avatar changes do not alter the canonical hash or embedding timestamp. Project title/category and role title affect canonical text, so they do trigger updates.

Applications and invitations store score snapshots and breakdowns. New applications/invites always rescore; later approval/acceptance uses the original submitted snapshot and current capacity. All membership transitions lock the project row before checking both role slots and team capacity. Team size includes the lead. Invitations never reserve a slot or add someone without acceptance. Null-role applications have true uniqueness through `UNIQUE NULLS NOT DISTINCT`. Pending applications can be withdrawn; accepted team membership cannot be removed through withdrawal. Role deletion is blocked when it has application/invitation history.

Auth throttles use durable Postgres counters: 30 requests/IP/5 minutes, 10 attempts/email/action/5 minutes, one resend/email/action/minute. Save/embedding endpoints permit 12 saves/user/minute; application actions permit 30/user/minute. InsForge also applies its own auth/email limits. Deployment trusts Vercel's forwarded IP header.

## Matching

Vectors are 384-dimensional and normalized. HNSW indexes use `vector_cosine_ops`. `match_projects_for_user` ranks by the best available role (or project vector without roles), filters by text/skill/role/commitment, and paginates by `(score, id)`; `match_candidates_for_role` ranks members by cosine similarity. Provider and version must match. No embedding generation occurs during feed reads or matching.

`src/lib/matching/config.ts` is the single calibration/threshold source; seed and `reembed-all` synchronize it into the private DB settings row. Defaults:

- Strong ≥70; moderate ≥40; weak <40. Decisions use unrounded scores.
- Composite: 75% calibrated cosine + 25% required-skill coverage.
- MiniLM mapping: 0.20–0.75 cosine → 0–100.
- Hashed TF-IDF mapping: 0.08–0.65 cosine → 0–100.
- Auto-approve strong applications is enabled per project by default, subject to capacity; otherwise they remain pending.
- No required skills means 100% coverage. Proficiency affects canonical text; coverage tests presence, not proficiency.

The fallback uses frozen taxonomy-derived IDF (smoothed document frequency), sublinear term frequency, unigrams/bigrams, independent signed hashing, exact-skill boosts and L2 normalization. It has no model download and uses portable JavaScript/Web Crypto. It is lexical, not a substitute for a semantic model; short unrelated texts can collide.

MiniLM uses `@huggingface/transformers`, `feature-extraction`, mean pooling and normalization. The quantized `Xenova/all-MiniLM-L6-v2` ONNX export is pinned to revision `751bff37182d3f1213fa05d7196b954e230abad9`. Pipeline loading is singleton per Node process. First use downloads free model files, then inference is entirely local with no API quota. To prewarm, run `npm run calibrate -- --all`. Set `EMBEDDING_PROVIDER=minilm` and run `npm run reembed-all` before serving MiniLM matches. For offline operation set `MODEL_LOCAL_ONLY=true` after downloading. Never silently fall back for one record: that would split the vector space.

`reembed-all` scans bounded batches and skips identical hashes, atomically saves updated records with revision checks, and finally syncs match configuration. During migration, incompatible records are excluded until their versions align. Retry if a concurrent edit causes a revision conflict.

## Verify

```sh
npm run test
npm run typecheck
npm run calibrate -- --all
npm run build
# Keep npm run dev running in another terminal:
npm run test:integration
# Reuses the disposable QA account created by integration tests:
npx tsx scripts/smoke.ts
```

Unit tests cover aliases (including C/C++/C# distinctions), normalization, stable ordering, deterministic vectors, hash skipping, bounds, band edges and invalid inputs. Integration tests use real InsForge accounts/tables and HTTP sessions to exercise scoring decisions, parallel slot claims, consent, duplicate prevention, RLS, service-only writes, stable pagination, version isolation, cosmetic hash skipping and sign-out. Fixtures are closed and removed from talent discovery afterward; audit records remain. Run against a dedicated test project when the app has real users. Do not point tests at another app's backend.

`docs/calibration.json` contains 20 labelled pairs **per provider**. These are deliberately small illustrative fixtures with exact skill overlap, not a production quality benchmark. MiniLM assigns moderate scores to some unrelated pairs; see `DECISIONS.md`. Broader labelled student examples should inform future calibration.

Manual acceptance: sign up with your own inbox; verify delivery/code/resend; try a wrong code; finish all three onboarding steps; filter the feed; inspect a breakdown; apply; create a project in a second account; approve/reject; invite and accept/decline; upload an avatar; reset a password. Email delivery to a real inbox remains a manual check because automated fixtures use reserved addresses and admin-confirmed identities.

## Deploy on InsForge

[InsForge Sites](https://docs.insforge.dev/core-concepts/sites/overview) supports Next.js API routes/SSR through Vercel. `vercel.json` places server functions in Singapore, near this ap-southeast database. No separate Vercel account, custom compute instance, or model host is provisioned.

Build locally first. In PowerShell, `./scripts/deploy.ps1` reads the ignored `.env.local`, configures deployment variables without printing secret values, then runs `npx -y @insforge/cli deployments deploy . --json`. The source directory is deployed, not `.next`. InsForge automatically excludes `.env*`, `.insforge`, `node_modules`, and build output; `.vercelignore` also excludes tests, scripts, caches and migrations. Set `INSFORGE_API_KEY` as a server-only deployment variable. The default target is `https://tyhutf3c.insforge.site`.

For other shells use `npx -y @insforge/cli deployments env set KEY VALUE` for each required variable, then `npx -y @insforge/cli deployments deploy . --json`. Inspect `deployments list` and `deployments status ID --sync` if the CLI times out; do not create another deployment while one is still building.

Default hosted provider is **hashed**. MiniLM runs successfully on this local Node installation, but its serverless cold-start/memory/bundle footprint has not been established on InsForge Sites. The fallback is deliberately used to avoid an extra paid host. A dedicated Node deployment can use the same code/provider when resources permit; no remote model endpoint is necessary for this MVP.

## External services and verified free limits

Verified on **16 November 2026**, from primary provider documentation. Account inspection confirms this linked organization is on the free plan. Limits can change; the source links are authoritative.

| Service                        | Usage                                    | Verified free allowance                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| InsForge Cloud                 | Postgres, pgvector, Auth, Storage        | 50,000 monthly active users; 500 MB DB; 1 GB files; 5 GB bandwidth. Free projects pause after one inactive week. [Pricing](https://docs.insforge.dev/pricing)                                                                                                                                                                                                                  |
| InsForge Sites (Vercel-backed) | Next.js hosting                          | 600 build minutes on the InsForge free plan. The docs do not separately quantify hosted request/CPU allowances; no unlimited-hosting claim is made. [Pricing](https://docs.insforge.dev/pricing), [Sites](https://docs.insforge.dev/core-concepts/sites/overview)                                                                                                              |
| InsForge managed auth email    | Verification/reset codes                 | Auth email is available on the free plan. Public docs specify project/plan rate limits but do **not** publish a numeric daily auth-email cap. This is unverified rather than guessed. Default recipient cooldown is 60 seconds. [Messaging](https://docs.insforge.dev/core-concepts/messaging/overview), [SMTP](https://docs.insforge.dev/core-concepts/messaging/custom-smtp) |
| Hugging Face Hub (optional)    | Initial open-source MiniLM file download | No hosted inference is used. Local inference has no vendor call quota; local compute/storage costs remain yours. Download availability is subject to Hub limits. Hashed mode never contacts it. [Transformers.js](https://huggingface.co/docs/transformers.js), [Model](https://huggingface.co/Xenova/all-MiniLM-L6-v2)                                                        |
| npm registry                   | Development/build dependencies           | Public packages; not a runtime app service or metered AI API.                                                                                                                                                                                                                                                                                                                  |

InsForge also lists 100,000 edge function calls and 120 custom-compute hours on Free, but Meridian provisions neither. No paid service was added. Hosting remains subject to its free quotas; “unlimited” applies to the absence of embedding API quotas, not hosted compute resources.

### Optional SMTP alternative

If the managed sender's account-specific cap is too low, [Brevo Free includes 300 email sends/day](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan). It is **not configured or required**. Create your own free account, verify a sender, copy the SMTP connection details from its dashboard, and enter them in InsForge Authentication → Email → Custom SMTP (host, port, username, password, sender address/name). InsForge tests the connection and encrypts the password; all auth mail then uses that provider. Keep credentials out of the repo. See [InsForge SMTP setup](https://docs.insforge.dev/core-concepts/messaging/custom-smtp).

## Section 3 implementation checklist

- [x] Email/password signup/sign-in, six-digit verification, paste/auto-advance, resend cooldown, errors, password reset, protected sessions and sign-out.
- [x] Forced basics → skills → intent onboarding, optional university/avatar, searchable taxonomy, custom pending skills, proficiency, embeddings before discovery, editable intent.
- [x] Ranked member feed, match percentages/breakdowns, matched/missing chips, filters, cursor pagination, loading/error/empty states.
- [x] Project detail, role or whole-project application, server-side bands, auto-approval, application tracking and withdrawal.
- [x] Create/edit project wizard, required/preferred skills, project/role embeddings, open/close controls, lead dashboard.
- [x] Ranked applicants, approve/reject, role-based talent discovery, invitations, team members and capacity.
- [x] Member invitations with explicit accept/decline and transaction-safe membership.

The checklist describes implemented features; automated and manual verification boundaries are stated above. Assumptions to review are collected in `DECISIONS.md`.
