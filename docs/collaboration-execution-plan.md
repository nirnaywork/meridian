# Collaboration migration execution record

The user supplied **backup done**, reviewed the dependency stop, then explicitly instructed the agent to continue the plan. The safety-net manifest and live preflight were rechecked before applying the two reviewed files, in order, successfully. The task-conflict correction was applied afterward as a separate forward migration when real API testing exposed a retryable serialization error. All three are in live migration history. No applied file was rewritten. The application was tested locally against linked InsForge, not deployed. See [the final report](collaboration-final-report.md).

The original commands and runner guarantees below are retained as the execution procedure. An additional successful command was:

```powershell
npx -y @insforge/cli db migrations up 20261118030000_task-conflict-response.sql --json
```

## Tool and exact commands

Use PowerShell from the Meridian repository and the linked **InsForge CLI**, currently inspected version **0.2.8**. The inspected CLI reads the complete file and sends one request containing `{version,name,sql}` to `POST /api/database/migrations`. It does not send statements through separate shell invocations or database connections.

First recheck file hashes against the current review and inspect migration history:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath 'migrations/20261118010000_collaboration-foundation.sql','migrations/20261118020000_collaboration-reads.sql'
npx -y @insforge/cli db migrations list --json
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect migration history; stop.' }
```

Apply only these two files, in order. Execute the second command only after the first succeeds:

```powershell
npx -y @insforge/cli db migrations up 20261118010000_collaboration-foundation.sql --json
if ($LASTEXITCODE -ne 0) { throw 'Foundation migration failed; do not run the next migration.' }

npx -y @insforge/cli db migrations up 20261118020000_collaboration-reads.sql --json
if ($LASTEXITCODE -ne 0) { throw 'Read migration failed; stop and report the committed foundation state.' }
```

No `db query` workaround, `--unrestricted`, command-per-statement execution, `--all`, manual migration-history writes or automatic retries after an uncertain outcome will be used. A network timeout can occur after a server commit: check migration history and catalogs before deciding whether to retry. If the remote head changed, stop rather than renaming or silently changing the reviewed files.

## One database session and transaction per file

Correction to the earlier proposal: **do not include literal BEGIN/COMMIT in the migration files**. InsForge supplies those boundaries and rejects in-file transaction control. This is documented in the [official migration guide](https://docs.insforge.dev/core-concepts/database/migrations).

The inspected [migration service](https://github.com/InsForge/InsForge/blob/main/backend/src/services/database/database-migration.service.ts) checks out one pool client, begins a transaction, acquires the migration advisory lock, sets the local search path and runs the complete input SQL through that same client. It records successful history and requests a schema reload before committing. On an exception it rolls back using that client, then releases it. The [admin context helper](https://github.com/InsForge/InsForge/blob/main/backend/src/services/database/user-context.service.ts) takes the existing client and uses transaction-local role/configuration; it does not open another connection or transaction.

Therefore a policy-guard exception or later SQL failure rolls back that file's transactional DDL, DML, grants and migration-history insert. The policy guard remains inside the foundation's transaction. Local tests mirror this one-client transaction pattern and inject both guard failures and late DDL/ACL failures to verify rollback.

Atomicity is **per file**, not across both CLI commands. If the first commits and the second fails, the first stays committed. Report that state and stop. The three successful CLI responses and live history now verify execution; source/documentation inspection separately establishes the runner transaction contract.

## Lifecycle behavior in the reviewed SQL

```sql
IF NEW.status IN('completed','cancelled','archived') THEN
  UPDATE public.applications
    SET status='rejected',decided_by=NEW.owner_id::text,decided_at=now()
    WHERE project_id=NEW.id AND status='pending';
  UPDATE public.invitations
    SET status='cancelled',decided_by=NEW.owner_id::text,decided_at=now()
    WHERE project_id=NEW.id AND status='pending';
END IF;
```

Closed and In progress block new applications/invitations but preserve pending records and snapshots. Reopening also preserves pending records. Completed, Cancelled and Archived resolve pending records and generate the corresponding notifications. Existing `respond_match` behavior still requires Open for approval/acceptance; this change does not expand acceptance permissions while recruiting is paused.

## Post-apply checks and output

After successful application, run and show all three original catalog queries verbatim using `npx -y @insforge/cli db query "<SQL>" --json`:

```sql
SELECT conrelid::regclass, conname, contype FROM pg_constraint WHERE conrelid IN ('public.projects'::regclass,'public.project_members'::regclass,'public.applications'::regclass);

SELECT tablename, policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','profile_skills','profile_domains','project_members');

SELECT p.oid::regprocedure, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('add_member','has_capacity','check_actor','submit_match','save_project','owns_project','match_candidates_for_role');
```

Also rerun the complete 26-function inventory from [the signature audit](collaboration-function-signature-audit.md), effective privileges for all 18 server-only functions, partial unique-index definitions (they are indexes and do not appear as unique constraints), membership/counter/capacity checks, and `db migrations list --json`. Confirm all 26 functions now resolve, the four old broad policies are gone, the replacement predicates are restrictive, client/PUBLIC EXECUTE is absent from server-only routines and the history contains both reviewed versions.

Only then create fresh real-API test users, run the previously requested authorization/lifecycle/notification/workspace checks, and clean up the exact recorded test rows and auth accounts afterward. Show actual outputs and report every failure, including cleanup failures. No re-embedding or user reseeding is needed.

## Completed verification

All requested catalog queries and checks were run after application and again after test cleanup. [Complete returned catalog JSON](collaboration-post-apply.json): 18 constraints, four restrictive policies, 26 function signatures, 18 server-only ACLs, both partial indexes, all migration history summaries and baseline preservation counts. Membership integrity is 15 total/15 active, zero duplicates, zero counter mismatches and zero over-capacity. All 15 original project/user/role/join tuples remain; the old table had no surrogate id, so the new UUID ids have no pre-migration equivalent. All 128 original embedding records and 44 original applications/invitations are unchanged. The old broad predicates are gone; three replacement policies intentionally reuse their names.

Full raw CLI history is retained locally at `.cache/collaboration-post-apply/migration-history.json`; the three apply responses are `.cache/collaboration-foundation-apply.json`, `.cache/collaboration-reads-apply.json` and `.cache/collaboration-conflict-apply.json`. These ignored artifacts are not deployed or committed. Private safety-net content is excluded from the public report.
