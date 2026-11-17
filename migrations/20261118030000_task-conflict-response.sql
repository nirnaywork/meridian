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
