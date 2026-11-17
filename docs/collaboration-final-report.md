# Collaboration delivery and live-database verification — 17 November 2026

## Outcome and deployment boundary

The collaboration plan is complete in source, all three database migrations are applied to InsForge project `52590b98-ea17-4cb4-aacf-49528d17a5ef`, and the final production build passed tests against that real backend. The updated application has **not been deployed**. Browser/API verification used local Next.js production servers connected to linked InsForge, not the older hosted frontend. No reseeding, reembed-all, global embedding migration, environment-file change or git commit was performed during this resumed rollout.

The original embedding inputs, canonical text, hash behavior, provider choice, calibration and percentage calculations are unchanged. Normal endpoints keep safe percentage projections. Raw vectors remain owner-private, and Under the Hood reads stored data. The 128 pre-existing embedding rows, traces and timestamps, plus 34 applications and 10 invitations, are unchanged after test cleanup.

## Delivered features and entry points

| Feature | Delivered behavior |
| --- | --- |
| In-app notifications | Bell/count, recent dropdown, recipient-only paginated `/notifications`, unread filter, individual/all mark-read, transaction-generated participation/lifecycle/task events, self-alert suppression and retry deduplication. |
| Team chat | `/projects/[id]/workspace?tab=chat`, active-team authorization, text messages, optimistic retry, earlier-history pagination, incremental edits/deletions, author edit/delete, lead moderation, unread state and terminal read-only mode. |
| Task board | Workspace Tasks tab, four columns, priorities/assignee/due date, detail dialogs, drag/drop plus movement controls, URL filters, team permissions, assignment notifications, 200-active-task cap and revision conflicts. |
| Profiles | Separate Links & visibility editor, HTTPS validation, empty-by-default links, signed-in `/u/[id]`, safe linked identities across participation UI, Private default, Public opt-in and metadata-only saves that do not re-embed. |
| Lifecycle | Open/Closed/In progress/Completed/Cancelled/Archived transitions, leave/removal/history, role reassignment, transactional capacity, recipient-consented ownership transfer and preserved chat/history. |

Main added source: `src/lib/collaboration.ts`, `src/lib/server/workspace.ts`, `src/app/collaboration.css`; components `notifications.tsx`, `workspace.tsx`, `workspace-link.tsx`, `public-profile.tsx`, `collaboration-ui.tsx`; pages `/notifications`, `/u/[id]`, `/projects/[id]/workspace`; API routes `/api/notifications`, `/api/notifications/unread-count`, `/api/profile-metadata`, `/api/profiles/[id]`, `/api/projects/[id]/workspace`. Existing shell, profile/project editors, cards/details, participation lists, profile links, safe response projections and status filters are updated. Full contracts, permissions, event list and lifecycle diagram: [collaboration guide](collaboration.md).

No new production dependency or external service was added. PGlite/pgvector are test-only development dependencies. Native dialog and native drag/drop with non-drag controls reuse the existing UI approach.

## Safety net and migration execution

The requested SELECT-only logical safety net is in `backups/pre-collab-2026-11-17/`, excluded by `/backups/` in `.gitignore`, with no tracked files. Twelve tables were exported together from one SELECT snapshot; separate live SELECT counts matched. Every saved file's byte count/hash and row count were verified. It is not a full database dump. Private rows/vectors/traces remain local and are not included here.

| Export | Exported rows | Live count at export |
| --- | ---: | ---: |
| `profiles.json` | 76 | 76 |
| `projects.json` | 30 | 30 |
| `invitations.json` | 10 | 10 |
| `applications.json` | 34 | 34 |
| `project_roles.json` | 46 | 46 |
| `profile_skills.json` | 106 | 106 |
| `profile_domains.json` | 36 | 36 |
| `project_members.json` | 15 | 15 |
| `role_embeddings.json` | 46 | 46 |
| `profile_embeddings.json` | 52 | 52 |
| `project_embeddings.json` | 30 | 30 |
| `project_role_skills.json` | 123 | 123 |
| `indexes.json` | 7 | 7 |
| `policies.json` | 4 | 4 |
| `constraints.json` | 18 | 18 |
| `function-definitions.json` | 16 | 16 |

The dependency gate found legacy membership routines and stopped as requested. The user subsequently instructed continuation. Revised SQL already replaced those routines; a fail-closed effective-catalog guard and populated 15-member legacy migration test verify active-row filters, explicit insert columns, no legacy membership conflict target and no unreviewed view/function dependency. Initial guard-test defects were corrected before application. [Historical gate evidence](collaboration-dependency-gate.md), [signature audit](collaboration-function-signature-audit.md), [original catalog queries](collaboration-live-catalog-audit.md).

Pre-apply checks: 15 memberships, zero duplicate active keys, zero role-counter mismatches, zero over-capacity. All three commands returned success; no uncertain migration outcome or blind retry occurred. InsForge executes the complete file on one checked-out connection in one transaction, including its policy/dependency guards, history insert and schema reload. It supplies BEGIN/COMMIT and rejects transaction-control statements in files. Atomicity is per file, not across the command sequence. [Runner evidence and execution record](collaboration-execution-plan.md).

| File | SHA-256 | Applied UTC |
| --- | --- | --- |
| `20261118010000_collaboration-foundation.sql` | `8039fd15e9f441ee5ab0c6d22cf76212bedb5073f8513982bf30f007ddfd485e` | 2026-11-17T01:04:22.874Z |
| `20261118020000_collaboration-reads.sql` | `a6559567d0e42f1907f2b2b578facd94d5d539ec659205d3d7495c0115ac7f73` | 2026-11-17T01:04:40.166Z |
| `20261118030000_task-conflict-response.sql` | `505e0cd1267a7c7a60cd9e5cb6799ff6068aa026ba816d354c6aa4fee960892d` | 2026-11-17T01:19:54.032Z |

Exact commands executed, in order:

```powershell
npx -y @insforge/cli db migrations up 20261118010000_collaboration-foundation.sql --json
npx -y @insforge/cli db migrations up 20261118020000_collaboration-reads.sql --json
npx -y @insforge/cli db migrations up 20261118030000_task-conflict-response.sql --json
```

The first two reviewed files were not modified after application. The third is a forward task-conflict correction discovered during real API testing. [All three full SQL files and hashes](collaboration-migration-review.md). Successful raw CLI apply responses are retained locally at `.cache/collaboration-foundation-apply.json`, `.cache/collaboration-reads-apply.json`, `.cache/collaboration-conflict-apply.json`; each reports “Migration executed successfully.” Full raw CLI migration history is `.cache/collaboration-post-apply/migration-history.json`; the complete history summary is included below.

## Post-apply catalog and preservation results

All requested catalog queries were rerun after apply and after cleanup. Results: 18 constraints; four restrictive policies; 26 exact function signatures; all 18 server-only functions deny EXECUTE to PUBLIC/anon/authenticated and allow project_admin; expected active-membership/pending-application partial unique indexes; 15 memberships, all active, with zero duplicates, counter mismatches or over-capacity.

The old broad policy predicates are gone. `profile_read`, `profile_skills_read` and `team_read` intentionally reuse names with restrictive expressions; `profile_domains.signed_in_read` is replaced by `profile_domain_read`. Owner-only embedding/trace policies remain unchanged. Email remains in managed Auth with client table SELECT denied, not in the safe profile projection.

All 15 original project/user/role/joined_at tuples remain. The old table had no surrogate id; the migration assigns new UUID ids rather than preserving nonexistent ids. All 128 original embedding rows (52 profile, 30 project, 46 role) and all 44 applications/invitations were compared in full with the safety net and are unchanged. No test fixture remains in those counts.

The following is the complete returned public catalog JSON, including field metadata, the original three query results, 26-function inventory, effective privileges, indexes, integrity, migration history and aggregate preservation results. Private preservation rows are intentionally excluded. Standalone file: [collaboration-post-apply.json](collaboration-post-apply.json).

<details>
<summary>Complete post-apply catalog output</summary>

```json
{
  "constraints": {
    "rows": [
      {
        "conrelid": "projects",
        "conname": "projects_title_check",
        "contype": "c"
      },
      {
        "conrelid": "projects",
        "conname": "projects_commitment_check",
        "contype": "c"
      },
      {
        "conrelid": "projects",
        "conname": "projects_team_size_check",
        "contype": "c"
      },
      {
        "conrelid": "projects",
        "conname": "projects_pkey",
        "contype": "p"
      },
      {
        "conrelid": "projects",
        "conname": "projects_owner_id_fkey",
        "contype": "f"
      },
      {
        "conrelid": "applications",
        "conname": "applications_status_check",
        "contype": "c"
      },
      {
        "conrelid": "applications",
        "conname": "applications_pkey",
        "contype": "p"
      },
      {
        "conrelid": "applications",
        "conname": "applications_project_id_fkey",
        "contype": "f"
      },
      {
        "conrelid": "applications",
        "conname": "applications_applicant_id_fkey",
        "contype": "f"
      },
      {
        "conrelid": "applications",
        "conname": "applications_role_id_project_id_fkey",
        "contype": "f"
      },
      {
        "conrelid": "project_members",
        "conname": "project_members_project_id_fkey",
        "contype": "f"
      },
      {
        "conrelid": "project_members",
        "conname": "project_members_user_id_fkey",
        "contype": "f"
      },
      {
        "conrelid": "project_members",
        "conname": "project_members_role_id_project_id_fkey",
        "contype": "f"
      },
      {
        "conrelid": "applications",
        "conname": "applications_match_percent_check",
        "contype": "c"
      },
      {
        "conrelid": "applications",
        "conname": "percentage_snapshot_pair",
        "contype": "c"
      },
      {
        "conrelid": "projects",
        "conname": "projects_status_check",
        "contype": "c"
      },
      {
        "conrelid": "project_members",
        "conname": "project_members_removed_by_fkey",
        "contype": "f"
      },
      {
        "conrelid": "project_members",
        "conname": "project_members_pkey",
        "contype": "p"
      }
    ],
    "rowCount": 18,
    "fields": [
      {
        "name": "conrelid",
        "dataTypeID": 2205
      },
      {
        "name": "conname",
        "dataTypeID": 19
      },
      {
        "name": "contype",
        "dataTypeID": 18
      }
    ]
  },
  "policies": {
    "rows": [
      {
        "tablename": "profiles",
        "policyname": "profile_read",
        "cmd": "SELECT",
        "roles": "{authenticated}",
        "qual": "can_view_profile(id)"
      },
      {
        "tablename": "profile_skills",
        "policyname": "profile_skills_read",
        "cmd": "SELECT",
        "roles": "{authenticated}",
        "qual": "can_view_profile(profile_id)"
      },
      {
        "tablename": "project_members",
        "policyname": "team_read",
        "cmd": "SELECT",
        "roles": "{authenticated}",
        "qual": "(team_access(project_id, verified_user()) OR (user_id = verified_user()))"
      },
      {
        "tablename": "profile_domains",
        "policyname": "profile_domain_read",
        "cmd": "SELECT",
        "roles": "{authenticated}",
        "qual": "can_view_profile(profile_id)"
      }
    ],
    "rowCount": 4,
    "fields": [
      {
        "name": "tablename",
        "dataTypeID": 19
      },
      {
        "name": "policyname",
        "dataTypeID": 19
      },
      {
        "name": "cmd",
        "dataTypeID": 25
      },
      {
        "name": "roles",
        "dataTypeID": 1003
      },
      {
        "name": "qual",
        "dataTypeID": 25
      }
    ]
  },
  "acl": {
    "rows": [
      {
        "oid": "add_member(uuid,uuid,uuid)",
        "proacl": "{project_admin=X/project_admin}"
      },
      {
        "oid": "check_actor(uuid)",
        "proacl": "{project_admin=X/project_admin}"
      },
      {
        "oid": "has_capacity(uuid,uuid)",
        "proacl": "{project_admin=X/project_admin}"
      },
      {
        "oid": "match_candidates_for_role(uuid,integer)",
        "proacl": "{project_admin=X/project_admin,authenticated=X/project_admin}"
      },
      {
        "oid": "owns_project(uuid)",
        "proacl": "{project_admin=X/project_admin,authenticated=X/project_admin}"
      },
      {
        "oid": "save_project(uuid,jsonb,jsonb,integer)",
        "proacl": "{project_admin=X/project_admin}"
      },
      {
        "oid": "submit_match(uuid,uuid,uuid,text,uuid,text)",
        "proacl": "{project_admin=X/project_admin}"
      }
    ],
    "rowCount": 7,
    "fields": [
      {
        "name": "oid",
        "dataTypeID": 2202
      },
      {
        "name": "proacl",
        "dataTypeID": 1034
      }
    ]
  },
  "functions": {
    "rows": [
      {
        "oid": "verified_user()"
      },
      {
        "oid": "owns_project(uuid)"
      },
      {
        "oid": "has_capacity(uuid,uuid)"
      },
      {
        "oid": "add_member(uuid,uuid,uuid)"
      },
      {
        "oid": "check_actor(uuid)"
      },
      {
        "oid": "respond_match(uuid,uuid,text,text)"
      },
      {
        "oid": "collaboration_action(uuid,uuid,jsonb)"
      },
      {
        "oid": "snapshot_application_percentage()"
      },
      {
        "oid": "profile_identities(uuid[])"
      },
      {
        "oid": "profile_projects(uuid)"
      },
      {
        "oid": "workspace_data(uuid,text,timestamp with time zone,uuid,bigint)"
      },
      {
        "oid": "team_access(uuid,uuid)"
      },
      {
        "oid": "notify_user(uuid,uuid,uuid,text,text,text,text,text)"
      },
      {
        "oid": "message_change_sequence()"
      },
      {
        "oid": "consume_rate(text,integer,integer)"
      },
      {
        "oid": "submit_match(uuid,uuid,uuid,text,uuid,text)"
      },
      {
        "oid": "save_profile(uuid,jsonb,jsonb,integer)"
      },
      {
        "oid": "save_project(uuid,jsonb,jsonb,integer)"
      },
      {
        "oid": "match_breakdown(uuid,uuid,uuid)"
      },
      {
        "oid": "participation_notification()"
      },
      {
        "oid": "lifecycle_guard()"
      },
      {
        "oid": "refresh_project_filter_classification(uuid)"
      },
      {
        "oid": "sync_project_filter_classification()"
      },
      {
        "oid": "sync_domain_choices()"
      },
      {
        "oid": "can_view_profile(uuid)"
      },
      {
        "oid": "match_candidates_for_role(uuid,integer)"
      }
    ],
    "rowCount": 26,
    "fields": [
      {
        "name": "oid",
        "dataTypeID": 2202
      }
    ]
  },
  "effective-privileges": {
    "rows": [
      {
        "signature": "add_member(uuid,uuid,uuid)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "check_actor(uuid)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "collaboration_action(uuid,uuid,jsonb)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "consume_rate(text,integer,integer)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "has_capacity(uuid,uuid)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "lifecycle_guard()",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "match_breakdown(uuid,uuid,uuid)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "message_change_sequence()",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "notify_user(uuid,uuid,uuid,text,text,text,text,text)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "participation_notification()",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "refresh_project_filter_classification(uuid)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "respond_match(uuid,uuid,text,text)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "save_profile(uuid,jsonb,jsonb,integer)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "save_project(uuid,jsonb,jsonb,integer)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "snapshot_application_percentage()",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "submit_match(uuid,uuid,uuid,text,uuid,text)",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "sync_domain_choices()",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      },
      {
        "signature": "sync_project_filter_classification()",
        "anon": false,
        "authenticated": false,
        "project_admin": true,
        "public": false
      }
    ],
    "rowCount": 18,
    "fields": [
      {
        "name": "signature",
        "dataTypeID": 2202
      },
      {
        "name": "anon",
        "dataTypeID": 16
      },
      {
        "name": "authenticated",
        "dataTypeID": 16
      },
      {
        "name": "project_admin",
        "dataTypeID": 16
      },
      {
        "name": "public",
        "dataTypeID": 16
      }
    ]
  },
  "partial-indexes": {
    "rows": [
      {
        "schemaname": "public",
        "tablename": "project_members",
        "indexname": "one_active_membership",
        "indexdef": "CREATE UNIQUE INDEX one_active_membership ON public.project_members USING btree (project_id, user_id) WHERE (left_at IS NULL)"
      },
      {
        "schemaname": "public",
        "tablename": "applications",
        "indexname": "one_pending_application",
        "indexdef": "CREATE UNIQUE INDEX one_pending_application ON public.applications USING btree (applicant_id, project_id, COALESCE(role_id, '00000000-0000-0000-0000-000000000000'::uuid)) WHERE (status = 'pending'::text)"
      }
    ],
    "rowCount": 2,
    "fields": [
      {
        "name": "schemaname",
        "dataTypeID": 19
      },
      {
        "name": "tablename",
        "dataTypeID": 19
      },
      {
        "name": "indexname",
        "dataTypeID": 19
      },
      {
        "name": "indexdef",
        "dataTypeID": 25
      }
    ]
  },
  "integrity": {
    "rows": [
      {
        "integrity": {
          "duplicates": 0,
          "over_capacity": 0,
          "count_mismatches": 0,
          "total_memberships": 15,
          "active_memberships": 15
        }
      }
    ],
    "rowCount": 1,
    "fields": [
      {
        "name": "integrity",
        "dataTypeID": 3802
      }
    ]
  },
  "migration_history": [
    {
      "version": "20261118030000",
      "name": "task-conflict-response",
      "createdAt": "2026-11-17T01:19:54.032Z"
    },
    {
      "version": "20261118020000",
      "name": "collaboration-reads",
      "createdAt": "2026-11-17T01:04:40.166Z"
    },
    {
      "version": "20261118010000",
      "name": "collaboration-foundation",
      "createdAt": "2026-11-17T01:04:22.874Z"
    },
    {
      "version": "20261117070000",
      "name": "explore-filters",
      "createdAt": "2026-11-16T22:36:05.157Z"
    },
    {
      "version": "20261117060000",
      "name": "retire-project-match-rpc",
      "createdAt": "2026-11-16T22:07:44.495Z"
    },
    {
      "version": "20261117050000",
      "name": "percentage-rollout-compatibility",
      "createdAt": "2026-11-16T21:55:15.447Z"
    },
    {
      "version": "20261117040000",
      "name": "role-percentages",
      "createdAt": "2026-11-16T21:44:53.935Z"
    },
    {
      "version": "20261117030000",
      "name": "domain-consistency",
      "createdAt": "2026-11-16T20:54:25.106Z"
    },
    {
      "version": "20261117020000",
      "name": "open-participation",
      "createdAt": "2026-11-16T19:21:43.478Z"
    },
    {
      "version": "20261117010000",
      "name": "change-set-one",
      "createdAt": "2026-11-16T19:10:07.450Z"
    },
    {
      "version": "20261116142000",
      "name": "feed-open-roles",
      "createdAt": "2026-11-16T14:19:42.985Z"
    },
    {
      "version": "20261116140221",
      "name": "onboarding-completion",
      "createdAt": "2026-11-16T14:03:17.628Z"
    },
    {
      "version": "20261116133716",
      "name": "meridian-schema",
      "createdAt": "2026-11-16T13:40:12.031Z"
    }
  ],
  "preservation": {
    "original_memberships_retained": 15,
    "active_memberships": 15,
    "embeddings_unchanged": 128,
    "applications_unchanged": 34,
    "invitations_unchanged": 10
  }
}
```

</details>

## Actual verification results

| Check | Actual final result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test -- --reporter=dot` | 72 passed across 14 files |
| `npm run build` | Passed; prebuild verified pinned model checksums |
| Real API via `scripts/collaboration-live.ts` | 16 check groups passed against real linked InsForge |
| Full Playwright suite | 24 passed, zero skipped, zero failures, zero flaky results; 76.4 seconds |
| Read-only project-filter regression | 22 passed; all 30 existing projects remain represented |
| Post-test baseline comparison | 15 original active memberships, 128 embeddings, 34 applications and 10 invitations preserved |
| Recorded test-account/project absence | All 19 fresh accounts and four remote projects removed |

The browser suite's six collaboration tests use actual Next.js routes, cookie sessions and live InsForge. The temporary API bridge was removed. Existing session/logo, Explore filters, percentage flags and Under the Hood arithmetic tests also passed. Expected missing-model stderr in its dedicated unit test is deliberate failure-path coverage. PGlite tests check runner-style transaction rollback, schema replay/reapplication, populated legacy membership migration, RLS/ACLs, state-machine parity and ownership/task permissions. The live competing-approval test uses separate requests; this is not a sustained concurrency/load benchmark.

The real API check groups passed:

- private profiles and talent are hidden from unrelated users.
- links/public visibility save without changing the embedding or trace.
- Explore, project role percentages and stored Under the Hood endpoints work.
- apply stays pending, notifies lead, and pending/nonmembers lack workspace access.
- approval notifies applicant and grants active workspace access.
- rejection and withdrawal notify the correct recipients.
- closed/in_progress preserve pending records and block new recruiting.
- invitation acceptance/decline/cancel notify correctly and acceptance adds membership.
- recipient-only inboxes, mark-read and direct RLS/privileged RPC denial.
- team chat persists, edits, soft-deletes and rejects unauthorized edits.
- tasks enforce assignment, revision conflicts and reassignment notifications.
- removal revokes access, preserves chat, unassigns tasks and frees role slots.
- role reassignment and concurrent approvals cannot overfill slots.
- owner Under the Hood exposes snapshots without applicant raw vectors.
- ownership transfer requires recipient consent and changes permissions.
- completion resolves pending records and makes workspace read-only.

Reports: [real API](collaboration-live-api.json), [22 filter checks](collaboration-filter-regression.json), [final account/project absence and browser statistics](collaboration-final-verification.json). Full browser reporter output is retained locally at `.cache/collaboration-regression-real.json`.

## Failures encountered and corrective actions

1. First real API attempt passed ten groups, then a stale task edit expected 409 but received 500. The diagnostic RPC response was:

   ```json
   {"error":"INTERNAL_ERROR","message":"timeout of 10000ms exceeded","statusCode":500}
   ```

   The task revision function used SQLSTATE `40001` (retryable serialization failure). It now uses `PT409`; the API honors the database conflict code before a generic gateway status. A deleted-task/nonzero-revision guard prevents a delayed stale edit from recreating a deleted task. These changes are in the third forward migration plus HTTP error mapping, with unit tests.

2. That attempt's cleanup failed with the exact error:

   ```text
   update or delete on table "projects" violates foreign key constraint "notifications_project_id_fkey" on table "notifications"
   ```

   A task/notification was observed after its earlier cleanup pass. A delayed retry is consistent with the serialization path; there is no server trace proving the exact timing. Recovery re-enumerated only the recorded fixture project/users and removed their remaining rows/auth accounts in foreign-key order. Cleanup now records child IDs before deletion and rechecks late task/notification rows. [First attempt](collaboration-live-first-attempt.json), [exact-ID recovery](collaboration-first-attempt-cleanup.json).

3. The second real API attempt also passed ten groups, then returned 400 instead of 409 because the local production server still used the older HTTP mapper. Cleanup passed. After rebuilding and restarting, the final run passed all 16 groups. [Second attempt](collaboration-live-second-attempt.json).

4. The first failed cleanup began before every child ID was persisted. Therefore not every already-deleted child ID from that attempt can be reconstructed. All top-level account/project IDs were recorded and every deletion was scoped to them; the absence/preservation checks found no remaining fixtures or changed original participation/embedding rows. Later runs persist child-ID registries before deletion. This is an audit-record limitation, not an unreported successful cleanup claim.

Earlier setup/dependency review also found and corrected two local guard-test defects (missing lifecycle allowlist entry and an overly broad conflict-target matcher). Those are recorded in the historical gate. The last local backup checker initially raised `UnicodeDecodeError: 'charmap' codec can't decode byte 0x9d` because Python used Windows CP1252; rerunning with explicit UTF-8 verified all 16 files, counts and checksums without changing them. No known failing required feature/regression check remains after the final run. An earlier dependency audit reported eight vulnerabilities (one moderate, five high, two critical); unrelated dependency upgrades were not applied, and the final test pass is not a dependency-security clearance.

## Cleanup evidence and privacy

Fresh accounts were created only at test time, never seeded. Three API attempts used 15 distinct accounts; the earlier bridged browser run used two, and the final real browser run used two. Four remote fixture projects were created across the real runs. All IDs are in [final verification](collaboration-final-verification.json); child-row deletion registries and counts are in the API/browser cleanup reports. [Browser cleanup](collaboration-browser-cleanup.json) also includes the earlier temporary-bridge fixture account cleanup.

Cleanup uses recorded UUIDs, validates fixture ownership/participants, removes notifications/messages/tasks/read state/transfers before memberships/applications/invitations/project relations and projects, then profile relations/profiles and exact Auth accounts. It never deletes by a display name or broad test prefix. Auth deletion uses the admin API with explicit userIds, followed by a 404 check per account. Final checks found zero recorded fixture profiles, projects or Auth accounts. The private backup remains local/ignored.

## Decisions and operational limitations

- Private is the existing-user default. Full profiles are visible to the owner, active shared-project contacts or application/invitation contacts, including historical statuses; Public means verified signed-in users, not anonymous visitors. Minimal name/avatar identity is separate from the private full profile.
- Find Talent excludes unrelated private profiles. Eligible candidates still need Member intent, completed onboarding, a compatible stored role/profile embedding and no active membership in that project. Public opt-in or an allowed relationship can make a private candidate discoverable; no visibility is changed automatically. Only the lead can use this ranked tool, and no fit score gates applications/invitations.
- Closed and In progress stop new recruiting but preserve pending applications/invitations. Existing approval/acceptance remains Open-only. Completed/Cancelled/Archived resolve pending participation. Terminal chat/tasks/project editing are read-only; departure/history management remains permitted. Completed/Cancelled can only become Archived.
- Ownership transfer requires a current member with existing Lead intent and explicit recipient acceptance. The former lead stays as a general collaborator; the new lead's previous role slot is freed and total capacity is unchanged.
- Polling avoids extra realtime infrastructure: visible-tab notification count every 45 seconds, overview 30 seconds, chat five seconds, tasks ten seconds. Hidden tabs pause. No per-message notifications.
- One chat channel, plain text, no attachments/threads/mentions. No task comments. Board reads cap at 1,000 total tasks with at most 200 active; larger completed histories need pagination. Removed users lose subsequent access, but already-viewed browser content cannot be erased.
- Payments, ratings, admin moderation, file collaboration, social login, direct messaging and push/email notifications remain outside scope.
- The hosted frontend still needs a separate authorized deployment to expose the new UI. This task deliberately did not deploy, reseed or reembed-all.
