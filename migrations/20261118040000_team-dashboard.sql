-- Snapshot guard: fail atomically if tasks changed since the verified export.
LOCK TABLE public.project_tasks IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF (SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')::text) FROM public.project_tasks t) <> 'd751713988987e9331980363e24189ce' THEN
 RAISE EXCEPTION 'Tasks changed since export; archive the new rows before retrying'; END IF;
END $$;
ALTER TABLE public.projects ADD COLUMN started_at timestamptz, ADD COLUMN started_by uuid REFERENCES public.profiles;
ALTER TABLE public.project_messages ADD COLUMN participants uuid[] NOT NULL DEFAULT '{}',
 ADD COLUMN thread text NOT NULL DEFAULT 'everyone';
CREATE INDEX messages_by_thread ON public.project_messages(project_id,thread,created_at,id);
DROP POLICY team_read ON public.project_messages;
CREATE POLICY conversation_read ON public.project_messages FOR SELECT TO authenticated USING
 (public.team_access(project_id,public.verified_user()) AND (thread='everyone' OR public.verified_user()=ANY(participants)));
ALTER TABLE public.workspace_read_state ADD COLUMN thread text NOT NULL DEFAULT 'everyone';
ALTER TABLE public.workspace_read_state DROP CONSTRAINT workspace_read_state_pkey, ADD PRIMARY KEY(project_id,user_id,thread);
DROP POLICY team_read ON public.workspace_read_state;
CREATE POLICY own_reads ON public.workspace_read_state FOR SELECT TO authenticated USING
 (user_id=public.verified_user() AND public.team_access(project_id,user_id));
CREATE TABLE public.project_updates(id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.projects,
 author_id uuid NOT NULL REFERENCES public.profiles, body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
 created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.project_tickets(id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES public.projects,
 created_by uuid NOT NULL REFERENCES public.profiles, assignee_id uuid REFERENCES public.profiles,
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),description text NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 4000),
 type text NOT NULL CHECK(type IN ('Issue','Feature','Modification','Improvement','Question')),
 priority text NOT NULL CHECK(priority IN ('low','medium','high')),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved','closed')),
 created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.project_updates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_updates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_updates TO authenticated;
GRANT ALL ON public.project_updates TO project_admin;
CREATE POLICY team_read ON public.project_updates FOR SELECT TO authenticated USING(public.team_access(project_id,public.verified_user()));
CREATE INDEX project_updates_project_date ON public.project_updates(project_id,created_at DESC,id);
ALTER TABLE public.project_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_tickets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.project_tickets TO authenticated;
GRANT ALL ON public.project_tickets TO project_admin;
CREATE POLICY team_read ON public.project_tickets FOR SELECT TO authenticated USING(public.team_access(project_id,public.verified_user()));
CREATE INDEX project_tickets_project_date ON public.project_tickets(project_id,created_at DESC,id);
CREATE FUNCTION public.minimum_start_members() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$;

REVOKE ALL ON FUNCTION public.minimum_start_members() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.minimum_start_members() TO authenticated,project_admin;
CREATE OR REPLACE FUNCTION public.lifecycle_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE allowed jsonb='{"open":["closed","in_progress","completed","cancelled"],"closed":["open","in_progress","completed","cancelled"],"in_progress":["open","closed","completed","cancelled"],"completed":["archived"],"cancelled":["archived"],"archived":[]}'; member uuid; BEGIN
 IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NOT (allowed->OLD.status ? NEW.status) THEN RAISE EXCEPTION 'Invalid project status transition'; END IF;
 IF NEW.status='in_progress' THEN
 IF (OLD.status<>'open' AND OLD.started_at IS NULL) OR (SELECT count(*) FROM public.project_members WHERE project_id=NEW.id AND left_at IS NULL AND user_id<>NEW.owner_id)<public.minimum_start_members()
 THEN RAISE EXCEPTION 'Open recruiting and add another active member before starting'; END IF;
 IF OLD.started_at IS NULL THEN NEW.started_at=now(); NEW.started_by=NEW.owner_id; END IF;
 END IF;
 IF NEW.status IN('completed','cancelled','archived') THEN
 UPDATE public.applications SET status='rejected',decided_by=NEW.owner_id::text,decided_at=now() WHERE project_id=NEW.id AND status='pending';
 UPDATE public.invitations SET status='cancelled',decided_by=NEW.owner_id::text,decided_at=now() WHERE project_id=NEW.id AND status='pending';
 END IF;
 FOR member IN SELECT user_id FROM public.project_members WHERE project_id=NEW.id AND left_at IS NULL LOOP
 PERFORM public.notify_user(member,NEW.owner_id,NEW.id,'project.status',CASE WHEN NEW.status='in_progress' THEN 'Project started' ELSE 'Project is '||replace(NEW.status,'_',' ') END,NEW.title,'/projects/'||NEW.id||'/workspace'); END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.lifecycle_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.lifecycle_guard() TO project_admin;
CREATE OR REPLACE FUNCTION public.participation_notification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE lead uuid; actor uuid; recipient uuid; destination text; BEGIN
 IF TG_OP='UPDATE' AND NEW.status=OLD.status AND NEW.created_at=OLD.created_at THEN RETURN NEW; END IF;
 SELECT owner_id INTO lead FROM public.projects WHERE id=NEW.project_id;
 IF TG_TABLE_NAME='applications' THEN
 actor=CASE WHEN NEW.status IN('pending','withdrawn') THEN NEW.applicant_id ELSE coalesce(nullif(NEW.decided_by,'system')::uuid,lead) END;
 recipient=CASE WHEN NEW.status IN('pending','withdrawn') THEN lead ELSE NEW.applicant_id END;
 destination=CASE WHEN recipient=lead THEN '/projects/'||NEW.project_id WHEN NEW.status='approved' THEN '/projects/'||NEW.project_id||'/workspace' ELSE '/applications' END;
 ELSE
 actor=CASE WHEN NEW.status IN('accepted','declined') THEN NEW.invitee_id ELSE lead END;
 recipient=CASE WHEN NEW.status IN('accepted','declined') THEN lead ELSE NEW.invitee_id END;
 destination=CASE WHEN recipient=lead THEN '/projects/'||NEW.project_id||'/workspace' ELSE '/invitations' END;
 END IF;
 PERFORM public.notify_user(recipient,actor,NEW.project_id,TG_TABLE_NAME||'.'||NEW.status,CASE WHEN TG_TABLE_NAME='applications' THEN 'Application ' ELSE 'Invitation ' END||NEW.status,'Open to see the details.',destination,NEW.id||':'||NEW.status||':'||NEW.created_at::text);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.participation_notification() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.participation_notification() TO project_admin;
CREATE OR REPLACE FUNCTION public.collaboration_action(actor uuid,pid uuid,p_action jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; m public.project_members; msg public.project_messages; ticket public.project_tickets;
 transfer public.ownership_transfers; a text=p_action->>'action'; uid uuid; rid uuid; tid uuid; item record;
 participants_list uuid[]; thread_key text='everyone'; dest text='/projects/'||pid||'/workspace?tab='; title_text text; result jsonb='{}'; BEGIN
 PERFORM public.check_actor(actor); SELECT * INTO p FROM public.projects WHERE id=pid FOR UPDATE;
 IF p.id IS NULL OR NOT public.team_access(pid,actor) THEN RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501'; END IF;
 IF a IN ('read_chat','message') THEN
 SELECT coalesce(array_agg(DISTINCT value::uuid ORDER BY value::uuid),'{}') INTO participants_list
 FROM jsonb_array_elements_text(coalesce(p_action->'recipients','[]')) WHERE value::uuid<>actor;
 IF cardinality(participants_list)>0 THEN
 IF a='message' AND EXISTS(SELECT 1 FROM unnest(participants_list) person WHERE NOT public.team_access(pid,person)) THEN RAISE EXCEPTION 'Choose active team members'; END IF;
 SELECT array_agg(person ORDER BY person) INTO participants_list FROM unnest(participants_list||actor) person;
 thread_key=array_to_string(participants_list,',');
 END IF; END IF;
 IF a='read_chat' THEN
 INSERT INTO public.workspace_read_state(project_id,user_id,thread,last_read_message_at)
 VALUES(pid,actor,thread_key,least((p_action->>'seen_at')::timestamptz,now()))
 ON CONFLICT(project_id,user_id,thread) DO UPDATE SET last_read_message_at=greatest(workspace_read_state.last_read_message_at,excluded.last_read_message_at);
 RETURN '{}'; END IF;
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
 UPDATE public.project_tickets SET assignee_id=NULL WHERE project_id=pid AND assignee_id=uid;
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
 IF msg.id IS NOT NULL THEN IF msg.project_id<>pid OR msg.author_id<>actor OR msg.thread<>thread_key OR msg.body<>btrim(p_action->>'body') THEN RAISE EXCEPTION 'Message id conflict';END IF;
 ELSE INSERT INTO public.project_messages(id,project_id,author_id,body,participants,thread) VALUES(tid,pid,actor,btrim(p_action->>'body'),participants_list,thread_key);END IF;result=jsonb_build_object('id',tid);
 ELSIF a IN('edit_message','delete_message') THEN
 SELECT * INTO msg FROM public.project_messages WHERE id=(p_action->>'id')::uuid AND project_id=pid FOR UPDATE;
 IF msg.id IS NULL OR msg.author_id<>actor THEN RAISE EXCEPTION 'Message permission denied'; END IF;
 IF msg.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Message was removed'; END IF;
 IF a='delete_message' THEN UPDATE public.project_messages SET deleted_at=now(),body='Message removed' WHERE id=msg.id;
 ELSE IF length(btrim(p_action->>'body')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Invalid message';END IF; UPDATE public.project_messages SET body=btrim(p_action->>'body'),edited_at=now() WHERE id=msg.id; END IF;
 ELSIF a='post_update' THEN
 tid=(p_action->>'id')::uuid;
 INSERT INTO public.project_updates VALUES(tid,pid,actor,btrim(p_action->>'body'),now()) ON CONFLICT(id) DO NOTHING;
 IF FOUND THEN
 SELECT display_name||' posted an update' INTO title_text FROM public.profiles WHERE id=actor;
 FOR uid IN SELECT user_id FROM public.project_members WHERE project_id=pid AND left_at IS NULL UNION SELECT p.owner_id LOOP
 PERFORM public.notify_user(uid,actor,pid,'update.posted',title_text,p.title,dest||'updates','update:'||tid||':'||uid); END LOOP;
 END IF;
 ELSIF a IN ('edit_update','delete_update') THEN
 tid=(p_action->>'id')::uuid;
 IF a='delete_update' THEN DELETE FROM public.project_updates WHERE id=tid AND project_id=pid AND author_id=actor;
 ELSE UPDATE public.project_updates SET body=btrim(p_action->>'body') WHERE id=tid AND project_id=pid AND author_id=actor; END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Update permission denied' USING ERRCODE='42501'; END IF;
 ELSIF a='ticket' THEN
 tid=(p_action->>'id')::uuid;uid=(p_action->>'assignee_id')::uuid;
 IF uid IS NOT NULL AND NOT public.team_access(pid,uid) THEN RAISE EXCEPTION 'Choose an active assignee'; END IF;
 INSERT INTO public.project_tickets(id,project_id,created_by,assignee_id,title,description,type,priority)
 VALUES(tid,pid,actor,uid,p_action->>'title',p_action->>'description',p_action->>'type',p_action->>'priority') ON CONFLICT(id) DO NOTHING;
 IF FOUND THEN
 FOR uid IN SELECT DISTINCT person FROM unnest(ARRAY[uid,p.owner_id]) person LOOP
 PERFORM public.notify_user(uid,actor,pid,'ticket.created','New ticket',p_action->>'title',dest||'tickets','ticket:'||tid||':'||uid); END LOOP;
 END IF;
 ELSIF a='ticket_status' THEN
 SELECT * INTO ticket FROM public.project_tickets WHERE id=(p_action->>'id')::uuid AND project_id=pid FOR UPDATE;
 IF ticket.id IS NULL OR NOT (CASE ticket.status WHEN 'open' THEN ARRAY['in_progress'] WHEN 'in_progress' THEN ARRAY['resolved'] WHEN 'resolved' THEN ARRAY['closed','open'] ELSE ARRAY['open'] END @> ARRAY[p_action->>'status']) THEN RAISE EXCEPTION 'Invalid ticket transition' USING ERRCODE='PT409'; END IF;
 UPDATE public.project_tickets SET status=p_action->>'status' WHERE id=ticket.id;
 FOR uid IN SELECT DISTINCT person FROM unnest(ARRAY[ticket.created_by,ticket.assignee_id]) person LOOP
 IF public.team_access(pid,uid) THEN PERFORM public.notify_user(uid,actor,pid,'ticket.status','Ticket '||replace(p_action->>'status','_',' '),ticket.title,dest||'tickets'); END IF; END LOOP;
 ELSE RAISE EXCEPTION 'Unknown workspace action';END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.collaboration_action(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.collaboration_action(uuid,uuid,jsonb) TO project_admin;
CREATE FUNCTION public.dashboard_messages(pid uuid) RETURNS SETOF public.project_messages
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT m.* FROM public.project_messages m WHERE m.project_id=pid AND public.team_access(pid,public.verified_user())
 AND (m.thread='everyone' OR public.verified_user()=ANY(m.participants)) $$;

REVOKE ALL ON FUNCTION public.dashboard_messages(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_messages(uuid) TO authenticated,project_admin;
CREATE OR REPLACE FUNCTION public.workspace_data(pid uuid,kind text DEFAULT 'overview',before_time timestamptz DEFAULT NULL,before_id uuid DEFAULT NULL,after_sequence bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE viewer uuid=public.verified_user();p public.projects;payload jsonb;BEGIN
 SELECT * INTO p FROM public.projects WHERE id=pid;
 IF viewer IS NULL OR NOT public.team_access(pid,viewer) THEN RAISE EXCEPTION 'Workspace access denied' USING ERRCODE='42501';END IF;
 IF kind='unread' THEN
 SELECT jsonb_build_object('unread_chat',count(*)) INTO payload FROM public.dashboard_messages(pid) m WHERE m.project_id=pid AND m.author_id<>viewer AND m.deleted_at IS NULL AND m.created_at>coalesce((SELECT last_read_message_at FROM public.workspace_read_state WHERE project_id=pid AND user_id=viewer AND thread=m.thread),'epoch'::timestamptz);
 ELSIF kind='overview' THEN
 SELECT jsonb_build_object('project',jsonb_build_object('id',p.id,'title',p.title,'status',p.status,'owner_id',p.owner_id,'started_at',p.started_at,'team_size',p.team_size,'minimum_start_members',public.minimum_start_members()),'user_id',viewer,
 'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'user_id',m.user_id,'role_id',m.role_id,'joined_at',m.joined_at,'left_at',m.left_at,'left_reason',m.left_reason,'removed_by',m.removed_by,'display_name',pr.display_name,'avatar_url',pr.avatar_url,'is_team_lead',pr.is_team_lead,'role_title',r.title) ORDER BY m.joined_at DESC) FROM public.project_members m JOIN public.profiles pr ON pr.id=m.user_id LEFT JOIN public.project_roles r ON r.id=m.role_id WHERE m.project_id=pid),'[]'),
 'lead',(SELECT jsonb_build_object('id',pr.id,'display_name',pr.display_name,'avatar_url',pr.avatar_url,'is_team_lead',pr.is_team_lead) FROM public.profiles pr WHERE pr.id=p.owner_id),
 'roles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'slots',slots,'filled_count',filled_count)) FROM public.project_roles WHERE project_id=pid),'[]'),
 'transfers',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,from_id,to_id,status FROM public.ownership_transfers WHERE project_id=pid AND status='pending' AND (from_id=viewer OR to_id=viewer))x),'[]'),
 'unread_chat',(SELECT count(*) FROM public.dashboard_messages(pid) m WHERE m.project_id=pid AND m.author_id<>viewer AND m.deleted_at IS NULL AND m.created_at>coalesce((SELECT last_read_message_at FROM public.workspace_read_state WHERE project_id=pid AND user_id=viewer AND thread=m.thread),'epoch'::timestamptz))) INTO payload;
 ELSIF kind='messages' OR kind LIKE 'messages:%' THEN
 SELECT jsonb_build_object('data',coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at,q.id),'[]'),'sequence',coalesce(max(q.change_seq),after_sequence,0)) INTO payload FROM (SELECT m.id,m.project_id,m.author_id,m.participants,m.change_seq,CASE WHEN m.deleted_at IS NOT NULL THEN 'Message removed' ELSE m.body END body,m.created_at,m.edited_at,m.deleted_at,pr.display_name,pr.avatar_url FROM public.dashboard_messages(pid) m JOIN public.profiles pr ON pr.id=m.author_id WHERE m.project_id=pid
 AND m.thread=coalesce(nullif(split_part(kind,':',2),''),'everyone')
 AND (before_time IS NULL OR (m.created_at,m.id)<(before_time,coalesce(before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid)))
 AND (after_sequence IS NULL OR m.change_seq>after_sequence)
 ORDER BY CASE WHEN after_sequence IS NULL THEN m.created_at END DESC,CASE WHEN after_sequence IS NOT NULL THEN m.change_seq END ASC,m.id DESC LIMIT 50)q;
 ELSIF kind='conversations' THEN
 SELECT jsonb_build_object('data',coalesce(jsonb_agg(q ORDER BY latest DESC),'[]')) INTO payload FROM
 (SELECT m.thread,max(m.created_at) latest,count(*) FILTER(WHERE m.author_id<>viewer AND m.deleted_at IS NULL AND m.created_at>coalesce(s.last_read_message_at,'epoch')) unread
 FROM public.dashboard_messages(pid) m LEFT JOIN public.workspace_read_state s ON s.project_id=pid AND s.user_id=viewer AND s.thread=m.thread GROUP BY m.thread) q;
 ELSIF kind='updates' THEN
 SELECT jsonb_build_object('data',coalesce(jsonb_agg(u ORDER BY created_at DESC,id),'[]')) INTO payload FROM public.project_updates u WHERE project_id=pid;
 ELSIF kind='tickets' THEN
 SELECT jsonb_build_object('data',coalesce(jsonb_agg(t ORDER BY created_at DESC,id),'[]')) INTO payload FROM public.project_tickets t WHERE project_id=pid;
 ELSE RAISE EXCEPTION 'Unknown resource';END IF;
 RETURN payload;
END $$;
REVOKE ALL ON FUNCTION public.workspace_data(uuid,text,timestamptz,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_data(uuid,text,timestamptz,uuid,bigint) TO authenticated,project_admin;
DROP TABLE public.project_tasks;

CREATE FUNCTION public.require_initial_recruitment() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF NEW.status='in_progress' THEN RAISE EXCEPTION 'Create the project before starting with your team'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER require_initial_recruitment AFTER INSERT ON public.projects FOR EACH ROW EXECUTE FUNCTION public.require_initial_recruitment();
REVOKE ALL ON FUNCTION public.require_initial_recruitment() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.require_initial_recruitment() TO project_admin;
