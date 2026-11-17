# Live migration catalog audit — 17 November 2026

These three commands were SELECT-only against the linked live database. No migration was applied. The JSON blocks contain the complete CLI stdout, including row counts and field metadata.

## constraints

```sql
SELECT conrelid::regclass, conname, contype FROM pg_constraint WHERE conrelid IN ('public.projects'::regclass,'public.project_members'::regclass,'public.applications'::regclass);
```

Exit code: 0

```json
{
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
      "conname": "projects_status_check",
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
      "conname": "applications_applicant_id_project_id_role_id_key",
      "contype": "u"
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
      "conname": "project_members_pkey",
      "contype": "p"
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
}
```

## policies

```sql
SELECT tablename, policyname, cmd, roles, qual FROM pg_policies WHERE schemaname='public' AND tablename IN ('profiles','profile_skills','profile_domains','project_members');
```

Exit code: 0

```json
{
  "rows": [
    {
      "tablename": "profile_domains",
      "policyname": "signed_in_read",
      "cmd": "SELECT",
      "roles": "{authenticated}",
      "qual": "(verified_user() IS NOT NULL)"
    },
    {
      "tablename": "profile_skills",
      "policyname": "profile_skills_read",
      "cmd": "SELECT",
      "roles": "{authenticated}",
      "qual": "(verified_user() IS NOT NULL)"
    },
    {
      "tablename": "profiles",
      "policyname": "profile_read",
      "cmd": "SELECT",
      "roles": "{authenticated}",
      "qual": "(verified_user() IS NOT NULL)"
    },
    {
      "tablename": "project_members",
      "policyname": "team_read",
      "cmd": "SELECT",
      "roles": "{authenticated}",
      "qual": "(verified_user() IS NOT NULL)"
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
}
```

## grants

```sql
SELECT p.oid::regprocedure, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('add_member','has_capacity','check_actor','submit_match','save_project','owns_project','match_candidates_for_role');
```

Exit code: 0

```json
{
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
      "proacl": null
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
}
```
