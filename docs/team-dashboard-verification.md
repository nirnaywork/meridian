# Team Dashboard verification

On November 17, 2026, InsForge recorded migration `20261118040000_team-dashboard.sql` at 02:13:32 UTC. The initial application checks used the local Next.js production build connected to the linked InsForge project. Following the user's publication request, deployment `e9b7c36f-334d-4ae0-8974-a1cd0bf8e4ba` reached READY at 02:24:54 UTC. The dashboard is published at https://tyhutf3c.insforge.site.

All seven collaboration browser tests passed against the hosted application, covering publication, approval, partial-team start, private/group chat, updates, tickets, profile links, membership removal and completion. Independent checks confirmed removal of all three fresh accounts and two fixture projects. The live MiniLM health reports valid checksums, 384 dimensions and remote models disabled. Signed-out dashboard API access returns 401. [Deployment and cleanup evidence](dashboard-deployment.json) · [Live model health](dashboard-deployed-health.json)

## Changes

The dashboard replaces the workspace at the existing URL. The page and chat are in `src/components/workspace.tsx`, with updates and tickets in `src/components/dashboard-activity.tsx`. The workspace API handler, Zod action schemas, notification destinations, account records, and project creation flow now use the new dashboard. The current feature guide covers data access, entry points, transitions and limitations. Historical migration reviews remain as dated audit records. [Dashboard guide](collaboration.md)

The migration preserves the existing message and read-state tables, adds the Everyone audience to old rows, introduces recipient-aware policies, replaces privileged read and action functions, adds updates, tickets and start metadata, and drops the archived task table. It runs as one InsForge-managed transaction. A locked task-table digest check aborts if the archive no longer matches. Existing projects already underway keep unknown historical start metadata. The minimum of one other member is supplied by one database function to both the guard and UI. The first start timestamp survives reopening. Switching private recipients selects their existing thread or begins one. Any active teammate can advance a ticket. Signed-in members receive approval redirects on Applications and can return through dashboard links.

## Backup and preservation

The ignored local directory `backups/pre-dashboard-2026-11-17/` holds complete exports for ten tables, including `project_tasks.json`, plus the preflight catalog and checksum manifest. The exported row counts matched counts computed in the same live SELECT snapshot.

| Table | Rows |
| --- | ---: |
| projects | 30 |
| project_members | 15 |
| project_roles | 46 |
| applications | 34 |
| invitations | 10 |
| project_messages | 0 |
| project_tasks | 0 |
| workspace_read_state | 0 |
| ownership_transfers | 0 |
| notifications | 0 |

The five relevant live function bodies matched the previous migration sources. No regular or materialized view referenced the replaced workspace objects. The CLI applied one file. Its SHA-256 was `4846ff8ed1eeb026073ae11320085570970a8eed2d1087a392a221ea412fa0bd`. The post-apply catalog shows four dashboard tables with RLS, four read policies, seven checked functions with the intended effective EXECUTE privileges, and zero remaining functions referencing the dropped table. The migration also appears in the live CLI history. [Catalog results](dashboard-catalog.json)

The final comparison accounted for every original business row in the exports. It also found one additional application and its notification, both created at 02:04:51 UTC, before this migration and unrelated to fixture identities. They remain in the database. The final counts were 35 applications and one notification. A local migration test exercised nonempty legacy chat, preserved read positions, and transaction rollback when a task was added after backup. [Preservation and cleanup counts](dashboard-verification.json)

## Verification

| Check | Result |
| --- | --- |
| Vitest, including local PostgreSQL/RLS | 71 passed across 14 files |
| TypeScript | Passed |
| Next.js production build | Passed |
| Playwright across the full suite | 25 passed, zero skipped, failed or flaky |
| Fresh-user API checks | 16 groups passed |
| Fixture cleanup across both API runs and the browser suite | 13 fresh accounts and four projects removed |

Browser checks covered project publication, the initial disabled Start button, approval, dashboard access from Applications, starting with two of four people, private and group chat, updates, tickets, terminal read-only state and existing matching flows. SQL and live API checks verified that even the lead cannot retrieve private messages outside their audience. The local authorization tests covered removal and private read counts. Live checks used real Next.js route handlers, cookie sessions and InsForge. The tests created embeddings only through ordinary saves for temporary users/projects. No matching implementation or existing embedding hash was modified.

The first API run passed nine groups and then returned HTTP 400 `{"message":"Required"}` because the test still called `read_chat` without the last seen message timestamp. Its cleanup succeeded. The corrected test supplies the actual stored timestamp. All 16 groups passed with fresh users on the rerun. Both API reports and the browser report include exact fixture IDs and cleanup outcomes. The cleanup helper verified each Auth account was absent. Independent final reads found zero fixture profiles or projects and zero remaining tickets or updates. [First API run](dashboard-first-api-run.json) · [Final API run](dashboard-live-api.json) · [Browser cleanup](dashboard-browser-cleanup.json)

The first sandboxed build encountered Windows `EPERM` while creating `.next/types/app/api`. An authorized build completed. A subsequently added migration test initially failed TypeScript because PostgreSQL query results were typed as unknown. Giving the two snapshot queries explicit row types resolved it. A strict equality check initially flagged the concurrent application and notification, and a follow-up assertion compared PostgreSQL bigint strings to numbers. The final comparison checks every original row, accounts separately for unrelated arrivals and parses the count values. None of those checks required a production data correction.
