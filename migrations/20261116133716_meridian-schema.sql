CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 display_name text NOT NULL CHECK(length(display_name) BETWEEN 1 AND 80), headline text NOT NULL DEFAULT '', bio text NOT NULL DEFAULT '', university text NOT NULL DEFAULT '', interests text NOT NULL DEFAULT '', avatar_url text, avatar_key text,
 is_member boolean NOT NULL DEFAULT true, is_team_lead boolean NOT NULL DEFAULT false, onboarding_complete boolean NOT NULL DEFAULT false, is_demo boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(), CHECK(is_member OR is_team_lead)
);
CREATE TABLE public.skills(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,slug text NOT NULL UNIQUE,category text NOT NULL DEFAULT 'Community',aliases text[] NOT NULL DEFAULT '{}',is_verified boolean NOT NULL DEFAULT false);
CREATE TABLE public.profile_skills(profile_id uuid REFERENCES public.profiles ON DELETE CASCADE,skill_id uuid REFERENCES public.skills,proficiency text NOT NULL CHECK(proficiency IN ('beginner','intermediate','advanced')),PRIMARY KEY(profile_id,skill_id));
CREATE TABLE public.projects(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),owner_id uuid NOT NULL REFERENCES public.profiles,title text NOT NULL CHECK(length(title) BETWEEN 3 AND 120),description text NOT NULL,category text NOT NULL,tags text[] NOT NULL DEFAULT '{}',commitment text NOT NULL CHECK(commitment IN ('casual','part-time','intensive')),duration text NOT NULL,team_size integer NOT NULL CHECK(team_size BETWEEN 2 AND 50),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed','in_progress')),auto_approve_strong_matches boolean NOT NULL DEFAULT true,revision integer NOT NULL DEFAULT 1,is_demo boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX projects_owner_idx ON public.projects(owner_id);
CREATE TABLE public.project_roles(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects ON DELETE CASCADE,title text NOT NULL,description text NOT NULL DEFAULT '',slots integer NOT NULL CHECK(slots BETWEEN 1 AND 49),filled_count integer NOT NULL DEFAULT 0 CHECK(filled_count>=0 AND filled_count<=slots),UNIQUE(id,project_id));
CREATE INDEX roles_project_idx ON public.project_roles(project_id);
CREATE TABLE public.project_role_skills(role_id uuid REFERENCES public.project_roles ON DELETE CASCADE,skill_id uuid REFERENCES public.skills,importance text NOT NULL CHECK(importance IN ('required','preferred')),PRIMARY KEY(role_id,skill_id));
CREATE TABLE public.profile_embeddings(profile_id uuid PRIMARY KEY REFERENCES public.profiles ON DELETE CASCADE,embedding vector(384) NOT NULL,source_hash text NOT NULL,model text NOT NULL,version text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.project_embeddings(project_id uuid PRIMARY KEY REFERENCES public.projects ON DELETE CASCADE,embedding vector(384) NOT NULL,source_hash text NOT NULL,model text NOT NULL,version text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.role_embeddings(role_id uuid PRIMARY KEY REFERENCES public.project_roles ON DELETE CASCADE,embedding vector(384) NOT NULL,source_hash text NOT NULL,model text NOT NULL,version text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX profile_vector_idx ON public.profile_embeddings USING hnsw(embedding vector_cosine_ops);
CREATE INDEX project_vector_idx ON public.project_embeddings USING hnsw(embedding vector_cosine_ops);
CREATE INDEX role_vector_idx ON public.role_embeddings USING hnsw(embedding vector_cosine_ops);
CREATE TABLE public.applications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects,role_id uuid,applicant_id uuid NOT NULL REFERENCES public.profiles,message text NOT NULL DEFAULT '',cosine double precision NOT NULL,coverage double precision NOT NULL,final_score double precision NOT NULL,band text NOT NULL CHECK(band IN ('STRONG','MODERATE','WEAK')),breakdown jsonb NOT NULL,status text NOT NULL CHECK(status IN ('pending','approved','rejected','withdrawn')),decided_by text NOT NULL,decided_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(role_id,project_id) REFERENCES public.project_roles(id,project_id),UNIQUE NULLS NOT DISTINCT(applicant_id,project_id,role_id));
CREATE INDEX applications_project_idx ON public.applications(project_id);
CREATE TABLE public.invitations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),project_id uuid NOT NULL REFERENCES public.projects,role_id uuid,inviter_id uuid NOT NULL REFERENCES public.profiles,invitee_id uuid NOT NULL REFERENCES public.profiles,message text NOT NULL DEFAULT '',cosine double precision NOT NULL,coverage double precision NOT NULL,final_score double precision NOT NULL,band text NOT NULL CHECK(band IN ('STRONG','MODERATE','WEAK')),breakdown jsonb NOT NULL,status text NOT NULL CHECK(status IN ('pending','accepted','declined','cancelled')),decided_by text NOT NULL,decided_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(role_id,project_id) REFERENCES public.project_roles(id,project_id),UNIQUE NULLS NOT DISTINCT(invitee_id,project_id,role_id));
CREATE INDEX invitations_invitee_idx ON public.invitations(invitee_id);
CREATE TABLE public.project_members(project_id uuid REFERENCES public.projects,user_id uuid REFERENCES public.profiles,role_id uuid,joined_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(project_id,user_id),FOREIGN KEY(role_id,project_id) REFERENCES public.project_roles(id,project_id));
CREATE INDEX members_user_idx ON public.project_members(user_id);
CREATE TABLE public.match_settings(id boolean PRIMARY KEY DEFAULT true CHECK(id),settings jsonb NOT NULL);
CREATE TABLE public.rate_limits(key text PRIMARY KEY,window_start timestamptz NOT NULL,hits integer NOT NULL);

CREATE FUNCTION public.verified_user() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT id FROM auth.users WHERE id=auth.uid() AND email_verified=true $$;
CREATE FUNCTION public.owns_project(p uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ SELECT EXISTS(SELECT 1 FROM public.projects WHERE id=p AND owner_id=public.verified_user()) $$;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['profiles','skills','profile_skills','projects','project_roles','project_role_skills','profile_embeddings','project_embeddings','role_embeddings','applications','invitations','project_members','match_settings','rate_limits'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 END LOOP;
END $$;
-- Deliberately no direct client DML: atomic server saves maintain vector consistency.
GRANT SELECT ON public.profiles,public.skills,public.profile_skills,public.projects,public.project_roles,public.project_role_skills,public.applications,public.invitations,public.project_members TO authenticated;
CREATE POLICY profile_read ON public.profiles FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL);
CREATE POLICY taxonomy_read ON public.skills FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL);
CREATE POLICY profile_skills_read ON public.profile_skills FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL);
CREATE POLICY projects_read ON public.projects FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL);
CREATE POLICY roles_read ON public.project_roles FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL);
CREATE POLICY role_skills_read ON public.project_role_skills FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL);
CREATE POLICY application_read ON public.applications FOR SELECT TO authenticated USING(applicant_id=public.verified_user() OR public.owns_project(project_id));
CREATE POLICY invitation_read ON public.invitations FOR SELECT TO authenticated USING(invitee_id=public.verified_user() OR inviter_id=public.verified_user());
CREATE POLICY team_read ON public.project_members FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL);

CREATE FUNCTION public.match_breakdown(p_user uuid,p_project uuid,p_role uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u public.profile_embeddings; e vector(384); m text; v text; c double precision; cov double precision; cs double precision; fs double precision; cfg jsonb; cal jsonb; matched text[]; missing text[];
BEGIN
 SELECT * INTO u FROM public.profile_embeddings WHERE profile_id=p_user;
 IF p_role IS NULL THEN SELECT embedding,model,version INTO e,m,v FROM public.project_embeddings WHERE project_id=p_project;
 ELSE SELECT re.embedding,re.model,re.version INTO e,m,v FROM public.role_embeddings re JOIN public.project_roles r ON r.id=re.role_id WHERE r.id=p_role AND r.project_id=p_project; END IF;
 IF u.embedding IS NULL OR e IS NULL OR u.model<>m OR u.version<>v THEN RETURN NULL; END IF;
 SELECT coalesce(array_agg(s.name ORDER BY s.name) FILTER(WHERE ps.skill_id IS NOT NULL),'{}'),coalesce(array_agg(s.name ORDER BY s.name) FILTER(WHERE ps.skill_id IS NULL),'{}') INTO matched,missing
 FROM public.project_role_skills rs JOIN public.skills s ON s.id=rs.skill_id LEFT JOIN public.profile_skills ps ON ps.skill_id=rs.skill_id AND ps.profile_id=p_user WHERE rs.role_id=p_role AND rs.importance='required';
 cov=CASE WHEN cardinality(matched)+cardinality(missing)=0 THEN 1 ELSE cardinality(matched)::float/(cardinality(matched)+cardinality(missing)) END;
 c=1-(u.embedding <=> e);SELECT settings INTO cfg FROM public.match_settings WHERE id=true;cal=cfg->'calibration'->m;
 IF cal IS NULL THEN RAISE EXCEPTION 'Matching configuration missing'; END IF;
 cs=greatest(0,least(1,(c-(cal->>'low')::float)/((cal->>'high')::float-(cal->>'low')::float)))*100;
 fs=CASE WHEN cfg->>'mode'='cosine_only' THEN cs ELSE (cfg->>'cosineWeight')::float*cs+(cfg->>'coverageWeight')::float*cov*100 END;
 RETURN jsonb_build_object('cosine',c,'cosine_score',cs,'coverage',cov,'final_score',fs,'band',CASE WHEN fs>=(cfg->>'strong')::float THEN 'STRONG' WHEN fs>=(cfg->>'moderate')::float THEN 'MODERATE' ELSE 'WEAK' END,'matched_skills',matched,'missing_skills',missing,'model',m,'version',v);
END $$;

CREATE FUNCTION public.match_projects_for_user(p_user uuid,p_limit int DEFAULT 12,p_cursor jsonb DEFAULT NULL,p_search text DEFAULT '',p_skill text DEFAULT '',p_role text DEFAULT '',p_commitment text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_user IS DISTINCT FROM public.verified_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND onboarding_complete) THEN RAISE EXCEPTION 'Finish onboarding'; END IF;
 WITH ranked AS (
 SELECT p.*,l.display_name lead_name,r.id role_id,r.title role_title,r.slots,r.filled_count,public.match_breakdown(p_user,p.id,r.id) breakdown
 FROM public.projects p JOIN public.profiles l ON l.id=p.owner_id
 LEFT JOIN public.project_roles r ON r.project_id=p.id
 WHERE p.status='open' AND p.owner_id<>p_user AND (r.id IS NULL OR r.filled_count<r.slots)
 AND (SELECT count(*) FROM public.project_members pm WHERE pm.project_id=p.id)<p.team_size-1
 AND (p_search='' OR p.title ILIKE '%'||p_search||'%' OR p.description ILIKE '%'||p_search||'%')
 AND (p_commitment='' OR p.commitment=p_commitment)
 AND (p_role='' OR r.title ILIKE '%'||p_role||'%')
 AND (p_skill='' OR EXISTS(SELECT 1 FROM public.project_role_skills rs JOIN public.skills s ON s.id=rs.skill_id WHERE rs.role_id=r.id AND s.name ILIKE '%'||p_skill||'%'))
 ), best AS (SELECT DISTINCT ON(id) * FROM ranked WHERE breakdown IS NOT NULL ORDER BY id,(breakdown->>'final_score')::float DESC,role_id), page AS (
 SELECT * FROM best WHERE p_cursor IS NULL OR ((breakdown->>'final_score')::float,id)<((p_cursor->>'score')::float,(p_cursor->>'id')::uuid)
 ORDER BY (breakdown->>'final_score')::float DESC,id DESC LIMIT greatest(1,least(p_limit,30))
 ) SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY (breakdown->>'final_score')::float DESC,id DESC),'[]') INTO result FROM page;
 RETURN result;
END $$;
CREATE FUNCTION public.project_matches(p_project uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u uuid=public.verified_user(); result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('role_id',r.id,'breakdown',public.match_breakdown(u,p_project,r.id))),'[]') INTO result FROM public.project_roles r WHERE project_id=p_project;
 IF jsonb_array_length(result)=0 THEN result=jsonb_build_array(jsonb_build_object('role_id',NULL,'breakdown',public.match_breakdown(u,p_project,NULL))); END IF;RETURN result;
END $$;
CREATE FUNCTION public.match_candidates_for_role(p_role uuid,p_limit int DEFAULT 30) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE pid uuid; result jsonb;
BEGIN
 SELECT project_id INTO pid FROM public.project_roles WHERE id=p_role;
 IF NOT public.owns_project(pid) THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') INTO result FROM (
 SELECT p.id,p.display_name,p.headline,p.avatar_url,p.is_demo,public.match_breakdown(p.id,pid,p_role) breakdown
 FROM public.profiles p JOIN public.profile_embeddings e ON e.profile_id=p.id JOIN public.role_embeddings r ON r.role_id=p_role AND r.model=e.model AND r.version=e.version
 WHERE p.is_member AND p.onboarding_complete AND p.id<>public.verified_user() AND NOT EXISTS(SELECT 1 FROM public.project_members m WHERE m.project_id=pid AND m.user_id=p.id)
 ORDER BY e.embedding <=> r.embedding,p.id LIMIT greatest(1,least(p_limit,100))) q;
 RETURN result;
END $$;

-- The following RPCs are service-only. Actor comes from a verified server session.
CREATE FUNCTION public.check_actor(actor uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=actor AND email_verified) THEN RAISE EXCEPTION 'Verified account required'; END IF; END $$;
CREATE FUNCTION public.consume_rate(p_key text,p_limit int,p_seconds int) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ DECLARE n int; BEGIN
 INSERT INTO public.rate_limits VALUES(p_key,now(),1) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN rate_limits.window_start<now()-make_interval(secs=>p_seconds) THEN 1 ELSE rate_limits.hits+1 END,window_start=CASE WHEN rate_limits.window_start<now()-make_interval(secs=>p_seconds) THEN now() ELSE rate_limits.window_start END RETURNING hits INTO n;
 DELETE FROM public.rate_limits WHERE window_start<now()-interval '1 day';RETURN n<=p_limit;END $$;
CREATE FUNCTION public.save_profile(actor uuid,body jsonb,vec jsonb,expected_revision int) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE current_revision int; s jsonb;
BEGIN
 PERFORM public.check_actor(actor);PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
 SELECT revision INTO current_revision FROM public.profiles WHERE id=actor FOR UPDATE;
 IF coalesce(current_revision,0)<>expected_revision THEN RAISE EXCEPTION 'Profile changed. Reload and retry.';END IF;
 INSERT INTO public.profiles(id,display_name,headline,bio,university,interests,avatar_url,avatar_key,is_member,is_team_lead,onboarding_complete) VALUES(actor,body->>'display_name',body->>'headline',body->>'bio',body->>'university',body->>'interests',body->>'avatar_url',body->>'avatar_key',(body->>'is_member')::boolean,(body->>'is_team_lead')::boolean,true)
 ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,headline=excluded.headline,bio=excluded.bio,university=excluded.university,interests=excluded.interests,avatar_url=excluded.avatar_url,avatar_key=excluded.avatar_key,is_member=excluded.is_member,is_team_lead=excluded.is_team_lead,onboarding_complete=true,revision=profiles.revision+1,updated_at=now();
 DELETE FROM public.profile_skills WHERE profile_id=actor;
 FOR s IN SELECT * FROM jsonb_array_elements(body->'skills') LOOP INSERT INTO public.profile_skills VALUES(actor,(s->>'id')::uuid,s->>'proficiency');END LOOP;
 IF vec IS NOT NULL THEN INSERT INTO public.profile_embeddings VALUES(actor,(vec->>'embedding')::vector,vec->>'source_hash',vec->>'model',vec->>'version',now()) ON CONFLICT(profile_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now();END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profile_embeddings WHERE profile_id=actor) THEN RAISE EXCEPTION 'Embedding is required';END IF;
 RETURN actor;
END $$;
CREATE FUNCTION public.save_project(actor uuid,body jsonb,vec jsonb,expected_revision int) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE pid uuid=(body->>'id')::uuid; r jsonb; s jsonb; rid uuid; current_revision int; owner uuid; rv jsonb;
BEGIN
 PERFORM public.check_actor(actor);
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_team_lead AND onboarding_complete) THEN RAISE EXCEPTION 'Enable team lead in your profile first';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(pid::text,0));SELECT revision,owner_id INTO current_revision,owner FROM public.projects WHERE id=pid FOR UPDATE;
 IF owner IS NOT NULL AND owner<>actor THEN RAISE EXCEPTION 'Forbidden';END IF;
 IF coalesce(current_revision,0)<>expected_revision THEN RAISE EXCEPTION 'Project changed. Reload and retry.';END IF;
 IF (SELECT count(*) FROM public.project_members WHERE project_id=pid)>(body->>'team_size')::int-1 THEN RAISE EXCEPTION 'Team size is smaller than the existing team';END IF;
 INSERT INTO public.projects(id,owner_id,title,description,category,tags,commitment,duration,team_size,status,auto_approve_strong_matches) VALUES(pid,actor,body->>'title',body->>'description',body->>'category',ARRAY(SELECT jsonb_array_elements_text(body->'tags')),body->>'commitment',body->>'duration',(body->>'team_size')::int,body->>'status',(body->>'auto_approve_strong_matches')::boolean)
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,tags=excluded.tags,commitment=excluded.commitment,duration=excluded.duration,team_size=excluded.team_size,status=excluded.status,auto_approve_strong_matches=excluded.auto_approve_strong_matches,revision=projects.revision+1,updated_at=now();
 -- Removing a role with application/invitation history is rejected by its foreign key.
 DELETE FROM public.project_roles WHERE project_id=pid AND id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(body->'roles') x);
 FOR r IN SELECT * FROM jsonb_array_elements(body->'roles') LOOP
 rid=(r->>'id')::uuid;
 IF EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id<>pid) THEN RAISE EXCEPTION 'Role belongs to a different project';END IF;
 INSERT INTO public.project_roles(id,project_id,title,description,slots) VALUES(rid,pid,r->>'title',r->>'description',(r->>'slots')::int) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,slots=excluded.slots;
 DELETE FROM public.project_role_skills WHERE role_id=rid;
 FOR s IN SELECT * FROM jsonb_array_elements(r->'skills') LOOP INSERT INTO public.project_role_skills VALUES(rid,(s->>'id')::uuid,s->>'importance');END LOOP;
 rv=r->'vector';IF rv IS NOT NULL AND rv<>'null'::jsonb THEN INSERT INTO public.role_embeddings VALUES(rid,(rv->>'embedding')::vector,rv->>'source_hash',rv->>'model',rv->>'version',now()) ON CONFLICT(role_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now();END IF;
 END LOOP;
 IF vec IS NOT NULL THEN INSERT INTO public.project_embeddings VALUES(pid,(vec->>'embedding')::vector,vec->>'source_hash',vec->>'model',vec->>'version',now()) ON CONFLICT(project_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now();END IF;
 RETURN pid;
END $$;
CREATE FUNCTION public.has_capacity(pid uuid,rid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
 SELECT (SELECT count(*) FROM public.project_members WHERE project_id=pid)<(SELECT team_size-1 FROM public.projects WHERE id=pid) AND (rid IS NULL OR EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id=pid AND filled_count<slots));
$$;
CREATE FUNCTION public.add_member(pid uuid,uid uuid,rid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 PERFORM 1 FROM public.projects WHERE id=pid FOR UPDATE;
 IF NOT public.has_capacity(pid,rid) THEN RAISE EXCEPTION 'This team or role is full';END IF;
 INSERT INTO public.project_members VALUES(pid,uid,rid,now());
 IF rid IS NOT NULL THEN UPDATE public.project_roles SET filled_count=filled_count+1 WHERE id=rid;END IF;
END $$;
CREATE FUNCTION public.submit_match(actor uuid,pid uuid,rid uuid,kind text,target uuid DEFAULT NULL,note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; uid uuid; b jsonb; st text; result_id uuid; prior text;
BEGIN
 PERFORM public.check_actor(actor);SELECT * INTO p FROM public.projects WHERE id=pid FOR UPDATE;
 IF p.id IS NULL OR p.status<>'open' THEN RAISE EXCEPTION 'Project is not open';END IF;
 IF kind='apply' THEN uid=actor;IF actor=p.owner_id THEN RAISE EXCEPTION 'You already lead this project';END IF;
 ELSIF kind='invite' THEN uid=target;IF p.owner_id<>actor OR target=actor THEN RAISE EXCEPTION 'Forbidden';END IF;
 ELSE RAISE EXCEPTION 'Unknown action';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=uid AND is_member AND onboarding_complete) THEN RAISE EXCEPTION 'A completed member profile is required';END IF;
 IF EXISTS(SELECT 1 FROM public.project_members WHERE project_id=pid AND user_id=uid) THEN RAISE EXCEPTION 'Already on this team';END IF;
 IF rid IS NULL AND EXISTS(SELECT 1 FROM public.project_roles WHERE project_id=pid) THEN RAISE EXCEPTION 'Choose a role';END IF;
 IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id=pid) THEN RAISE EXCEPTION 'Invalid role';END IF;
 b=public.match_breakdown(uid,pid,rid);IF b IS NULL THEN RAISE EXCEPTION 'Matching is updating. Save your profile and retry.';END IF;
 IF b->>'band'='WEAK' THEN RETURN jsonb_build_object('blocked',true,'breakdown',b,'message','This match needs more alignment. Develop the missing skills before applying.');END IF;
 IF kind='apply' THEN
 SELECT status INTO prior FROM public.applications WHERE applicant_id=uid AND project_id=pid AND role_id IS NOT DISTINCT FROM rid;
 IF prior IN('pending','approved') THEN RAISE EXCEPTION 'Application already exists';END IF;
 st=CASE WHEN b->>'band'='STRONG' AND p.auto_approve_strong_matches AND public.has_capacity(pid,rid) THEN 'approved' ELSE 'pending' END;
 INSERT INTO public.applications(project_id,role_id,applicant_id,message,cosine,coverage,final_score,band,breakdown,status,decided_by,decided_at) VALUES(pid,rid,uid,note,(b->>'cosine')::float,(b->>'coverage')::float,(b->>'final_score')::float,b->>'band',b,st,'system',CASE WHEN st='approved' THEN now() END)
 ON CONFLICT(applicant_id,project_id,role_id) DO UPDATE SET message=excluded.message,cosine=excluded.cosine,coverage=excluded.coverage,final_score=excluded.final_score,band=excluded.band,breakdown=excluded.breakdown,status=excluded.status,decided_by='system',decided_at=excluded.decided_at,created_at=now() RETURNING id INTO result_id;
 IF st='approved' THEN PERFORM public.add_member(pid,uid,rid);END IF;
 ELSE
 SELECT status INTO prior FROM public.invitations WHERE invitee_id=uid AND project_id=pid AND role_id IS NOT DISTINCT FROM rid;
 IF prior IN('pending','accepted') THEN RAISE EXCEPTION 'Invitation already exists';END IF;
 st='pending';INSERT INTO public.invitations(project_id,role_id,inviter_id,invitee_id,message,cosine,coverage,final_score,band,breakdown,status,decided_by) VALUES(pid,rid,actor,uid,note,(b->>'cosine')::float,(b->>'coverage')::float,(b->>'final_score')::float,b->>'band',b,st,actor::text)
 ON CONFLICT(invitee_id,project_id,role_id) DO UPDATE SET message=excluded.message,cosine=excluded.cosine,coverage=excluded.coverage,final_score=excluded.final_score,band=excluded.band,breakdown=excluded.breakdown,status='pending',decided_by=actor::text,decided_at=NULL,created_at=now() RETURNING id INTO result_id;
 END IF;
 RETURN jsonb_build_object('id',result_id,'status',st,'breakdown',b);
END $$;
CREATE FUNCTION public.respond_match(actor uuid,record_id uuid,kind text,decision text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE pid uuid; rid uuid; uid uuid; st text; owner uuid; project_status text;
BEGIN
 PERFORM public.check_actor(actor);
 IF kind='application' THEN SELECT project_id INTO pid FROM public.applications WHERE id=record_id;ELSE SELECT project_id INTO pid FROM public.invitations WHERE id=record_id;END IF;
 SELECT owner_id,status INTO owner,project_status FROM public.projects WHERE id=pid FOR UPDATE;
 IF pid IS NULL THEN RAISE EXCEPTION 'Not found';END IF;
 IF kind='application' THEN
 SELECT role_id,applicant_id,status INTO rid,uid,st FROM public.applications WHERE id=record_id FOR UPDATE;
 IF st<>'pending' THEN RAISE EXCEPTION 'Only pending applications can change';END IF;
 IF decision='withdrawn' THEN IF actor<>uid THEN RAISE EXCEPTION 'Forbidden';END IF;
 ELSIF decision IN('approved','rejected') THEN IF actor<>owner THEN RAISE EXCEPTION 'Forbidden';END IF;
 ELSE RAISE EXCEPTION 'Invalid decision';END IF;
 IF decision='approved' THEN IF project_status<>'open' THEN RAISE EXCEPTION 'Project is closed';END IF;PERFORM public.add_member(pid,uid,rid);END IF;
 UPDATE public.applications SET status=decision,decided_by=actor::text,decided_at=now() WHERE id=record_id;
 ELSIF kind='invitation' THEN
 SELECT role_id,invitee_id,status INTO rid,uid,st FROM public.invitations WHERE id=record_id FOR UPDATE;
 IF st<>'pending' THEN RAISE EXCEPTION 'Only pending invitations can change';END IF;
 IF decision='cancelled' THEN IF actor<>owner THEN RAISE EXCEPTION 'Forbidden';END IF;
 ELSIF decision IN('accepted','declined') THEN IF actor<>uid THEN RAISE EXCEPTION 'Forbidden';END IF;
 ELSE RAISE EXCEPTION 'Invalid decision';END IF;
 IF decision='accepted' THEN IF project_status<>'open' THEN RAISE EXCEPTION 'Project is closed';END IF;PERFORM public.add_member(pid,uid,rid);END IF;
 UPDATE public.invitations SET status=decision,decided_by=actor::text,decided_at=now() WHERE id=record_id;
 ELSE RAISE EXCEPTION 'Invalid kind';END IF;
 RETURN jsonb_build_object('status',decision);
END $$;
-- Explicitly remove PostgreSQL's default PUBLIC execute access to privileged routines.
DO $$ DECLARE f record;BEGIN FOR f IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname IN('match_breakdown','check_actor','consume_rate','save_profile','save_project','has_capacity','add_member','submit_match','respond_match') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO project_admin',f.sig);END LOOP;END $$;
REVOKE ALL ON FUNCTION public.match_projects_for_user(uuid,int,jsonb,text,text,text,text),public.project_matches(uuid),public.match_candidates_for_role(uuid,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.match_projects_for_user(uuid,int,jsonb,text,text,text,text),public.project_matches(uuid),public.match_candidates_for_role(uuid,int) TO authenticated;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE POLICY meridian_avatar_read ON storage.objects FOR SELECT TO authenticated USING(bucket='avatars');
CREATE POLICY meridian_avatar_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket='avatars' AND uploaded_by=(SELECT auth.jwt()->>'sub') AND (storage.foldername(key))[1]=(SELECT auth.jwt()->>'sub'));
CREATE POLICY meridian_avatar_update ON storage.objects FOR UPDATE TO authenticated USING(bucket='avatars' AND uploaded_by=(SELECT auth.jwt()->>'sub')) WITH CHECK(bucket='avatars' AND uploaded_by=(SELECT auth.jwt()->>'sub') AND (storage.foldername(key))[1]=(SELECT auth.jwt()->>'sub'));
CREATE POLICY meridian_avatar_delete ON storage.objects FOR DELETE TO authenticated USING(bucket='avatars' AND uploaded_by=(SELECT auth.jwt()->>'sub'));
GRANT SELECT,INSERT,UPDATE,DELETE ON storage.objects TO authenticated;
