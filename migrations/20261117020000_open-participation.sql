-- Participation does not require an embedding or completed onboarding.
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
 b=public.match_breakdown(uid,pid,rid);
 IF kind='apply' THEN
 SELECT status INTO prior FROM public.applications WHERE applicant_id=uid AND project_id=pid AND role_id IS NOT DISTINCT FROM rid;
 IF prior IS NOT NULL THEN RAISE EXCEPTION 'Application already exists';END IF;
 st='pending';
 INSERT INTO public.applications(project_id,role_id,applicant_id,message,cosine,breakdown,status,decided_by,decided_at) VALUES(pid,rid,uid,note,(b->>'cosine')::float,b,st,'system',NULL)
 ON CONFLICT(applicant_id,project_id,role_id) DO UPDATE SET message=excluded.message,cosine=excluded.cosine,breakdown=excluded.breakdown,status=excluded.status,decided_by='system',decided_at=excluded.decided_at,created_at=now() RETURNING id INTO result_id;

 ELSE
 SELECT status INTO prior FROM public.invitations WHERE invitee_id=uid AND project_id=pid AND role_id IS NOT DISTINCT FROM rid;
 IF prior IN('pending','accepted') THEN RAISE EXCEPTION 'Invitation already exists';END IF;
 st='pending';INSERT INTO public.invitations(project_id,role_id,inviter_id,invitee_id,message,cosine,breakdown,status,decided_by) VALUES(pid,rid,actor,uid,note,(b->>'cosine')::float,b,st,actor::text)
 ON CONFLICT(invitee_id,project_id,role_id) DO UPDATE SET message=excluded.message,cosine=excluded.cosine,breakdown=excluded.breakdown,status='pending',decided_by=actor::text,decided_at=NULL,created_at=now() RETURNING id INTO result_id;
 END IF;
 RETURN jsonb_build_object('id',result_id,'status',st,'breakdown',b);
END $$;
CREATE OR REPLACE FUNCTION public.match_breakdown(p_user uuid,p_project uuid,p_role uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u public.profile_embeddings; e vector(384); m text; v text; c double precision; matched text[]; missing text[];
BEGIN
 SELECT * INTO u FROM public.profile_embeddings WHERE profile_id=p_user;
 IF p_role IS NULL THEN SELECT embedding,model,version INTO e,m,v FROM public.project_embeddings WHERE project_id=p_project;
 ELSE SELECT re.embedding,re.model,re.version INTO e,m,v FROM public.role_embeddings re JOIN public.project_roles r ON r.id=re.role_id WHERE r.id=p_role AND r.project_id=p_project; END IF;
 
 SELECT coalesce(array_agg(DISTINCT s.name ORDER BY s.name) FILTER(WHERE ps.skill_id IS NOT NULL),'{}'),coalesce(array_agg(DISTINCT s.name ORDER BY s.name) FILTER(WHERE ps.skill_id IS NULL),'{}') INTO matched,missing
 FROM public.project_role_skills rs JOIN public.skills s ON s.id=rs.skill_id LEFT JOIN public.profile_skills ps ON ps.skill_id=rs.skill_id AND ps.profile_id=p_user WHERE (rs.role_id=p_role OR (p_role IS NULL AND rs.role_id IN(SELECT id FROM public.project_roles WHERE project_id=p_project))) AND rs.importance='required';
 c=CASE WHEN u.embedding IS NULL OR e IS NULL OR u.model<>m OR u.version<>v THEN NULL ELSE 1-(u.embedding <=> e) END;
 RETURN jsonb_build_object('cosine',c,'matched_skills',matched,'missing_skills',missing,'model',m,'version',v);
END $$;