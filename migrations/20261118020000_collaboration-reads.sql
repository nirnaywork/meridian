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

