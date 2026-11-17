# Personal Dashboard delivery and verification

The personal Dashboard is published at [Meridian](https://tyhutf3c.insforge.site/dashboard). It is the signed-in landing page and first main-nav entry. The signed-in logo opens it, and incomplete profiles retain the onboarding flow.

## Delivered features

- Recent project messages with sender, project, escaped preview, timestamp, unread state and exact conversation/message links. A SECURITY DEFINER read checks current team access and private audience. Message bodies remain in the existing team chat table.
- Activity from existing update, ticket and project-status notifications, plus project and assigned-ticket links in My day.
- Owner-private daily notes with editing, completion, deletion, date groups and read-time unfinished carry-over. Limits are 500 characters, 50 notes per date and 300 total.
- Cross-device DND with optional expiry. It hides personal messages/activity and unread indicators, suppresses the bell count and completion sound, and retains stored notifications.
- Client-only local clock, greeting and date, quick actions and keyboard help.
- Adjustable Pomodoro and countdown timers with start, pause, reset, skip, completion audio, title countdown and refresh persistence. Completed focus intervals and weekly streaks are stored per owner.
- Responsive cards using the existing light/dark design, loading/error/empty states, labels and keyboard controls. Desktop and mobile-dark screenshots were inspected. Mobile tests check horizontal overflow.

The [feature guide](personal-dashboard.md) documents the API, audience checks, controls, persistence, limits and current scope.

## Files

New application files are the dashboard page, two API routes, `src/lib/personal-dashboard.ts`, components `personal-dashboard.tsx`, `dashboard-preferences.tsx`, `focus-timer.tsx`, and `src/app/personal-dashboard.css`. Existing shell/navigation, auth destinations, notification bell, team conversation selection and chat message anchors are updated. `scripts/cleanup-test-records.ts` deletes the three new owner-scoped table rows before fixture profiles. The API verification script, two test modules and personal Playwright suite are new. Existing session and logo tests follow the new landing page. README, DECISIONS and the collaboration guide link to the personal guide.

## Migration and safety net

The SELECT-only backup in `backups/pre-personal-dashboard-2026-11-17/` contains eight full table exports, dependency definitions, migration history and a verified checksum manifest. Counts matched the live SELECT snapshot. Exports contain 76 profiles, 30 projects, 15 memberships, two messages, two read states, one notification, zero updates and zero tickets. The folder remains ignored by Git and deployment upload.

No existing database function or view needed replacement. The read-only preflight inspected the team-access, message and identity functions reused by the new read path, and inspected message views. The migration adds only the three personal tables, their policies/indexes and three functions. It does not alter existing message storage. Local SQL tests passed before applying the file.

Executed through the linked InsForge CLI, in one runner-managed transaction, without in-file BEGIN/COMMIT:

```powershell
npx -y @insforge/cli db migrations up 20261118050000_personal-dashboard.sql --json
```

InsForge reported successful execution at 2026-11-17T02:46:41.497Z. File SHA-256 is `715c3669c0bec149dd313dbe79f4e8b2965c460d9f916d6f734b2205f90379e5`. No applied migration was subsequently edited.

Post-apply inspection confirmed three RLS-enabled tables with owner-only USING/WITH CHECK predicates and client SELECT-only grants. Both viewer-derived readers allow authenticated/project_admin execution. The mutation RPC denies authenticated/PUBLIC/anon and permits only project_admin. All three functions are SECURITY DEFINER with pinned search paths. Same-origin, session, Zod and rate checks precede mutation calls. [Complete catalog results](personal-catalog.json)

The final independent comparison verified every original exported row and separately counted any unrelated arrivals. Every recorded fixture profile/project and Auth account was absent after cleanup, including fixtures from failed test attempts. New personal-table rows for those fixture IDs were absent too. Matching source has no diff, and there was no global re-embedding or reseeding. [Final preservation and cleanup evidence](personal-verification.json)

## Actual verification

| Check | Final result |
| --- | --- |
| Vitest including local PostgreSQL authorization | 83 passed across 16 files |
| TypeScript | Passed |
| Production build | Passed |
| Full Playwright suite against local production build and live InsForge | 29 passed, zero skipped, unexpected or flaky |
| Personal Playwright flows against published app | 4 passed, zero skipped, unexpected or flaky |
| Fresh-user API checks | Six groups passed locally and six against the hosted app |
| Independent fixture cleanup | 45 accounts and 19 projects verified absent |

The browser checks cover navigation/session persistence, exact private conversation links, DND hiding and cross-context persistence, note completion and carry-over, an accelerated one-minute Pomodoro with pause/reload/resume and one completion record, project-chat arrival, removed-member lockout and mobile dark mode. Existing matching/percentage/Under the Hood/team dashboard tests also passed.

API checks cover direct RLS and definer-reader private-message isolation, owner-only notes/preferences/focus history, DND expiry without deleting notifications, note edit/completion/delete, membership removal, same-origin rejection and invalid input. Local SQL tests also serialize and enforce the note cap. [Local API report](personal-local-live-api.json) · [Hosted API report](personal-live-api.json) · [Browser cleanup registries](personal-browser-cleanup.json)

## Failures and corrections

- Initial local SQL replay failed with `syntax error at or near "day"`. An explicit AS alias corrected the draft before live application.
- A local note test incorrectly expected a note completed today to disappear from today's history. The assertion now keeps it today and verifies its absence from tomorrow.
- The first full browser run returned `time zone "Asia/Calcutta" not recognized`. Live read-only timezone inspection confirmed Asia/Kolkata exists while the legacy browser alias does not. The API now normalizes that alias, with unit and hosted/API coverage.
- The next full run reported `Clicking the checkbox did not change its state`. Notes now update the checkbox immediately, roll back on mutation failure and reconcile with the returned notes.
- One targeted privacy check timed out while trying to switch an already-authenticated page to another account through sign-in. It now uses an independent browser context.
- One timer assertion expected exactly 00:30 after browser automation had also consumed real elapsed time, yielding 00:29. The browser check allows that action time and then checks exact persistence of the paused value. Unit tests cover the exact timestamp math.
- A mobile theme test attempted to click the offscreen sidebar before opening it. The test now opens the menu and waits for its closing transition before screenshots. The sidebar can scroll when its contents exceed the viewport.
- A targeted timer check found Reset could use the old duration while the preference save was still in flight. Save completion is now explicit, and Reset waits until settings are available. Reset also restarts the current phase and retains unsynced completions.

All failed browser attempts completed exact-ID fixture cleanup. Final passing results are separate from those attempts. There was no failed or uncertain live migration. The independent preservation helper initially compared timestamp strings literally and flagged the same instant represented as +05:30 in the CLI export and +00:00 in SDK responses. Normalizing equivalent offsets while retaining fractional precision verified all original values without changing database rows.

## Decisions and limitations

Running timer state belongs to a per-user browser localStorage key. DND, duration settings and completed-session history sync through the server. Each next phase starts explicitly, so a long browser suspension does not manufacture unattended rounds. Reset and skips do not count as completed work. Duration settings support one to 120 minutes. Statistics reflect device-reported completions. A stable completion UUID deduplicates retries.

Audio is optional and enabled through a user gesture, so no browser-notification permission prompt is required. DND also silences it. Pending completions retry every 15 seconds while the dashboard is open. Browser-local running state, offline completion queues and audio cannot execute while the browser is closed. Cross-device running-timer coordination and browser push notifications are outside this change. A DND change on another device appears on the next preference poll, within 30 seconds while visible.

Notes carry over without rewriting dates. My day open items mean open/in-progress project tickets. Recent feeds and project lists have bounded lengths. The weekly streak uses the last seven local dates and permits today's first session to be pending. Other legacy IANA aliases still depend on the host's timezone catalog.

## Publication

Deployment `0df2a4be-eb92-4506-93ef-2f24f107e009` reached `READY` at 2026-11-17T03:11:24.405Z. The existing deployment environment was reused. The live model health check confirmed MiniLM, 384 dimensions, valid local-file checksums and remote model loading disabled. A signed-out personal API request was denied. The four personal browser tests and six API groups were rerun against the public URL with new fixture users and cleaned up afterward. [Deployment evidence](personal-deployment.json) · [Model health](personal-deployed-health.json)
