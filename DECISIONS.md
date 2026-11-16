# Meridian decisions

- Next.js App Router, TypeScript, Tailwind 3.4, InsForge SDK. InsForge Sites deploys Next.js to Vercel including server routes; deployment stays within the requested InsForge project. The unrelated Codex Sites hosting service is not used.
- Default deployment provider: deterministic signed feature-hashed TF-IDF, 384 dimensions, with a frozen taxonomy-derived IDF corpus. No inference API, no LLM calls, no additional paid services. MiniLM is an optional local singleton using Transformers.js; deployment does not assume model download or memory availability.
- All writes affecting matching go through authenticated server endpoints and transactional database RPCs. Embeddings are computed before atomic save; failures leave previous data intact. Reads never generate embeddings.
- Required skills are identified by canonical taxonomy IDs. Custom skills are normalized and pending. Skill aliases are resolved before saving. Empty required-skill lists have coverage 1 (no requirements are missing).
- Project feed score is the highest role score among roles with available slots; role-less projects use their project embedding and project team capacity. A project's team_size includes the lead; membership capacity is team_size minus one.
- Both role capacity and overall project capacity are checked under a project row lock. A member occupies at most one role in a project. Strong applications become pending if full. Invitations always require acceptance and do not reserve slots.
- Applications are unique including null roles. Withdrawn/rejected applications can be resubmitted by updating the existing record with a fresh server score. Accepted membership cannot be withdrawn through an application; leaving a team is outside this MVP.
- Email/password only. Verification and password recovery both use six-digit codes, avoiding redirect-token handling. Passwords require 10 characters, a lowercase letter, an uppercase letter, and a digit; maximum 128.
- Profile canonical text starts with grouped skills, then headline, interests, and a 240-character bio excerpt. Titles/categories feed canonical text, so changing those also changes the source hash; cosmetic names and avatars do not.
- Defaults to review: strong >=70, moderate >=40, cosine/coverage weights 0.75/0.25, auto-approve strong on. Calibration is illustrative, not a validation study; results and limitations will be recorded after running fixtures.
- Demo accounts are clearly marked and use randomly generated inaccessible passwords. Seed data is for development/demo, not genuine users.

## Calibration evidence (16 November 2026)

Both providers ran locally on 20 labelled fixtures each. Full observations: `docs/calibration.json`.

| Provider                   | Relevant cosine range / median | Irrelevant range / median |
| -------------------------- | ------------------------------ | ------------------------- |
| Hashed v2                  | 0.656–0.743 / 0.695            | -0.059–0.075 / 0.000      |
| MiniLM q8, pinned 751bff37 | 0.810–0.887 / 0.853            | 0.382–0.585 / 0.482       |

The hashed 0.08–0.65 calibration places the observed unrelated pairs at zero and clear exact-skill pairs near 100. Strong=70 and moderate=40 are retained as initial reviewable policy, not statistically optimized boundaries. These fixtures deliberately use clear overlaps; ambiguous/partial matches need a larger human-labelled dataset. MiniLM's requested initial 0.20–0.75 mapping yields moderate false positives for some unrelated fixtures. Coverage reduces their scores enough to avoid automatic strong approval here, but does not make them all weak. Recalibrate MiniLM before enabling broad automatic decisions; hashed remains the hosted default.

## Operational choices and verified limitations

- The initial backend was empty, so bootstrap migrations were applied directly to the requested project. No existing production tables were modified. Use branches for future changes once real data exists.
- Hashed v2 uses a hash's high bit for sign, independent of the bucket's parity. Model/version equality is enforced even while a migration is incomplete.
- The auth admin API in this project omits the user object on creation despite the current schema. Seed setup looks up the resulting identity through the documented admin list endpoint. A credential-free bug report was submitted using the InsForge CLI.
- SDK maintenance scripts use ESM (`type: module`), as required by the current shared-schemas package exports.
- MiniLM is pinned to a model commit; package versions are pinned by `package-lock.json`. Its local run was verified. Serverless MiniLM performance is not claimed.
- The deployed project is free-plan. Published InsForge docs do not give a numeric daily auth-email cap or separate Sites request/CPU quota. README records those gaps instead of inventing unlimited allowances.
- Auth delivery to a real mailbox is a manual acceptance test. Automated users are admin-confirmed fixtures at reserved `.example` addresses.
- Application/invitation scores are submission snapshots. Approve/accept checks current capacity and open status but does not rescore past applications when requirements change.
- Lists of applications/projects/invitations are bounded at 100, talent at 50, team at 50. The member feed has cursor pagination. Additional management-list pagination is a future scaling task.
- Avatar URLs are public by design. Bucket writes are constrained to the authenticated user's folder. The UI accepts JPG/PNG/WebP up to 2 MB; InsForge's configured global storage maximum is 50 MB.
