# Collaboration migration review — applied record

The user resumed the plan after reviewing the safety net and dependency gate. All three files below are applied to the linked backend, one runner-managed transaction per file, and are now immutable. The first two retain their reviewed hashes. The third is a forward correction discovered by real API testing, not an edit to either applied migration. The [execution record](collaboration-execution-plan.md) explains the complete-file CLI request, same-client transaction, advisory lock and rollback behavior. InsForge rejects in-file BEGIN/COMMIT; its runner supplies them. Atomicity is per file.

## Existing rows and security

The safety net contains 12 full table exports plus existing function definitions, policies, constraints and indexes, with live count/hash verification. It remains ignored under backups/pre-collab-2026-11-17/. After tests and cleanup, all 15 original membership project/user/role/join tuples remain active, all 128 original embedding records are byte-for-byte equivalent as parsed JSON, and all 34 applications and 10 invitations are unchanged. The old membership table had no surrogate id; the migration supplies new UUID ids. Profiles acquire empty links and Private visibility. New collaboration tables start empty. No migration invokes re-embedding, reseeding or user-data deletion.

These migrations are forward-only and locally reapplication-tested, but are not zero-DROP/additive-only: they replace constraints, policies, triggers and function bodies. No business rows are deleted by applying their definitions. Existing project statuses remain valid. Active-only membership uniqueness and capacity checks run under the project lock. Intentional history reads do not grant active access. The policy and membership-dependency guards abort the whole file on unexpected catalog shapes.

Eighteen server-only functions have explicit REVOKE ALL FROM PUBLIC, anon, authenticated and GRANT EXECUTE TO project_admin. All 26 ACL signatures exist live. Four restrictive read policies replace the broad predicates; three reuse old policy names. The full catalog, effective ACLs, index definitions and integrity output are in [post-apply JSON](collaboration-post-apply.json).

Profile vectors/traces remain owner-only. Email is held in managed Auth, whose table SELECT is denied to client roles; public profiles have no email column. Safe public projections expose neither emails, vectors, traces nor storage keys. Public profiles are signed-in only; Private profiles allow their owner, active shared-project contacts and application/invitation contacts, including historical relationships.

## Find Talent and lifecycle

Only the role's project owner can request talent. Candidates need Member intent, completed onboarding, a compatible stored vector, no active membership in that project, and full-profile visibility to the lead. Existing unrelated private profiles are excluded; they become eligible by opting into Public or establishing a permitted relationship. Eligible candidates are cosine-ordered in this lead-only tool; normal API responses retain percentage/skill projections and never expose raw vectors or raw cosine. Reads do not generate embeddings. There is no score threshold.

Closed/In progress preserve pending participation and block new recruitment. Only Completed/Cancelled/Archived reject pending applications and cancel pending invitations. Existing approve/accept remains Open-only. Completed/Cancelled may only become Archived. Membership history is preserved; leaving/reassignment/ownership consent are transactional.

## Corrective migration and actual verification

Real API testing exposed a task revision error using SQLSTATE 40001, which the gateway treated as retryable and timed out. The third migration uses PT409 and rejects a nonzero-revision update when the task no longer exists; this prevents stale edits recreating deleted tasks. The API maps the conflict before a generic gateway status. The first run also hit a cleanup notification FK error; exact-ID recovery succeeded. A second run used an old local build and returned 400 instead of 409. The final rebuilt run passed all 16 API check groups.

Final verification: 72 Vitest checks (14 files), 24 real-endpoint browser tests, 22 filter checks, typecheck and production build passed. All 19 fresh test accounts and four remote projects were removed and verified absent. The first failed cleanup did not persist every already-deleted child ID; all top-level IDs were retained and later cleanup records child IDs before deletion. No deployment, global re-embedding or user reseeding occurred. See [the full report](collaboration-final-report.md) for every failure and evidence link.

## Full SQL: 20261118010000_collaboration-foundation.sql

SHA-256: `8039fd15e9f441ee5ab0c6d22cf76212bedb5073f8513982bf30f007ddfd485e`

```sql
-- InsForge's migration runner supplies one transaction on one checked-out client.
-- Do not add BEGIN/COMMIT here: the runner rejects in-file transaction control.

-- Forward-only collaboration metadata. No embedding inputs or snapshots are rewritten.
-- Drop targets below match the live catalog audit performed on 17 November 2026.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS links jsonb NOT NULL DEFAULT '{"github":"","linkedin":"","website":"","custom":[]}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK(visibility IN('private','public'));
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_status_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_status_check CHECK(status IN('open','closed','in_progress','completed','cancelled','archived'));
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS left_at timestamptz;
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS left_reason text NOT NULL DEFAULT '';
ALTER TABLE public.project_members ADD COLUMN IF NOT EXISTS removed_by uuid REFERENCES public.profiles(id);
ALTER TABLE public.project_members DROP CONSTRAINT IF EXISTS project_members_pkey;
ALTER TABLE public.project_members ADD CONSTRAINT project_members_pkey PRIMARY KEY(id);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_membership ON public.project_members(project_id,user_id) WHERE left_at IS NULL;
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_applicant_id_project_id_role_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_application ON public.applications(applicant_id,project_id,coalesce(role_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE status='pending';

CREATE OR REPLACE FUNCTION public.team_access(pid uuid,uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT uid IS NOT NULL AND (EXISTS(SELECT 1 FROM public.projects WHERE id=pid AND owner_id=uid) OR EXISTS(SELECT 1 FROM public.project_members WHERE project_id=pid AND user_id=uid AND left_at IS NULL));
$$;
CREATE OR REPLACE FUNCTION public.can_view_profile(target uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT public.verified_user() IS NOT NULL AND (target=public.verified_user() OR EXISTS(SELECT 1 FROM public.profiles WHERE id=target AND visibility='public')
 OR EXISTS(SELECT 1 FROM public.projects p WHERE public.team_access(p.id,target) AND public.team_access(p.id,public.verified_user()))
 OR EXISTS(SELECT 1 FROM public.applications a JOIN public.projects p ON p.id=a.project_id WHERE (a.applicant_id=target AND p.owner_id=public.verified_user()) OR (a.applicant_id=public.verified_user() AND p.owner_id=target))
 OR EXISTS(SELECT 1 FROM public.invitations i WHERE (i.invitee_id=target AND i.inviter_id=public.verified_user()) OR (i.invitee_id=public.verified_user() AND i.inviter_id=target)));
$$;
DROP POLICY IF EXISTS profile_read ON public.profiles;
CREATE POLICY profile_read ON public.profiles FOR SELECT TO authenticated USING(public.can_view_profile(id));
DROP POLICY IF EXISTS profile_skills_read ON public.profile_skills;
CREATE POLICY profile_skills_read ON public.profile_skills FOR SELECT TO authenticated USING(public.can_view_profile(profile_id));
DROP POLICY IF EXISTS team_read ON public.project_members;
CREATE POLICY team_read ON public.project_members FOR SELECT TO authenticated USING(public.team_access(project_id,public.verified_user()) OR user_id=public.verified_user());
-- Commit all profile-visibility boundaries together, including the domain join.
DROP POLICY IF EXISTS signed_in_read ON public.profile_domains;
DROP POLICY IF EXISTS profile_domain_read ON public.profile_domains;
CREATE POLICY profile_domain_read ON public.profile_domains FOR SELECT TO authenticated USING(public.can_view_profile(profile_id));
-- Unknown permissive policies combine with OR and could undo the new boundary.
-- Fail closed and roll back this entire migration rather than silently keep one.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public'
 AND tablename IN('profiles','profile_skills','profile_domains','project_members')
 AND (policyname<>CASE tablename WHEN 'profiles' THEN 'profile_read' WHEN 'profile_skills' THEN 'profile_skills_read' WHEN 'profile_domains' THEN 'profile_domain_read' ELSE 'team_read' END
 OR cmd<>'SELECT' OR roles::text[]<>ARRAY['authenticated'])) THEN
 RAISE EXCEPTION 'Unexpected profile or membership policy remains; migration aborted';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipient_id uuid NOT NULL REFERENCES public.profiles(id),type text NOT NULL,title text NOT NULL,body text NOT NULL DEFAULT '',link text NOT NULL CHECK(link LIKE '/%' AND link NOT LIKE '//%'),actor_id uuid REFERENCES public.profiles(id),project_id uuid REFERENCES public.projects(id),event_key text UNIQUE,read_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS notifications_recipient_time ON public.notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS notifications_unread ON public.notifications(recipient_id) WHERE read_at IS NULL;
CREATE TABLE IF NOT EXISTS public.project_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects(id),author_id uuid NOT NULL REFERENCES public.profiles(id),body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 2000),created_at timestamptz NOT NULL DEFAULT now(),edited_at timestamptz,deleted_at timestamptz);
ALTER TABLE public.project_messages ADD COLUMN IF NOT EXISTS change_seq bigint GENERATED BY DEFAULT AS IDENTITY;
CREATE OR REPLACE FUNCTION public.message_change_sequence() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN NEW.change_seq=nextval(pg_get_serial_sequence('public.project_messages','change_seq'));RETURN NEW;END $$;
DROP TRIGGER IF EXISTS message_change_sequence ON public.project_messages;
CREATE TRIGGER message_change_sequence BEFORE UPDATE ON public.project_messages FOR EACH ROW EXECUTE FUNCTION public.message_change_sequence();
REVOKE ALL ON FUNCTION public.message_change_sequence() FROM PUBLIC,anon,authenticated;
CREATE INDEX IF NOT EXISTS messages_project_sequence ON public.project_messages(project_id,change_seq);
CREATE INDEX IF NOT EXISTS messages_project_time ON public.project_messages(project_id,created_at DESC,id DESC);
CREATE TABLE IF NOT EXISTS public.workspace_read_state(project_id uuid REFERENCES public.projects(id),user_id uuid REFERENCES public.profiles(id),last_read_message_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_id,user_id));
CREATE TABLE IF NOT EXISTS public.project_tasks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects(id),title text NOT NULL CHECK(length(btrim(title)) BETWEEN 1 AND 120),description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),status text NOT NULL DEFAULT 'todo' CHECK(status IN('todo','in_progress','in_review','done')),priority text NOT NULL DEFAULT 'medium' CHECK(priority IN('low','medium','high')),assignee_id uuid REFERENCES public.profiles(id),created_by uuid NOT NULL REFERENCES public.profiles(id),due_date date,position double precision NOT NULL DEFAULT 1024,revision integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz);
CREATE INDEX IF NOT EXISTS tasks_project_order ON public.project_tasks(project_id,status,position,id);
CREATE TABLE IF NOT EXISTS public.ownership_transfers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects(id),from_id uuid NOT NULL REFERENCES public.profiles(id),to_id uuid NOT NULL REFERENCES public.profiles(id),status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','accepted','declined','cancelled')),created_at timestamptz NOT NULL DEFAULT now(),decided_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_transfer ON public.ownership_transfers(project_id) WHERE status='pending';
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['notifications','project_messages','workspace_read_state','project_tasks','ownership_transfers'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',t);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
 END LOOP;END $$;
DROP POLICY IF EXISTS recipient_read ON public.notifications;
CREATE POLICY recipient_read ON public.notifications FOR SELECT TO authenticated USING(recipient_id=public.verified_user());
DROP POLICY IF EXISTS recipient_update ON public.notifications;
CREATE POLICY recipient_update ON public.notifications FOR UPDATE TO authenticated USING(recipient_id=public.verified_user()) WITH CHECK(recipient_id=public.verified_user());
GRANT UPDATE(read_at) ON public.notifications TO authenticated;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['project_messages','project_tasks','workspace_read_state'] LOOP
 EXECUTE format('DROP POLICY IF EXISTS team_read ON public.%I',t);
 EXECUTE format('CREATE POLICY team_read ON public.%I FOR SELECT TO authenticated USING(public.team_access(project_id,public.verified_user()))',t);
 END LOOP; END $$;
DROP POLICY IF EXISTS transfer_read ON public.ownership_transfers;
CREATE POLICY transfer_read ON public.ownership_transfers FOR SELECT TO authenticated USING(from_id=public.verified_user() OR to_id=public.verified_user());

CREATE OR REPLACE FUNCTION public.notify_user(recipient uuid,actor uuid,pid uuid,event text,heading text,content text,destination text,dedupe text DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF recipient IS NULL OR recipient=actor THEN RETURN; END IF;
 INSERT INTO public.notifications(recipient_id,actor_id,project_id,type,title,body,link,event_key) VALUES(recipient,actor,pid,event,heading,content,destination,dedupe) ON CONFLICT(event_key) DO NOTHING;
END $$;


CREATE OR REPLACE FUNCTION public.participation_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE lead uuid; actor uuid; recipient uuid; destination text; BEGIN
 IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW.created_at=OLD.created_at THEN RETURN NEW; END IF;
 SELECT owner_id INTO lead FROM public.projects WHERE id=NEW.project_id;
 IF TG_TABLE_NAME='applications' THEN
 actor=CASE WHEN NEW.status IN('pending','withdrawn') THEN NEW.applicant_id ELSE coalesce(nullif(NEW.decided_by,'system')::uuid,lead) END;
 recipient=CASE WHEN NEW.status IN('pending','withdrawn') THEN lead ELSE NEW.applicant_id END;
 destination=CASE WHEN recipient=lead THEN '/projects/'||NEW.project_id ELSE '/applications' END;
 ELSE
 actor=CASE WHEN NEW.status IN('accepted','declined') THEN NEW.invitee_id ELSE lead END;
 recipient=CASE WHEN NEW.status IN('accepted','declined') THEN lead ELSE NEW.invitee_id END;
 destination=CASE WHEN recipient=lead THEN '/projects/'||NEW.project_id||'/workspace' ELSE '/invitations' END;
 END IF;
 PERFORM public.notify_user(recipient,actor,NEW.project_id,TG_TABLE_NAME||'.'||NEW.status,CASE WHEN TG_TABLE_NAME='applications' THEN 'Application ' ELSE 'Invitation ' END||NEW.status,'Open to see the details.',destination,NEW.id||':'||NEW.status||':'||NEW.created_at::text);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS application_notification ON public.applications;
CREATE TRIGGER application_notification AFTER INSERT OR UPDATE ON public.applications FOR EACH ROW EXECUTE FUNCTION public.participation_notification();
DROP TRIGGER IF EXISTS invitation_notification ON public.invitations;
CREATE TRIGGER invitation_notification AFTER INSERT OR UPDATE ON public.invitations FOR EACH ROW EXECUTE FUNCTION public.participation_notification();

-- Canonical state map is mirrored from src/lib/collaboration.ts; parity is unit-tested.
CREATE OR REPLACE FUNCTION public.lifecycle_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE allowed jsonb='{"open":["closed","in_progress","completed","cancelled"],"closed":["open","in_progress","completed","cancelled"],"in_progress":["open","closed","completed","cancelled"],"completed":["archived"],"cancelled":["archived"],"archived":[]}'; member uuid; BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NOT (allowed->OLD.status ? NEW.status) THEN RAISE EXCEPTION 'Invalid project status transition'; END IF;
 IF NEW.status IN('completed','cancelled','archived') THEN
 UPDATE public.applications SET status='rejected',decided_by=NEW.owner_id::text,decided_at=now() WHERE project_id=NEW.id AND status='pending';
 UPDATE public.invitations SET status='cancelled',decided_by=NEW.owner_id::text,decided_at=now() WHERE project_id=NEW.id AND status='pending';
 END IF;
 FOR member IN SELECT user_id FROM public.project_members WHERE project_id=NEW.id AND left_at IS NULL LOOP
 PERFORM public.notify_user(member,NEW.owner_id,NEW.id,'project.status','Project is '||replace(NEW.status,'_',' '),NEW.title,'/projects/'||NEW.id||'/workspace'); END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS lifecycle_guard ON public.projects;
CREATE TRIGGER lifecycle_guard BEFORE UPDATE OF status ON public.projects FOR EACH ROW EXECUTE FUNCTION public.lifecycle_guard();

CREATE OR REPLACE FUNCTION public.has_capacity(pid uuid,rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT (SELECT count(*) FROM public.project_members WHERE project_id=pid AND left_at IS NULL)<(SELECT team_size-1 FROM public.projects WHERE id=pid) AND (rid IS NULL OR EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id=pid AND filled_count<slots));
$$;
CREATE OR REPLACE FUNCTION public.add_member(pid uuid,uid uuid,rid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 PERFORM 1 FROM public.projects WHERE id=pid FOR UPDATE;
 IF public.team_access(pid,uid) THEN RAISE EXCEPTION 'Already on this team'; END IF;
 IF NOT public.has_capacity(pid,rid) THEN RAISE EXCEPTION 'This team or role is full';END IF;
 INSERT INTO public.project_members(project_id,user_id,role_id) VALUES(pid,uid,rid);
 IF rid IS NOT NULL THEN UPDATE public.project_roles SET filled_count=filled_count+1 WHERE id=rid;END IF;
END $$;

CREATE OR REPLACE FUNCTION public.collaboration_action(actor uuid,pid uuid,p_action jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; m public.project_members; t public.project_tasks; msg public.project_messages; transfer public.ownership_transfers; a text=p_action->>'action'; uid uuid; rid uuid; tid uuid; body jsonb; previous uuid; previous_name text; item record; before_pos float; prev_pos float; pos float; task_count int; result jsonb='{}'; BEGIN
 PERFORM public.check_actor(actor); SELECT * INTO p FROM public.projects WHERE id=pid FOR UPDATE;
 IF p.id IS NULL OR NOT public.team_access(pid,actor) THEN RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501'; END IF;
 IF a='read_chat' THEN INSERT INTO public.workspace_read_state(project_id,user_id,last_read_message_at) VALUES(pid,actor,now()) ON CONFLICT(project_id,user_id) DO UPDATE SET last_read_message_at=excluded.last_read_message_at; RETURN '{}'; END IF;
 IF p.status IN('completed','cancelled','archived') AND a NOT IN('status','leave','remove','transfer_reply') THEN RAISE EXCEPTION 'This workspace is read-only'; END IF;
 IF a='status' THEN
 IF p.owner_id<>actor THEN RAISE EXCEPTION 'Only the lead can change status'; END IF;
 UPDATE public.projects SET status=p_action->>'status',revision=revision+1 WHERE id=pid;
 ELSIF a IN('leave','remove') THEN
 uid=CASE WHEN a='leave' THEN actor ELSE (p_action->>'user_id')::uuid END;
 IF uid=p.owner_id THEN RAISE EXCEPTION 'Transfer leadership before leaving'; END IF;
 IF a='remove' AND actor<>p.owner_id THEN RAISE EXCEPTION 'Only the lead can remove members'; END IF;
 SELECT * INTO m FROM public.project_members WHERE project_id=pid AND user_id=uid AND left_at IS NULL FOR UPDATE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Member is not active'; END IF;
 UPDATE public.project_members SET left_at=now(),left_reason=coalesce(p_action->>'note',''),removed_by=CASE WHEN a='remove' THEN actor END WHERE id=m.id;
 IF m.role_id IS NOT NULL THEN UPDATE public.project_roles SET filled_count=filled_count-1 WHERE id=m.role_id; END IF;
 SELECT jsonb_build_object('unassigned_tasks',coalesce(jsonb_agg(title),'[]')) INTO result FROM public.project_tasks WHERE project_id=pid AND assignee_id=uid;
 FOR item IN SELECT id,title FROM public.project_tasks WHERE project_id=pid AND assignee_id=uid LOOP
 UPDATE public.project_tasks SET assignee_id=NULL,revision=revision+1,updated_at=now() WHERE id=item.id;
 PERFORM public.notify_user(uid,actor,pid,'task.unassigned','Task unassigned',item.title,'/projects/'||pid||'/workspace?tab=tasks');
 PERFORM public.notify_user(p.owner_id,actor,pid,'task.unassigned','Task needs an assignee',item.title,'/projects/'||pid||'/workspace?tab=tasks'); END LOOP;
 UPDATE public.ownership_transfers SET status='cancelled',decided_at=now() WHERE project_id=pid AND to_id=uid AND status='pending';
 PERFORM public.notify_user(CASE WHEN a='leave' THEN p.owner_id ELSE uid END,actor,pid,'member.'||a,CASE WHEN a='leave' THEN 'A member left your team' ELSE 'You were removed from the team' END,coalesce(p_action->>'note',''),'/projects/'||pid);
 ELSIF a='reassign' THEN
 IF p.owner_id<>actor THEN RAISE EXCEPTION 'Only the lead can reassign roles'; END IF;
 uid=(p_action->>'user_id')::uuid;rid=(p_action->>'role_id')::uuid;
 SELECT * INTO m FROM public.project_members WHERE project_id=pid AND user_id=uid AND left_at IS NULL FOR UPDATE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Member is not active'; END IF;
 IF m.role_id IS NOT DISTINCT FROM rid THEN RETURN '{}'; END IF;
 IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id=pid AND filled_count<slots) THEN RAISE EXCEPTION 'This role is full or invalid'; END IF;
 UPDATE public.project_members SET role_id=rid WHERE id=m.id;
 UPDATE public.project_roles SET filled_count=filled_count-1 WHERE id=m.role_id;
 UPDATE public.project_roles SET filled_count=filled_count+1 WHERE id=rid;
 PERFORM public.notify_user(uid,actor,pid,'member.role','Your role changed',p.title,'/projects/'||pid||'/workspace');
 ELSIF a='transfer' THEN
 uid=(p_action->>'user_id')::uuid;
 IF actor<>p.owner_id OR uid=actor OR NOT public.team_access(pid,uid) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND is_team_lead) THEN RAISE EXCEPTION 'Choose an active member with Lead intent enabled'; END IF;
 INSERT INTO public.ownership_transfers(project_id,from_id,to_id) VALUES(pid,actor,uid) RETURNING id INTO tid;
 PERFORM public.notify_user(uid,actor,pid,'ownership.request','Leadership transfer request',p.title,'/projects/'||pid||'/workspace','transfer:'||tid);result=jsonb_build_object('id',tid);
 ELSIF a='transfer_reply' THEN
 SELECT * INTO transfer FROM public.ownership_transfers WHERE id=(p_action->>'id')::uuid AND project_id=pid FOR UPDATE;
 IF transfer.id IS NULL OR transfer.status<>'pending' OR transfer.to_id<>actor OR transfer.from_id<>p.owner_id THEN RAISE EXCEPTION 'Transfer request is no longer valid'; END IF;
 IF (p_action->>'accept')::boolean THEN
 IF p.status IN('completed','cancelled','archived') THEN RAISE EXCEPTION 'This workspace is read-only';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_team_lead) THEN RAISE EXCEPTION 'Enable Lead intent before accepting'; END IF;
 SELECT * INTO m FROM public.project_members WHERE project_id=pid AND user_id=actor AND left_at IS NULL FOR UPDATE;
 UPDATE public.project_members SET left_at=now(),left_reason='Became team lead' WHERE id=m.id;
 UPDATE public.project_roles SET filled_count=filled_count-1 WHERE id=m.role_id;
 INSERT INTO public.project_members(project_id,user_id,role_id) VALUES(pid,p.owner_id,NULL);
 UPDATE public.projects SET owner_id=actor,revision=revision+1 WHERE id=pid;
 UPDATE public.ownership_transfers SET status='accepted',decided_at=now() WHERE id=transfer.id;
 FOR item IN SELECT user_id FROM public.project_members WHERE project_id=pid AND left_at IS NULL LOOP PERFORM public.notify_user(item.user_id,actor,pid,'ownership.transferred','Project leadership transferred',p.title,'/projects/'||pid||'/workspace','ownership:'||transfer.id||':'||item.user_id);END LOOP;
 ELSE UPDATE public.ownership_transfers SET status='declined',decided_at=now() WHERE id=transfer.id;
 PERFORM public.notify_user(p.owner_id,actor,pid,'ownership.declined','Leadership request declined',p.title,'/projects/'||pid||'/workspace','declined:'||transfer.id); END IF;
 ELSIF a='message' THEN
 IF length(btrim(p_action->>'body')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Message must contain 1–2000 characters'; END IF;
 tid=(p_action->>'id')::uuid;SELECT * INTO msg FROM public.project_messages WHERE id=tid;
 IF msg.id IS NOT NULL THEN IF msg.project_id<>pid OR msg.author_id<>actor OR msg.body<>btrim(p_action->>'body') THEN RAISE EXCEPTION 'Message id conflict';END IF;
 ELSE INSERT INTO public.project_messages(id,project_id,author_id,body) VALUES(tid,pid,actor,btrim(p_action->>'body'));END IF;result=jsonb_build_object('id',tid);
 ELSIF a IN('edit_message','delete_message') THEN
 SELECT * INTO msg FROM public.project_messages WHERE id=(p_action->>'id')::uuid AND project_id=pid FOR UPDATE;
 IF msg.id IS NULL OR (msg.author_id<>actor AND NOT(a='delete_message' AND p.owner_id=actor)) THEN RAISE EXCEPTION 'Message permission denied'; END IF;
 IF msg.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message was removed'; END IF;
 IF a='delete_message' THEN UPDATE public.project_messages SET deleted_at=now(),body='Message removed' WHERE id=msg.id;
 ELSE IF length(btrim(p_action->>'body')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid message';END IF; UPDATE public.project_messages SET body=btrim(p_action->>'body'),edited_at=now() WHERE id=msg.id; END IF;
 ELSIF a IN('task','delete_task') THEN
 body=p_action->'task';tid=CASE WHEN a='delete_task' THEN (p_action->>'id')::uuid ELSE coalesce((body->>'id')::uuid,gen_random_uuid()) END;
 SELECT * INTO t FROM public.project_tasks WHERE id=tid AND project_id=pid FOR UPDATE;
 IF t.id IS NOT NULL THEN
 IF t.revision<>(CASE WHEN a='delete_task' THEN (p_action->>'revision')::int ELSE (body->>'revision')::int END) THEN RAISE EXCEPTION 'Task changed. Refresh and try again.' USING ERRCODE='40001'; END IF;
 IF a='delete_task' THEN
 IF actor<>p.owner_id AND actor<>t.created_by THEN RAISE EXCEPTION 'You can only delete tasks you created'; END IF;
 PERFORM public.notify_user(t.assignee_id,actor,pid,'task.removed','Assigned task removed',t.title,'/projects/'||pid||'/workspace?tab=tasks');DELETE FROM public.project_tasks WHERE id=tid;RETURN '{}';
 END IF;
 IF actor<>p.owner_id AND t.assignee_id IS NOT NULL AND t.assignee_id<>actor THEN RAISE EXCEPTION 'You can only edit your tasks or unassigned tasks'; END IF;
 IF actor<>p.owner_id AND (body->>'assignee_id')::uuid IS DISTINCT FROM t.assignee_id AND (body->>'assignee_id')::uuid IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the lead can assign another member'; END IF;
 ELSE
 IF a='delete_task' THEN RAISE EXCEPTION 'Task not found'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_tasks WHERE id=tid) THEN RAISE EXCEPTION 'Task id conflict';END IF;
 SELECT count(*) INTO task_count FROM public.project_tasks WHERE project_id=pid AND status<>'done';
 IF task_count>=200 AND body->>'status'<>'done' THEN RAISE EXCEPTION 'This project has 200 active tasks'; END IF;
 IF actor<>p.owner_id AND (body->>'assignee_id')::uuid IS NOT NULL AND (body->>'assignee_id')::uuid<>actor THEN RAISE EXCEPTION 'Only the lead can assign another member'; END IF;
 END IF;
 uid=(body->>'assignee_id')::uuid;
 IF uid IS NOT NULL AND NOT public.team_access(pid,uid) THEN RAISE EXCEPTION 'Assignee must be a current team member'; END IF;
 IF t.status='done' AND body->>'status'<>'done' AND (SELECT count(*) FROM public.project_tasks WHERE project_id=pid AND status<>'done')>=200 THEN RAISE EXCEPTION 'This project has 200 active tasks';END IF;
 IF body ? 'before_id' OR t.id IS NULL OR body->>'status'<>t.status THEN
 IF body->>'before_id' IS NOT NULL THEN
 SELECT position INTO before_pos FROM public.project_tasks WHERE id=(body->>'before_id')::uuid AND project_id=pid AND status=body->>'status' AND id<>tid;
 IF before_pos IS NULL THEN RAISE EXCEPTION 'Board changed. Refresh and try again.';END IF;
 SELECT max(position) INTO prev_pos FROM public.project_tasks WHERE project_id=pid AND status=body->>'status' AND position<before_pos AND id<>tid;
 pos=CASE WHEN prev_pos IS NULL THEN before_pos-1024 ELSE (prev_pos+before_pos)/2 END;
 ELSE SELECT coalesce(max(position),0)+1024 INTO pos FROM public.project_tasks WHERE project_id=pid AND status=body->>'status';END IF;
 ELSE pos=t.position;END IF;
 INSERT INTO public.project_tasks(id,project_id,title,description,status,priority,assignee_id,created_by,due_date,position,completed_at)
 VALUES(tid,pid,body->>'title',coalesce(body->>'description',''),body->>'status',body->>'priority',uid,actor,(body->>'due_date')::date,pos,CASE WHEN body->>'status'='done' THEN now() END)
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,status=excluded.status,priority=excluded.priority,assignee_id=excluded.assignee_id,due_date=excluded.due_date,position=excluded.position,revision=public.project_tasks.revision+1,updated_at=now(),completed_at=CASE WHEN excluded.status='done' THEN coalesce(public.project_tasks.completed_at,now()) END;
 IF t.assignee_id IS DISTINCT FROM uid THEN
 PERFORM public.notify_user(t.assignee_id,actor,pid,'task.unassigned','Task reassigned',body->>'title','/projects/'||pid||'/workspace?tab=tasks&task='||tid);
 PERFORM public.notify_user(uid,actor,pid,'task.assigned','Task assigned to you',body->>'title','/projects/'||pid||'/workspace?tab=tasks&task='||tid);END IF;
 WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY status ORDER BY position,id)*1024 AS new_position FROM public.project_tasks WHERE project_id=pid) UPDATE public.project_tasks ordered_task SET position=r.new_position FROM ranked r WHERE ordered_task.id=r.id;
 result=jsonb_build_object('id',tid);
 ELSE RAISE EXCEPTION 'Unknown workspace action';END IF;
 RETURN result;
END $$;
-- Function ACLs are explicitly set after all definitions below.

CREATE OR REPLACE FUNCTION public.submit_match(actor uuid,pid uuid,rid uuid,kind text,target uuid DEFAULT NULL,note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; uid uuid; b jsonb; st text; result_id uuid; prior text;
BEGIN
 PERFORM public.check_actor(actor);SELECT * INTO p FROM public.projects WHERE id=pid FOR UPDATE;
 IF p.id IS NULL OR p.status<>'open' THEN RAISE EXCEPTION 'Project is not open';END IF;
 IF kind='apply' THEN uid=actor;IF actor=p.owner_id THEN RAISE EXCEPTION 'You already lead this project';END IF;
 ELSIF kind='invite' THEN uid=target;IF p.owner_id<>actor OR target=actor THEN RAISE EXCEPTION 'Forbidden';END IF;
 ELSE RAISE EXCEPTION 'Unknown action';END IF;
 IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id=pid) THEN RAISE EXCEPTION 'Invalid role';END IF;
 INSERT INTO public.profiles(id,display_name) VALUES(uid,'New member') ON CONFLICT(id) DO NOTHING;
 IF public.team_access(pid,uid) THEN RAISE EXCEPTION 'Already on this team';END IF;
 b=public.match_breakdown(uid,pid,rid);
 IF kind='apply' THEN
 SELECT status INTO prior FROM public.applications WHERE applicant_id=uid AND project_id=pid AND role_id IS NOT DISTINCT FROM rid;
 IF EXISTS(SELECT 1 FROM public.applications WHERE applicant_id=uid AND project_id=pid AND role_id IS NOT DISTINCT FROM rid AND (status='pending' OR NOT EXISTS(SELECT 1 FROM public.project_members WHERE project_id=pid AND user_id=uid AND left_at IS NOT NULL))) THEN RAISE EXCEPTION 'Application already exists';END IF;
 st='pending';
 INSERT INTO public.applications(project_id,role_id,applicant_id,message,cosine,breakdown,status,decided_by,decided_at) VALUES(pid,rid,uid,note,(b->>'cosine')::float,b,st,'system',NULL) RETURNING id INTO result_id;

 ELSE
 SELECT status INTO prior FROM public.invitations WHERE invitee_id=uid AND project_id=pid AND role_id IS NOT DISTINCT FROM rid;
 IF prior IN('pending','accepted') THEN RAISE EXCEPTION 'Invitation already exists';END IF;
 st='pending';INSERT INTO public.invitations(project_id,role_id,inviter_id,invitee_id,message,cosine,breakdown,status,decided_by) VALUES(pid,rid,actor,uid,note,(b->>'cosine')::float,b,st,actor::text)
 ON CONFLICT(invitee_id,project_id,role_id) DO UPDATE SET message=excluded.message,cosine=excluded.cosine,breakdown=excluded.breakdown,status='pending',decided_by=actor::text,decided_at=NULL,created_at=now() RETURNING id INTO result_id;
 END IF;
 RETURN jsonb_build_object('id',result_id,'status',st,'breakdown',b);
END $$;

CREATE OR REPLACE FUNCTION public.save_project(actor uuid,body jsonb,vec jsonb,expected_revision int) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE pid uuid=(body->>'id')::uuid; r jsonb; s jsonb; rid uuid; current_revision int; owner uuid; rv jsonb;
BEGIN
 PERFORM public.check_actor(actor);
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_team_lead AND onboarding_complete) THEN RAISE EXCEPTION 'Enable team lead in your profile first';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(pid::text,0));SELECT revision,owner_id INTO current_revision,owner FROM public.projects WHERE id=pid FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.projects WHERE id=pid AND status IN('completed','cancelled','archived')) THEN RAISE EXCEPTION 'This project is read-only';END IF;
 IF owner IS NULL AND body->>'status'<>'open' THEN RAISE EXCEPTION 'New projects must start open';END IF;
 IF owner IS NOT NULL AND owner<>actor THEN RAISE EXCEPTION 'Forbidden';END IF;
 IF coalesce(current_revision,0)<>expected_revision THEN RAISE EXCEPTION 'Project changed. Reload and retry.';END IF;
 IF (SELECT count(*) FROM public.project_members WHERE project_id=pid AND left_at IS NULL)>(body->>'team_size')::int-1 THEN RAISE EXCEPTION 'Team size is smaller than the existing team';END IF;
 INSERT INTO public.projects(id,owner_id,title,description,category,tags,commitment,duration,team_size,status) VALUES(pid,actor,body->>'title',body->>'description',body->>'category',ARRAY(SELECT jsonb_array_elements_text(body->'tags')),body->>'commitment',body->>'duration',(body->>'team_size')::int,body->>'status')
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,tags=excluded.tags,commitment=excluded.commitment,duration=excluded.duration,team_size=excluded.team_size,status=excluded.status,revision=projects.revision+1,updated_at=now();
 -- Removing a role with application/invitation history is rejected by its foreign key.
 DELETE FROM public.project_roles WHERE project_id=pid AND id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(body->'roles') x);
 FOR r IN SELECT * FROM jsonb_array_elements(body->'roles') LOOP
 rid=(r->>'id')::uuid;
 IF EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id<>pid) THEN RAISE EXCEPTION 'Role belongs to a different project';END IF;
 INSERT INTO public.project_roles(id,project_id,title,description,slots) VALUES(rid,pid,r->>'title',r->>'description',(r->>'slots')::int) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,slots=excluded.slots;
 UPDATE public.project_roles SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'domains',body->'domains','[]'))) WHERE id=rid; DELETE FROM public.project_role_skills WHERE role_id=rid;
 FOR s IN SELECT * FROM jsonb_array_elements(r->'skills') LOOP INSERT INTO public.project_role_skills VALUES(rid,(s->>'id')::uuid,s->>'importance');END LOOP;
 rv=r->'vector';IF rv IS NOT NULL AND rv<>'null'::jsonb THEN INSERT INTO public.role_embeddings(role_id,embedding,source_hash,model,version,updated_at,trace) VALUES(rid,(rv->>'embedding')::vector,rv->>'source_hash',rv->>'model',rv->>'version',now(),rv->'trace') ON CONFLICT(role_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now(),trace=excluded.trace;END IF;
 END LOOP;
 IF vec IS NOT NULL THEN INSERT INTO public.project_embeddings(project_id,embedding,source_hash,model,version,updated_at,trace) VALUES(pid,(vec->>'embedding')::vector,vec->>'source_hash',vec->>'model',vec->>'version',now(),vec->'trace') ON CONFLICT(project_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now(),trace=excluded.trace;END IF;
 UPDATE public.projects SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(body->'domains','[]'))) WHERE id=pid; RETURN pid;
END $$;


CREATE OR REPLACE FUNCTION public.match_candidates_for_role(p_role uuid,p_limit int DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE pid uuid; result jsonb;
BEGIN
 SELECT project_id INTO pid FROM public.project_roles WHERE id=p_role;
 IF NOT public.owns_project(pid) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (
 SELECT p.id,p.display_name,p.headline,p.avatar_url,p.is_demo,public.match_breakdown(p.id,pid,p_role) breakdown
 FROM public.profiles p JOIN public.profile_embeddings e ON e.profile_id=p.id JOIN public.role_embeddings r ON r.role_id=p_role AND r.model=e.model AND r.version=e.version
 WHERE public.can_view_profile(p.id) AND p.is_member AND p.onboarding_complete AND p.id<>public.verified_user() AND NOT EXISTS(SELECT 1 FROM public.project_members m WHERE m.project_id=pid AND m.user_id=p.id AND m.left_at IS NULL)
 ORDER BY e.embedding <=> r.embedding,p.id LIMIT greatest(1,least(p_limit,100))) q;
 RETURN result;
END $$;

-- Dependency gate: the live audit found four legacy routines. All are replaced
-- above. Reject legacy insert/conflict shapes or an unreviewed dependency.
-- History readers are explicitly reviewed exceptions, not active-team checks.
DO $$
DECLARE dependency record; source text; signature text;
BEGIN
 FOR dependency IN
 SELECT p.proname,p.prosrc,p.oid::regprocedure AS signature FROM pg_proc p
 JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prosrc ILIKE '%project_members%'
 LOOP
  IF dependency.proname NOT IN('has_capacity','add_member','save_project','match_candidates_for_role','team_access','submit_match','collaboration_action','lifecycle_guard','workspace_data','profile_projects') THEN
   RAISE EXCEPTION 'Unreviewed project_members function dependency: %',dependency.signature;
  END IF;
  IF dependency.prosrc ~* 'INSERT\s+INTO\s+(public\.)?project_members[^;]*ON\s+CONFLICT\s*\(\s*project_id\s*,\s*user_id\s*\)' THEN
   RAISE EXCEPTION 'Legacy membership conflict target remains: %',dependency.signature;
  END IF;
  IF dependency.prosrc ~* 'INSERT\s+INTO\s+(public\.)?project_members\s+VALUES' THEN
   RAISE EXCEPTION 'Positional membership insert remains: %',dependency.signature;
  END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['public.has_capacity(uuid,uuid)','public.save_project(uuid,jsonb,jsonb,integer)','public.match_candidates_for_role(uuid,integer)','public.team_access(uuid,uuid)','public.lifecycle_guard()'] LOOP
  SELECT prosrc INTO source FROM pg_proc WHERE oid=to_regprocedure(signature);
  IF source IS NULL OR source !~* 'left_at\s+IS\s+NULL' THEN
   RAISE EXCEPTION 'Active-membership filter missing in %',signature;
  END IF;
 END LOOP;
 SELECT prosrc INTO source FROM pg_proc WHERE oid='public.add_member(uuid,uuid,uuid)'::regprocedure;
 IF source !~* 'INSERT\s+INTO\s+public\.project_members\s*\(\s*project_id\s*,\s*user_id\s*,\s*role_id\s*\)' OR source NOT LIKE '%public.team_access(pid,uid)%' THEN
  RAISE EXCEPTION 'add_member must use explicit columns and the active-team helper';
 END IF;
 SELECT prosrc INTO source FROM pg_proc WHERE oid='public.respond_match(uuid,uuid,text,text)'::regprocedure;
 IF source NOT LIKE '%public.add_member(pid,uid,rid)%' THEN
  RAISE EXCEPTION 'respond_match must delegate membership writes to add_member';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_views WHERE definition ILIKE '%project_members%') OR EXISTS(SELECT 1 FROM pg_matviews WHERE definition ILIKE '%project_members%') THEN
  RAISE EXCEPTION 'Unreviewed project_members view dependency';
 END IF;
END $$;

-- Explicit ACLs: do not depend on CREATE OR REPLACE preserving old grants.
-- These routines write data, return private/internal match data, or are triggers.
REVOKE ALL ON FUNCTION public.add_member(uuid,uuid,uuid),public.has_capacity(uuid,uuid),public.check_actor(uuid),public.consume_rate(text,integer,integer),public.submit_match(uuid,uuid,uuid,text,uuid,text),public.respond_match(uuid,uuid,text,text),public.save_profile(uuid,jsonb,jsonb,integer),public.save_project(uuid,jsonb,jsonb,integer),public.match_breakdown(uuid,uuid,uuid),public.notify_user(uuid,uuid,uuid,text,text,text,text,text),public.participation_notification(),public.lifecycle_guard(),public.message_change_sequence(),public.collaboration_action(uuid,uuid,jsonb),public.refresh_project_filter_classification(uuid),public.sync_project_filter_classification(),public.sync_domain_choices(),public.snapshot_application_percentage() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.add_member(uuid,uuid,uuid),public.has_capacity(uuid,uuid),public.check_actor(uuid),public.consume_rate(text,integer,integer),public.submit_match(uuid,uuid,uuid,text,uuid,text),public.respond_match(uuid,uuid,text,text),public.save_profile(uuid,jsonb,jsonb,integer),public.save_project(uuid,jsonb,jsonb,integer),public.match_breakdown(uuid,uuid,uuid),public.notify_user(uuid,uuid,uuid,text,text,text,text,text),public.participation_notification(),public.lifecycle_guard(),public.message_change_sequence(),public.collaboration_action(uuid,uuid,jsonb),public.refresh_project_filter_classification(uuid),public.sync_project_filter_classification(),public.sync_domain_choices(),public.snapshot_application_percentage() TO project_admin;

-- Read helpers are intentionally callable by authenticated users/RLS policies.
REVOKE ALL ON FUNCTION public.verified_user(),public.owns_project(uuid),public.team_access(uuid,uuid),public.can_view_profile(uuid),public.match_candidates_for_role(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verified_user(),public.owns_project(uuid),public.team_access(uuid,uuid),public.can_view_profile(uuid),public.match_candidates_for_role(uuid,integer) TO authenticated,project_admin;
```

## Full SQL: 20261118020000_collaboration-reads.sql

SHA-256: `a6559567d0e42f1907f2b2b578facd94d5d539ec659205d3d7495c0115ac7f73`

```sql
-- InsForge's migration runner supplies one transaction on one checked-out client.
-- Do not add BEGIN/COMMIT here: the runner rejects in-file transaction control.

-- Profile/domain policies are replaced atomically in the foundation migration.

-- Only minimal directory identity is public to verified users; full profiles obey visibility RLS.
CREATE OR REPLACE FUNCTION public.profile_identities(ids uuid[]) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'display_name',display_name,'avatar_url',avatar_url)),'[]') FROM public.profiles WHERE public.verified_user() IS NOT NULL AND id=ANY(ids) AND cardinality(ids)<=100;
$$;
CREATE OR REPLACE FUNCTION public.profile_projects(target uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM (SELECT p.id,p.title,p.status,CASE WHEN p.owner_id=target THEN 'Lead' ELSE 'Member' END participation FROM public.projects p WHERE public.can_view_profile(target) AND (p.owner_id=target OR EXISTS(SELECT 1 FROM public.project_members m WHERE m.project_id=p.id AND m.user_id=target AND (m.left_at IS NULL OR p.status IN('completed','archived')))) AND (p.status='open' OR public.team_access(p.id,public.verified_user()) OR p.status IN('completed','archived')) ORDER BY p.created_at DESC LIMIT 50) q;
$$;
CREATE OR REPLACE FUNCTION public.workspace_data(pid uuid,kind text DEFAULT 'overview',before_time timestamptz DEFAULT NULL,before_id uuid DEFAULT NULL,after_sequence bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE viewer uuid=public.verified_user();p public.projects;payload jsonb;BEGIN
 SELECT * INTO p FROM public.projects WHERE id=pid;
 IF viewer IS NULL OR NOT public.team_access(pid,viewer) THEN RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501';END IF;
 IF kind='unread' THEN
 SELECT jsonb_build_object('unread_chat',count(*)) INTO payload FROM public.project_messages m WHERE m.project_id=pid AND m.author_id<>viewer AND m.deleted_at IS NULL AND m.created_at>coalesce((SELECT last_read_message_at FROM public.workspace_read_state WHERE project_id=pid AND user_id=viewer),'epoch'::timestamptz);
 ELSIF kind='overview' THEN
 SELECT jsonb_build_object('project',jsonb_build_object('id',p.id,'title',p.title,'status',p.status,'owner_id',p.owner_id),'user_id',viewer,
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'role_id',m.role_id,'joined_at',m.joined_at,'left_at',m.left_at,'left_reason',m.left_reason,'removed_by',m.removed_by,'display_name',pr.display_name,'avatar_url',pr.avatar_url,'is_team_lead',pr.is_team_lead,'role_title',r.title) ORDER BY m.joined_at DESC) FROM public.project_members m JOIN public.profiles pr ON pr.id=m.user_id LEFT JOIN public.project_roles r ON r.id=m.role_id WHERE m.project_id=pid),'[]'),
 'lead',(SELECT jsonb_build_object('id',pr.id,'display_name',pr.display_name,'avatar_url',pr.avatar_url,'is_team_lead',pr.is_team_lead) FROM public.profiles pr WHERE pr.id=p.owner_id),
 'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'slots',slots,'filled_count',filled_count)) FROM public.project_roles WHERE project_id=pid),'[]'),
 'transfers',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,from_id,to_id,status FROM public.ownership_transfers WHERE project_id=pid AND status='pending' AND (from_id=viewer OR to_id=viewer))x),'[]'),
 'unread_chat',(SELECT count(*) FROM public.project_messages m WHERE m.project_id=pid AND m.author_id<>viewer AND m.deleted_at IS NULL AND m.created_at>coalesce((SELECT last_read_message_at FROM public.workspace_read_state WHERE project_id=pid AND user_id=viewer),'epoch'::timestamptz))) INTO payload;
 ELSIF kind='messages' THEN
 SELECT jsonb_build_object('data',coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'),'sequence',coalesce(max(q.change_seq),after_sequence,0)) INTO payload FROM (SELECT m.id,m.project_id,m.author_id,m.change_seq,CASE WHEN m.deleted_at IS NOT NULL THEN 'Message removed' ELSE m.body END body,m.created_at,m.edited_at,m.deleted_at,pr.display_name,pr.avatar_url FROM public.project_messages m JOIN public.profiles pr ON pr.id=m.author_id WHERE m.project_id=pid
 AND (before_time IS NULL OR (m.created_at,m.id)<(before_time,coalesce(before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
 AND (after_sequence IS NULL OR m.change_seq>after_sequence)
 ORDER BY CASE WHEN after_sequence IS NULL THEN m.created_at END DESC,CASE WHEN after_sequence IS NOT NULL THEN m.change_seq END ASC,m.id DESC LIMIT 50)q;
 ELSIF kind='tasks' THEN
 SELECT jsonb_build_object('data',coalesce(jsonb_agg(to_jsonb(q)),'[]')) INTO payload FROM (SELECT * FROM public.project_tasks WHERE project_id=pid ORDER BY CASE WHEN status='done' THEN 1 ELSE 0 END,position,id LIMIT 1000)q;
 ELSE RAISE EXCEPTION 'Unknown resource';END IF;
 RETURN payload;
END $$;
-- These are authenticated read functions, not server-only mutations.
REVOKE ALL ON FUNCTION public.profile_identities(uuid[]),public.profile_projects(uuid),public.workspace_data(uuid,text,timestamptz,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.profile_identities(uuid[]),public.profile_projects(uuid),public.workspace_data(uuid,text,timestamptz,uuid,bigint) TO authenticated,project_admin;
```

## Full SQL: 20261118030000_task-conflict-response.sql

SHA-256: `505e0cd1267a7c7a60cd9e5cb6799ff6068aa026ba816d354c6aa4fee960892d`

```sql
-- Optimistic task conflicts are HTTP 409, not retryable serialization failures.
-- A stale update must never recreate a deleted task. No existing rows are changed.
CREATE OR REPLACE FUNCTION public.collaboration_action(actor uuid,pid uuid,p_action jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; m public.project_members; t public.project_tasks; msg public.project_messages; transfer public.ownership_transfers; a text=p_action->>'action'; uid uuid; rid uuid; tid uuid; body jsonb; previous uuid; previous_name text; item record; before_pos float; prev_pos float; pos float; task_count int; result jsonb='{}'; BEGIN
 PERFORM public.check_actor(actor); SELECT * INTO p FROM public.projects WHERE id=pid FOR UPDATE;
 IF p.id IS NULL OR NOT public.team_access(pid,actor) THEN RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501'; END IF;
 IF a='read_chat' THEN INSERT INTO public.workspace_read_state(project_id,user_id,last_read_message_at) VALUES(pid,actor,now()) ON CONFLICT(project_id,user_id) DO UPDATE SET last_read_message_at=excluded.last_read_message_at; RETURN '{}'; END IF;
 IF p.status IN('completed','cancelled','archived') AND a NOT IN('status','leave','remove','transfer_reply') THEN RAISE EXCEPTION 'This workspace is read-only'; END IF;
 IF a='status' THEN
 IF p.owner_id<>actor THEN RAISE EXCEPTION 'Only the lead can change status'; END IF;
 UPDATE public.projects SET status=p_action->>'status',revision=revision+1 WHERE id=pid;
 ELSIF a IN('leave','remove') THEN
 uid=CASE WHEN a='leave' THEN actor ELSE (p_action->>'user_id')::uuid END;
 IF uid=p.owner_id THEN RAISE EXCEPTION 'Transfer leadership before leaving'; END IF;
 IF a='remove' AND actor<>p.owner_id THEN RAISE EXCEPTION 'Only the lead can remove members'; END IF;
 SELECT * INTO m FROM public.project_members WHERE project_id=pid AND user_id=uid AND left_at IS NULL FOR UPDATE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Member is not active'; END IF;
 UPDATE public.project_members SET left_at=now(),left_reason=coalesce(p_action->>'note',''),removed_by=CASE WHEN a='remove' THEN actor END WHERE id=m.id;
 IF m.role_id IS NOT NULL THEN UPDATE public.project_roles SET filled_count=filled_count-1 WHERE id=m.role_id; END IF;
 SELECT jsonb_build_object('unassigned_tasks',coalesce(jsonb_agg(title),'[]')) INTO result FROM public.project_tasks WHERE project_id=pid AND assignee_id=uid;
 FOR item IN SELECT id,title FROM public.project_tasks WHERE project_id=pid AND assignee_id=uid LOOP
 UPDATE public.project_tasks SET assignee_id=NULL,revision=revision+1,updated_at=now() WHERE id=item.id;
 PERFORM public.notify_user(uid,actor,pid,'task.unassigned','Task unassigned',item.title,'/projects/'||pid||'/workspace?tab=tasks');
 PERFORM public.notify_user(p.owner_id,actor,pid,'task.unassigned','Task needs an assignee',item.title,'/projects/'||pid||'/workspace?tab=tasks'); END LOOP;
 UPDATE public.ownership_transfers SET status='cancelled',decided_at=now() WHERE project_id=pid AND to_id=uid AND status='pending';
 PERFORM public.notify_user(CASE WHEN a='leave' THEN p.owner_id ELSE uid END,actor,pid,'member.'||a,CASE WHEN a='leave' THEN 'A member left your team' ELSE 'You were removed from the team' END,coalesce(p_action->>'note',''),'/projects/'||pid);
 ELSIF a='reassign' THEN
 IF p.owner_id<>actor THEN RAISE EXCEPTION 'Only the lead can reassign roles'; END IF;
 uid=(p_action->>'user_id')::uuid;rid=(p_action->>'role_id')::uuid;
 SELECT * INTO m FROM public.project_members WHERE project_id=pid AND user_id=uid AND left_at IS NULL FOR UPDATE;
 IF m.id IS NULL THEN RAISE EXCEPTION 'Member is not active'; END IF;
 IF m.role_id IS NOT DISTINCT FROM rid THEN RETURN '{}'; END IF;
 IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id=pid AND filled_count<slots) THEN RAISE EXCEPTION 'This role is full or invalid'; END IF;
 UPDATE public.project_members SET role_id=rid WHERE id=m.id;
 UPDATE public.project_roles SET filled_count=filled_count-1 WHERE id=m.role_id;
 UPDATE public.project_roles SET filled_count=filled_count+1 WHERE id=rid;
 PERFORM public.notify_user(uid,actor,pid,'member.role','Your role changed',p.title,'/projects/'||pid||'/workspace');
 ELSIF a='transfer' THEN
 uid=(p_action->>'user_id')::uuid;
 IF actor<>p.owner_id OR uid=actor OR NOT public.team_access(pid,uid) OR NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND is_team_lead) THEN RAISE EXCEPTION 'Choose an active member with Lead intent enabled'; END IF;
 INSERT INTO public.ownership_transfers(project_id,from_id,to_id) VALUES(pid,actor,uid) RETURNING id INTO tid;
 PERFORM public.notify_user(uid,actor,pid,'ownership.request','Leadership transfer request',p.title,'/projects/'||pid||'/workspace','transfer:'||tid);result=jsonb_build_object('id',tid);
 ELSIF a='transfer_reply' THEN
 SELECT * INTO transfer FROM public.ownership_transfers WHERE id=(p_action->>'id')::uuid AND project_id=pid FOR UPDATE;
 IF transfer.id IS NULL OR transfer.status<>'pending' OR transfer.to_id<>actor OR transfer.from_id<>p.owner_id THEN RAISE EXCEPTION 'Transfer request is no longer valid'; END IF;
 IF (p_action->>'accept')::boolean THEN
 IF p.status IN('completed','cancelled','archived') THEN RAISE EXCEPTION 'This workspace is read-only';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_team_lead) THEN RAISE EXCEPTION 'Enable Lead intent before accepting'; END IF;
 SELECT * INTO m FROM public.project_members WHERE project_id=pid AND user_id=actor AND left_at IS NULL FOR UPDATE;
 UPDATE public.project_members SET left_at=now(),left_reason='Became team lead' WHERE id=m.id;
 UPDATE public.project_roles SET filled_count=filled_count-1 WHERE id=m.role_id;
 INSERT INTO public.project_members(project_id,user_id,role_id) VALUES(pid,p.owner_id,NULL);
 UPDATE public.projects SET owner_id=actor,revision=revision+1 WHERE id=pid;
 UPDATE public.ownership_transfers SET status='accepted',decided_at=now() WHERE id=transfer.id;
 FOR item IN SELECT user_id FROM public.project_members WHERE project_id=pid AND left_at IS NULL LOOP PERFORM public.notify_user(item.user_id,actor,pid,'ownership.transferred','Project leadership transferred',p.title,'/projects/'||pid||'/workspace','ownership:'||transfer.id||':'||item.user_id);END LOOP;
 ELSE UPDATE public.ownership_transfers SET status='declined',decided_at=now() WHERE id=transfer.id;
 PERFORM public.notify_user(p.owner_id,actor,pid,'ownership.declined','Leadership request declined',p.title,'/projects/'||pid||'/workspace','declined:'||transfer.id); END IF;
 ELSIF a='message' THEN
 IF length(btrim(p_action->>'body')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Message must contain 1–2000 characters'; END IF;
 tid=(p_action->>'id')::uuid;SELECT * INTO msg FROM public.project_messages WHERE id=tid;
 IF msg.id IS NOT NULL THEN IF msg.project_id<>pid OR msg.author_id<>actor OR msg.body<>btrim(p_action->>'body') THEN RAISE EXCEPTION 'Message id conflict';END IF;
 ELSE INSERT INTO public.project_messages(id,project_id,author_id,body) VALUES(tid,pid,actor,btrim(p_action->>'body'));END IF;result=jsonb_build_object('id',tid);
 ELSIF a IN('edit_message','delete_message') THEN
 SELECT * INTO msg FROM public.project_messages WHERE id=(p_action->>'id')::uuid AND project_id=pid FOR UPDATE;
 IF msg.id IS NULL OR (msg.author_id<>actor AND NOT(a='delete_message' AND p.owner_id=actor)) THEN RAISE EXCEPTION 'Message permission denied'; END IF;
 IF msg.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message was removed'; END IF;
 IF a='delete_message' THEN UPDATE public.project_messages SET deleted_at=now(),body='Message removed' WHERE id=msg.id;
 ELSE IF length(btrim(p_action->>'body')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid message';END IF; UPDATE public.project_messages SET body=btrim(p_action->>'body'),edited_at=now() WHERE id=msg.id; END IF;
 ELSIF a IN('task','delete_task') THEN
 body=p_action->'task';tid=CASE WHEN a='delete_task' THEN (p_action->>'id')::uuid ELSE coalesce((body->>'id')::uuid,gen_random_uuid()) END;
 SELECT * INTO t FROM public.project_tasks WHERE id=tid AND project_id=pid FOR UPDATE;
 IF t.id IS NOT NULL THEN
 IF t.revision<>(CASE WHEN a='delete_task' THEN (p_action->>'revision')::int ELSE (body->>'revision')::int END) THEN RAISE EXCEPTION 'Task changed. Refresh and try again.' USING ERRCODE='PT409'; END IF;
 IF a='delete_task' THEN
 IF actor<>p.owner_id AND actor<>t.created_by THEN RAISE EXCEPTION 'You can only delete tasks you created'; END IF;
 PERFORM public.notify_user(t.assignee_id,actor,pid,'task.removed','Assigned task removed',t.title,'/projects/'||pid||'/workspace?tab=tasks');DELETE FROM public.project_tasks WHERE id=tid;RETURN '{}';
 END IF;
 IF actor<>p.owner_id AND t.assignee_id IS NOT NULL AND t.assignee_id<>actor THEN RAISE EXCEPTION 'You can only edit your tasks or unassigned tasks'; END IF;
 IF actor<>p.owner_id AND (body->>'assignee_id')::uuid IS DISTINCT FROM t.assignee_id AND (body->>'assignee_id')::uuid IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Only the lead can assign another member'; END IF;
 ELSE
 IF a='delete_task' THEN RAISE EXCEPTION 'Task not found'; END IF;
 IF coalesce((body->>'revision')::int,0)<>0 THEN RAISE EXCEPTION 'Task changed. Refresh and try again.' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM public.project_tasks WHERE id=tid) THEN RAISE EXCEPTION 'Task id conflict';END IF;
 SELECT count(*) INTO task_count FROM public.project_tasks WHERE project_id=pid AND status<>'done';
 IF task_count>=200 AND body->>'status'<>'done' THEN RAISE EXCEPTION 'This project has 200 active tasks'; END IF;
 IF actor<>p.owner_id AND (body->>'assignee_id')::uuid IS NOT NULL AND (body->>'assignee_id')::uuid<>actor THEN RAISE EXCEPTION 'Only the lead can assign another member'; END IF;
 END IF;
 uid=(body->>'assignee_id')::uuid;
 IF uid IS NOT NULL AND NOT public.team_access(pid,uid) THEN RAISE EXCEPTION 'Assignee must be a current team member'; END IF;
 IF t.status='done' AND body->>'status'<>'done' AND (SELECT count(*) FROM public.project_tasks WHERE project_id=pid AND status<>'done')>=200 THEN RAISE EXCEPTION 'This project has 200 active tasks';END IF;
 IF body ? 'before_id' OR t.id IS NULL OR body->>'status'<>t.status THEN
 IF body->>'before_id' IS NOT NULL THEN
 SELECT position INTO before_pos FROM public.project_tasks WHERE id=(body->>'before_id')::uuid AND project_id=pid AND status=body->>'status' AND id<>tid;
 IF before_pos IS NULL THEN RAISE EXCEPTION 'Board changed. Refresh and try again.';END IF;
 SELECT max(position) INTO prev_pos FROM public.project_tasks WHERE project_id=pid AND status=body->>'status' AND position<before_pos AND id<>tid;
 pos=CASE WHEN prev_pos IS NULL THEN before_pos-1024 ELSE (prev_pos+before_pos)/2 END;
 ELSE SELECT coalesce(max(position),0)+1024 INTO pos FROM public.project_tasks WHERE project_id=pid AND status=body->>'status';END IF;
 ELSE pos=t.position;END IF;
 INSERT INTO public.project_tasks(id,project_id,title,description,status,priority,assignee_id,created_by,due_date,position,completed_at)
 VALUES(tid,pid,body->>'title',coalesce(body->>'description',''),body->>'status',body->>'priority',uid,actor,(body->>'due_date')::date,pos,CASE WHEN body->>'status'='done' THEN now() END)
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,status=excluded.status,priority=excluded.priority,assignee_id=excluded.assignee_id,due_date=excluded.due_date,position=excluded.position,revision=public.project_tasks.revision+1,updated_at=now(),completed_at=CASE WHEN excluded.status='done' THEN coalesce(public.project_tasks.completed_at,now()) END;
 IF t.assignee_id IS DISTINCT FROM uid THEN
 PERFORM public.notify_user(t.assignee_id,actor,pid,'task.unassigned','Task reassigned',body->>'title','/projects/'||pid||'/workspace?tab=tasks&task='||tid);
 PERFORM public.notify_user(uid,actor,pid,'task.assigned','Task assigned to you',body->>'title','/projects/'||pid||'/workspace?tab=tasks&task='||tid);END IF;
 WITH ranked AS (SELECT id,row_number() OVER(PARTITION BY status ORDER BY position,id)*1024 AS new_position FROM public.project_tasks WHERE project_id=pid) UPDATE public.project_tasks ordered_task SET position=r.new_position FROM ranked r WHERE ordered_task.id=r.id;
 result=jsonb_build_object('id',tid);
 ELSE RAISE EXCEPTION 'Unknown workspace action';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.collaboration_action(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.collaboration_action(uuid,uuid,jsonb) TO project_admin;
```

