# Live function signature audit — 17 November 2026

SELECT-only against the linked live database. Exit code 0. This is the pre-migration state; no migration was applied.

```sql
SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('add_member','has_capacity','check_actor','consume_rate','submit_match','respond_match','save_profile','save_project','match_breakdown','notify_user','participation_notification','lifecycle_guard','message_change_sequence','collaboration_action','refresh_project_filter_classification','sync_project_filter_classification','sync_domain_choices','snapshot_application_percentage','verified_user','owns_project','team_access','can_view_profile','match_candidates_for_role','profile_identities','profile_projects','workspace_data');
```

Complete CLI stdout:

```json
{
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
      "oid": "match_breakdown(uuid,uuid,uuid)"
    },
    {
      "oid": "add_member(uuid,uuid,uuid)"
    },
    {
      "oid": "check_actor(uuid)"
    },
    {
      "oid": "consume_rate(text,integer,integer)"
    },
    {
      "oid": "save_profile(uuid,jsonb,jsonb,integer)"
    },
    {
      "oid": "save_project(uuid,jsonb,jsonb,integer)"
    },
    {
      "oid": "respond_match(uuid,uuid,text,text)"
    },
    {
      "oid": "match_candidates_for_role(uuid,integer)"
    },
    {
      "oid": "submit_match(uuid,uuid,uuid,text,uuid,text)"
    },
    {
      "oid": "sync_project_filter_classification()"
    },
    {
      "oid": "sync_domain_choices()"
    },
    {
      "oid": "snapshot_application_percentage()"
    },
    {
      "oid": "refresh_project_filter_classification(uuid)"
    }
  ],
  "rowCount": 16,
  "fields": [
    {
      "name": "oid",
      "dataTypeID": 2202
    }
  ]
}
```

The query names 26 functions. It returns 16 existing functions: 13 of the 18 server-only routines and three of the eight authenticated read helpers. No signature mismatch was found among existing functions. The other ten functions are new definitions in the unapplied migrations:

```text
New in foundation (seven):
notify_user(uuid,uuid,uuid,text,text,text,text,text)
participation_notification()
lifecycle_guard()
message_change_sequence()
collaboration_action(uuid,uuid,jsonb)
team_access(uuid,uuid)
can_view_profile(uuid)

New in reads (three):
profile_identities(uuid[])
profile_projects(uuid)
workspace_data(uuid,text,timestamp with time zone,uuid,bigint)
```

The first five new foundation routines are server-only. The other five new routines are authenticated read helpers. `timestamptz` in the ACL is PostgreSQL's alias for `timestamp with time zone`; it is the same signature. Local PostgreSQL tests resolve all 26 exact ACL signatures after executing their definitions, before any live apply.
