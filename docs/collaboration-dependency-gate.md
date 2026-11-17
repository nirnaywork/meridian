# Membership dependency gate — historical stop, now resolved

**Current status:** the user subsequently instructed continuation. The revised guarded SQL passed local tests, was applied successfully, and passed the post-apply catalog and preservation checks. This document retains the original read-only gate evidence; its stop statements describe that earlier review. See [the final report](collaboration-final-report.md).

The user authorized a SELECT-only safety net and a conditional rollout. Step 1 completed. Step 2 found the legacy dependency shapes below, so no migration or real-API test-user creation was performed. The draft already replaced the four live routines; this review added an effective-catalog guard and a populated-legacy regression before returning revised hashes for confirmation.

| Live routine | Legacy behavior | Proposed replacement |
| --- | --- | --- |
| `add_member(uuid,uuid,uuid)` | Positional four-value INSERT | Explicit project_id/user_id/role_id columns; defaults supply id/joined_at/history fields; active-team helper prevents duplicates |
| `has_capacity(uuid,uuid)` | Counts all membership rows | Counts only left_at IS NULL |
| `save_project(uuid,jsonb,jsonb,integer)` | Counts all membership rows for team size | Counts only left_at IS NULL |
| `match_candidates_for_role(uuid,integer)` | Excludes anyone with any membership history | Excludes only current active membership |

`respond_match` has no direct membership table access and no composite-key ON CONFLICT. Both application approval and invitation acceptance call `add_member(pid,uid,rid)` under the project lock. Its existing Open-only acceptance rule is unchanged. Neither normal nor materialized views reference project_members (zero rows for each query).

The new catalog guard checks known legacy INSERT/conflict shapes, requires active-row filters in capacity/save/talent/access/lifecycle routines, verifies respond_match delegation, and rejects unreviewed function/view dependencies. It is a targeted guard over reviewed bodies, not a general SQL theorem prover. Intentional history readers (workspace membership history, past-work profiles and former-member reapplication checks) may read inactive rows; they never establish active access or consume capacity. All active membership authorization/counts use left_at IS NULL.

Local validation: 70 tests pass, including migration of a genuinely pre-change, populated 15-member table. The original project_id/user_id/role_id/joined_at fields remain unchanged; new UUID ids are unique; all 15 initial rows stay active; leave/rejoin works with history; respond_match approval, role counters, team-size shrinkage and talent exclusion use active rows. Rollback tests reject positional inserts, unfiltered active counts and unreviewed views. TypeScript passes.

Initial new-guard test runs exposed two guard implementation issues (an omitted lifecycle_guard allowlist entry, and a conflict-target check that accidentally matched workspace_read_state). Both were corrected; the final 70-check run passes. No unresolved local test failure is claimed as a pass.

The full SELECT outputs follow. No private table-row data is reproduced here; it stays in the ignored local safety-net directory.

## membership-functions

```sql
SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ILIKE '%project_members%';
```

Exit code: 0

```json
{
  "rows": [
    {
      "oid": "has_capacity(uuid,uuid)"
    },
    {
      "oid": "add_member(uuid,uuid,uuid)"
    },
    {
      "oid": "save_project(uuid,jsonb,jsonb,integer)"
    },
    {
      "oid": "match_candidates_for_role(uuid,integer)"
    }
  ],
  "rowCount": 4,
  "fields": [
    {
      "name": "oid",
      "dataTypeID": 2202
    }
  ]
}
```

## respond-match-definition

```sql
SELECT pg_get_functiondef('public.respond_match(uuid,uuid,text,text)'::regprocedure);
```

Exit code: 0

```json
{
  "rows": [
    {
      "pg_get_functiondef": "CREATE OR REPLACE FUNCTION public.respond_match(actor uuid, record_id uuid, kind text, decision text)\n RETURNS jsonb\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'public', 'pg_temp'\nAS $function$\nDECLARE pid uuid; rid uuid; uid uuid; st text; owner uuid; project_status text;\nBEGIN\n PERFORM public.check_actor(actor);\n IF kind='application' THEN SELECT project_id INTO pid FROM public.applications WHERE id=record_id;ELSE SELECT project_id INTO pid FROM public.invitations WHERE id=record_id;END IF;\n SELECT owner_id,status INTO owner,project_status FROM public.projects WHERE id=pid FOR UPDATE;\n IF pid IS NULL THEN RAISE EXCEPTION 'Not found';END IF;\n IF kind='application' THEN\n SELECT role_id,applicant_id,status INTO rid,uid,st FROM public.applications WHERE id=record_id FOR UPDATE;\n IF st<>'pending' THEN RAISE EXCEPTION 'Only pending applications can change';END IF;\n IF decision='withdrawn' THEN IF actor<>uid THEN RAISE EXCEPTION 'Forbidden';END IF;\n ELSIF decision IN('approved','rejected') THEN IF actor<>owner THEN RAISE EXCEPTION 'Forbidden';END IF;\n ELSE RAISE EXCEPTION 'Invalid decision';END IF;\n IF decision='approved' THEN IF project_status<>'open' THEN RAISE EXCEPTION 'Project is closed';END IF;PERFORM public.add_member(pid,uid,rid);END IF;\n UPDATE public.applications SET status=decision,decided_by=actor::text,decided_at=now() WHERE id=record_id;\n ELSIF kind='invitation' THEN\n SELECT role_id,invitee_id,status INTO rid,uid,st FROM public.invitations WHERE id=record_id FOR UPDATE;\n IF st<>'pending' THEN RAISE EXCEPTION 'Only pending invitations can change';END IF;\n IF decision='cancelled' THEN IF actor<>owner THEN RAISE EXCEPTION 'Forbidden';END IF;\n ELSIF decision IN('accepted','declined') THEN IF actor<>uid THEN RAISE EXCEPTION 'Forbidden';END IF;\n ELSE RAISE EXCEPTION 'Invalid decision';END IF;\n IF decision='accepted' THEN IF project_status<>'open' THEN RAISE EXCEPTION 'Project is closed';END IF;PERFORM public.add_member(pid,uid,rid);END IF;\n UPDATE public.invitations SET status=decision,decided_by=actor::text,decided_at=now() WHERE id=record_id;\n ELSE RAISE EXCEPTION 'Invalid kind';END IF;\n RETURN jsonb_build_object('status',decision);\nEND $function$\n"
    }
  ],
  "rowCount": 1,
  "fields": [
    {
      "name": "pg_get_functiondef",
      "dataTypeID": 25
    }
  ]
}
```

## membership-views

```sql
SELECT schemaname, viewname FROM pg_views WHERE definition ILIKE '%project_members%';
```

Exit code: 0

```json
{
  "rows": [],
  "rowCount": 0,
  "fields": [
    {
      "name": "schemaname",
      "dataTypeID": 19
    },
    {
      "name": "viewname",
      "dataTypeID": 19
    }
  ]
}
```

## membership-function-definitions

```sql
SELECT p.oid::regprocedure::text AS signature,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosrc ILIKE '%project_members%' ORDER BY p.proname;
```

Exit code: 0

```json
{
  "rows": [
    {
      "signature": "add_member(uuid,uuid,uuid)",
      "definition": "CREATE OR REPLACE FUNCTION public.add_member(pid uuid, uid uuid, rid uuid)\n RETURNS void\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'public', 'pg_temp'\nAS $function$ BEGIN\n PERFORM 1 FROM public.projects WHERE id=pid FOR UPDATE;\n IF NOT public.has_capacity(pid,rid) THEN RAISE EXCEPTION 'This team or role is full';END IF;\n INSERT INTO public.project_members VALUES(pid,uid,rid,now());\n IF rid IS NOT NULL THEN UPDATE public.project_roles SET filled_count=filled_count+1 WHERE id=rid;END IF;\nEND $function$\n"
    },
    {
      "signature": "has_capacity(uuid,uuid)",
      "definition": "CREATE OR REPLACE FUNCTION public.has_capacity(pid uuid, rid uuid)\n RETURNS boolean\n LANGUAGE sql\n STABLE SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'public', 'pg_temp'\nAS $function$\n SELECT (SELECT count(*) FROM public.project_members WHERE project_id=pid)<(SELECT team_size-1 FROM public.projects WHERE id=pid) AND (rid IS NULL OR EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id=pid AND filled_count<slots));\n$function$\n"
    },
    {
      "signature": "match_candidates_for_role(uuid,integer)",
      "definition": "CREATE OR REPLACE FUNCTION public.match_candidates_for_role(p_role uuid, p_limit integer DEFAULT 30)\n RETURNS jsonb\n LANGUAGE plpgsql\n STABLE SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'public', 'pg_temp'\nAS $function$\nDECLARE pid uuid; result jsonb;\nBEGIN\n SELECT project_id INTO pid FROM public.project_roles WHERE id=p_role;\n IF NOT public.owns_project(pid) THEN RAISE EXCEPTION 'Forbidden'; END IF;\n SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (\n SELECT p.id,p.display_name,p.headline,p.avatar_url,p.is_demo,public.match_breakdown(p.id,pid,p_role) breakdown\n FROM public.profiles p JOIN public.profile_embeddings e ON e.profile_id=p.id JOIN public.role_embeddings r ON r.role_id=p_role AND r.model=e.model AND r.version=e.version\n WHERE p.is_member AND p.onboarding_complete AND p.id<>public.verified_user() AND NOT EXISTS(SELECT 1 FROM public.project_members m WHERE m.project_id=pid AND m.user_id=p.id)\n ORDER BY e.embedding <=> r.embedding,p.id LIMIT greatest(1,least(p_limit,100))) q;\n RETURN result;\nEND $function$\n"
    },
    {
      "signature": "save_project(uuid,jsonb,jsonb,integer)",
      "definition": "CREATE OR REPLACE FUNCTION public.save_project(actor uuid, body jsonb, vec jsonb, expected_revision integer)\n RETURNS uuid\n LANGUAGE plpgsql\n SECURITY DEFINER\n SET search_path TO 'pg_catalog', 'public', 'pg_temp'\nAS $function$\r\nDECLARE pid uuid=(body->>'id')::uuid; r jsonb; s jsonb; rid uuid; current_revision int; owner uuid; rv jsonb;\r\nBEGIN\r\n PERFORM public.check_actor(actor);\r\n IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_team_lead AND onboarding_complete) THEN RAISE EXCEPTION 'Enable team lead in your profile first';END IF;\r\n PERFORM pg_advisory_xact_lock(hashtextextended(pid::text,0));SELECT revision,owner_id INTO current_revision,owner FROM public.projects WHERE id=pid FOR UPDATE;\r\n IF owner IS NOT NULL AND owner<>actor THEN RAISE EXCEPTION 'Forbidden';END IF;\r\n IF coalesce(current_revision,0)<>expected_revision THEN RAISE EXCEPTION 'Project changed. Reload and retry.';END IF;\r\n IF (SELECT count(*) FROM public.project_members WHERE project_id=pid)>(body->>'team_size')::int-1 THEN RAISE EXCEPTION 'Team size is smaller than the existing team';END IF;\r\n INSERT INTO public.projects(id,owner_id,title,description,category,tags,commitment,duration,team_size,status) VALUES(pid,actor,body->>'title',body->>'description',body->>'category',ARRAY(SELECT jsonb_array_elements_text(body->'tags')),body->>'commitment',body->>'duration',(body->>'team_size')::int,body->>'status')\r\n ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,tags=excluded.tags,commitment=excluded.commitment,duration=excluded.duration,team_size=excluded.team_size,status=excluded.status,revision=projects.revision+1,updated_at=now();\r\n -- Removing a role with application/invitation history is rejected by its foreign key.\r\n DELETE FROM public.project_roles WHERE project_id=pid AND id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(body->'roles') x);\r\n FOR r IN SELECT * FROM jsonb_array_elements(body->'roles') LOOP\r\n rid=(r->>'id')::uuid;\r\n IF EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id<>pid) THEN RAISE EXCEPTION 'Role belongs to a different project';END IF;\r\n INSERT INTO public.project_roles(id,project_id,title,description,slots) VALUES(rid,pid,r->>'title',r->>'description',(r->>'slots')::int) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,slots=excluded.slots;\r\n UPDATE public.project_roles SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'domains',body->'domains','[]'))) WHERE id=rid; DELETE FROM public.project_role_skills WHERE role_id=rid;\r\n FOR s IN SELECT * FROM jsonb_array_elements(r->'skills') LOOP INSERT INTO public.project_role_skills VALUES(rid,(s->>'id')::uuid,s->>'importance');END LOOP;\r\n rv=r->'vector';IF rv IS NOT NULL AND rv<>'null'::jsonb THEN INSERT INTO public.role_embeddings(role_id,embedding,source_hash,model,version,updated_at,trace) VALUES(rid,(rv->>'embedding')::vector,rv->>'source_hash',rv->>'model',rv->>'version',now(),rv->'trace') ON CONFLICT(role_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now(),trace=excluded.trace;END IF;\r\n END LOOP;\r\n IF vec IS NOT NULL THEN INSERT INTO public.project_embeddings(project_id,embedding,source_hash,model,version,updated_at,trace) VALUES(pid,(vec->>'embedding')::vector,vec->>'source_hash',vec->>'model',vec->>'version',now(),vec->'trace') ON CONFLICT(project_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now(),trace=excluded.trace;END IF;\r\n UPDATE public.projects SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(body->'domains','[]'))) WHERE id=pid; RETURN pid;\r\nEND $function$\n"
    }
  ],
  "rowCount": 4,
  "fields": [
    {
      "name": "signature",
      "dataTypeID": 25
    },
    {
      "name": "definition",
      "dataTypeID": 25
    }
  ]
}
```

## Materialized views

```sql
SELECT schemaname,matviewname FROM pg_matviews WHERE definition ILIKE '%project_members%';
```

Exit code 0; returned rows: `[]`; rowCount: `0`.
