-- Change set 1. Preserve existing skill IDs and historical cosine snapshots.
CREATE TABLE public.fields(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,slug text UNIQUE NOT NULL);
CREATE TABLE public.domains(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),field_id uuid REFERENCES public.fields,name text NOT NULL,slug text UNIQUE NOT NULL,description text NOT NULL,icon text);
ALTER TABLE public.skills ADD COLUMN field_id uuid REFERENCES public.fields;
CREATE TABLE public.skill_domains(skill_id uuid REFERENCES public.skills,domain_id uuid REFERENCES public.domains,PRIMARY KEY(skill_id,domain_id));
CREATE TABLE public.profile_domains(profile_id uuid REFERENCES public.profiles,domain_id uuid REFERENCES public.domains,PRIMARY KEY(profile_id,domain_id));
CREATE TABLE public.project_domains(project_id uuid REFERENCES public.projects,domain_id uuid REFERENCES public.domains,PRIMARY KEY(project_id,domain_id));
CREATE TABLE public.role_domains(role_id uuid REFERENCES public.project_roles,domain_id uuid REFERENCES public.domains,PRIMARY KEY(role_id,domain_id));
CREATE TABLE public.role_templates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),domain_id uuid REFERENCES public.domains,title text NOT NULL,slug text UNIQUE NOT NULL,required_skills text[] NOT NULL);
ALTER TABLE public.profiles ADD COLUMN domains text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.projects ADD COLUMN domains text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.project_roles ADD COLUMN domains text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.profile_embeddings ADD COLUMN trace jsonb;
ALTER TABLE public.project_embeddings ADD COLUMN trace jsonb;
ALTER TABLE public.role_embeddings ADD COLUMN trace jsonb;
GRANT SELECT ON public.profile_embeddings,public.project_embeddings,public.role_embeddings TO authenticated;
CREATE POLICY own_embedding ON public.profile_embeddings FOR SELECT TO authenticated USING(profile_id=public.verified_user());
CREATE POLICY project_embedding_read ON public.project_embeddings FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL);
CREATE POLICY role_embedding_read ON public.role_embeddings FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL);
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['fields','domains','skill_domains','profile_domains','project_domains','role_domains','role_templates'] LOOP
EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
EXECUTE format('CREATE POLICY signed_in_read ON public.%I FOR SELECT TO authenticated USING(public.verified_user() IS NOT NULL)',t);
END LOOP; END $$;
DROP FUNCTION public.match_projects_for_user(uuid,int,jsonb,text,text,text,text);
DROP TABLE public.match_settings;
ALTER TABLE public.projects DROP COLUMN auto_approve_strong_matches;
ALTER TABLE public.applications DROP COLUMN coverage,DROP COLUMN final_score,DROP COLUMN band,ALTER COLUMN cosine DROP NOT NULL;
ALTER TABLE public.invitations DROP COLUMN coverage,DROP COLUMN final_score,DROP COLUMN band,ALTER COLUMN cosine DROP NOT NULL;
UPDATE public.applications SET breakdown=breakdown-'coverage'-'final_score'-'band'-'cosine_score';
UPDATE public.invitations SET breakdown=breakdown-'coverage'-'final_score'-'band'-'cosine_score';
CREATE OR REPLACE FUNCTION public.save_profile(actor uuid,body jsonb,vec jsonb,expected_revision int) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE current_revision int; s jsonb;
BEGIN
 PERFORM public.check_actor(actor);PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
 SELECT revision INTO current_revision FROM public.profiles WHERE id=actor FOR UPDATE;
 IF coalesce(current_revision,0)<>expected_revision THEN RAISE EXCEPTION 'Profile changed. Reload and retry.';END IF;
 INSERT INTO public.profiles(id,display_name,headline,bio,university,interests,avatar_url,avatar_key,is_member,is_team_lead,onboarding_complete) VALUES(actor,body->>'display_name',body->>'headline',body->>'bio',body->>'university',body->>'interests',body->>'avatar_url',body->>'avatar_key',(body->>'is_member')::boolean,(body->>'is_team_lead')::boolean,coalesce((body->>'onboarding_complete')::boolean,true))
 ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,headline=excluded.headline,bio=excluded.bio,university=excluded.university,interests=excluded.interests,avatar_url=excluded.avatar_url,avatar_key=excluded.avatar_key,is_member=excluded.is_member,is_team_lead=excluded.is_team_lead,onboarding_complete=excluded.onboarding_complete,revision=profiles.revision+1,updated_at=now();
 DELETE FROM public.profile_skills WHERE profile_id=actor;
 FOR s IN SELECT * FROM jsonb_array_elements(body->'skills') LOOP INSERT INTO public.profile_skills VALUES(actor,(s->>'id')::uuid,s->>'proficiency');END LOOP;
 IF vec IS NOT NULL THEN INSERT INTO public.profile_embeddings(profile_id,embedding,source_hash,model,version,updated_at,trace) VALUES(actor,(vec->>'embedding')::vector,vec->>'source_hash',vec->>'model',vec->>'version',now(),vec->'trace') ON CONFLICT(profile_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now(),trace=excluded.trace;END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profile_embeddings WHERE profile_id=actor) THEN RAISE EXCEPTION 'Embedding is required';END IF;
 UPDATE public.profiles SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(body->'domains','[]'))) WHERE id=actor; DELETE FROM public.profile_domains WHERE profile_id=actor; INSERT INTO public.profile_domains SELECT actor,id FROM public.domains WHERE name=ANY(ARRAY(SELECT jsonb_array_elements_text(coalesce(body->'domains','[]')))); RETURN actor;
END $$;

CREATE OR REPLACE FUNCTION public.save_project(actor uuid,body jsonb,vec jsonb,expected_revision int) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE pid uuid=(body->>'id')::uuid; r jsonb; s jsonb; rid uuid; current_revision int; owner uuid; rv jsonb;
BEGIN
 PERFORM public.check_actor(actor);
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=actor AND is_team_lead AND onboarding_complete) THEN RAISE EXCEPTION 'Enable team lead in your profile first';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(pid::text,0));SELECT revision,owner_id INTO current_revision,owner FROM public.projects WHERE id=pid FOR UPDATE;
 IF owner IS NOT NULL AND owner<>actor THEN RAISE EXCEPTION 'Forbidden';END IF;
 IF coalesce(current_revision,0)<>expected_revision THEN RAISE EXCEPTION 'Project changed. Reload and retry.';END IF;
 IF (SELECT count(*) FROM public.project_members WHERE project_id=pid)>(body->>'team_size')::int-1 THEN RAISE EXCEPTION 'Team size is smaller than the existing team';END IF;
 INSERT INTO public.projects(id,owner_id,title,description,category,tags,commitment,duration,team_size,status) VALUES(pid,actor,body->>'title',body->>'description',body->>'category',ARRAY(SELECT jsonb_array_elements_text(body->'tags')),body->>'commitment',body->>'duration',(body->>'team_size')::int,body->>'status')
 ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,category=excluded.category,tags=excluded.tags,commitment=excluded.commitment,duration=excluded.duration,team_size=excluded.team_size,status=excluded.status,revision=projects.revision+1,updated_at=now();
 -- Removing a role with application/invitation history is rejected by its foreign key.
 DELETE FROM public.project_roles WHERE project_id=pid AND id NOT IN(SELECT (x->>'id')::uuid FROM jsonb_array_elements(body->'roles') x);
 FOR r IN SELECT * FROM jsonb_array_elements(body->'roles') LOOP
 rid=(r->>'id')::uuid;
 IF EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id<>pid) THEN RAISE EXCEPTION 'Role belongs to a different project';END IF;
 INSERT INTO public.project_roles(id,project_id,title,description,slots) VALUES(rid,pid,r->>'title',r->>'description',(r->>'slots')::int) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,slots=excluded.slots;
 UPDATE public.project_roles SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'domains',body->'domains','[]'))) WHERE id=rid; DELETE FROM public.role_domains WHERE role_id=rid; INSERT INTO public.role_domains SELECT rid,id FROM public.domains WHERE name=ANY(ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'domains',body->'domains','[]')))); DELETE FROM public.project_role_skills WHERE role_id=rid;
 FOR s IN SELECT * FROM jsonb_array_elements(r->'skills') LOOP INSERT INTO public.project_role_skills VALUES(rid,(s->>'id')::uuid,s->>'importance');END LOOP;
 rv=r->'vector';IF rv IS NOT NULL AND rv<>'null'::jsonb THEN INSERT INTO public.role_embeddings(role_id,embedding,source_hash,model,version,updated_at,trace) VALUES(rid,(rv->>'embedding')::vector,rv->>'source_hash',rv->>'model',rv->>'version',now(),rv->'trace') ON CONFLICT(role_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now(),trace=excluded.trace;END IF;
 END LOOP;
 IF vec IS NOT NULL THEN INSERT INTO public.project_embeddings(project_id,embedding,source_hash,model,version,updated_at,trace) VALUES(pid,(vec->>'embedding')::vector,vec->>'source_hash',vec->>'model',vec->>'version',now(),vec->'trace') ON CONFLICT(project_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now(),trace=excluded.trace;END IF;
 UPDATE public.projects SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(body->'domains','[]'))) WHERE id=pid; DELETE FROM public.project_domains WHERE project_id=pid; INSERT INTO public.project_domains SELECT pid,id FROM public.domains WHERE name=ANY(ARRAY(SELECT jsonb_array_elements_text(coalesce(body->'domains','[]')))); RETURN pid;
END $$;
CREATE OR REPLACE FUNCTION public.match_breakdown(p_user uuid,p_project uuid,p_role uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u public.profile_embeddings; e vector(384); m text; v text; c double precision; matched text[]; missing text[];
BEGIN
 SELECT * INTO u FROM public.profile_embeddings WHERE profile_id=p_user;
 IF p_role IS NULL THEN SELECT embedding,model,version INTO e,m,v FROM public.project_embeddings WHERE project_id=p_project;
 ELSE SELECT re.embedding,re.model,re.version INTO e,m,v FROM public.role_embeddings re JOIN public.project_roles r ON r.id=re.role_id WHERE r.id=p_role AND r.project_id=p_project; END IF;
 
 SELECT coalesce(array_agg(s.name ORDER BY s.name) FILTER(WHERE ps.skill_id IS NOT NULL),'{}'),coalesce(array_agg(s.name ORDER BY s.name) FILTER(WHERE ps.skill_id IS NULL),'{}') INTO matched,missing
 FROM public.project_role_skills rs JOIN public.skills s ON s.id=rs.skill_id LEFT JOIN public.profile_skills ps ON ps.skill_id=rs.skill_id AND ps.profile_id=p_user WHERE (rs.role_id=p_role OR (p_role IS NULL AND rs.role_id IN(SELECT id FROM public.project_roles WHERE project_id=p_project))) AND rs.importance='required';
 c=CASE WHEN u.embedding IS NULL OR e IS NULL OR u.model<>m OR u.version<>v THEN NULL ELSE 1-(u.embedding <=> e) END;
 RETURN jsonb_build_object('cosine',c,'matched_skills',matched,'missing_skills',missing,'model',m,'version',v);
END $$;
CREATE OR REPLACE FUNCTION public.submit_match(actor uuid,pid uuid,rid uuid,kind text,target uuid DEFAULT NULL,note text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; uid uuid; b jsonb; st text; result_id uuid; prior text;
BEGIN
 PERFORM public.check_actor(actor);SELECT * INTO p FROM public.projects WHERE id=pid FOR UPDATE;
 IF p.id IS NULL OR p.status<>'open' THEN RAISE EXCEPTION 'Project is not open';END IF;
 IF kind='apply' THEN uid=actor;IF actor=p.owner_id THEN RAISE EXCEPTION 'You already lead this project';END IF;
 ELSIF kind='invite' THEN uid=target;IF p.owner_id<>actor OR target=actor THEN RAISE EXCEPTION 'Forbidden';END IF;
 ELSE RAISE EXCEPTION 'Unknown action';END IF;
 IF rid IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_roles WHERE id=rid AND project_id=pid) THEN RAISE EXCEPTION 'Invalid role';END IF;
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
CREATE OR REPLACE FUNCTION public.project_matches(p_project uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u uuid=public.verified_user(); result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('role_id',r.id,'breakdown',public.match_breakdown(u,p_project,r.id))),'[]') INTO result FROM public.project_roles r WHERE project_id=p_project;
 result=result || jsonb_build_array(jsonb_build_object('role_id',NULL,'breakdown',public.match_breakdown(u,p_project,NULL))); RETURN result;
END $$;
CREATE FUNCTION public.explore_projects(p_filters jsonb DEFAULT '{}',p_cursor jsonb DEFAULT NULL,p_limit int DEFAULT 12) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; u uuid=public.verified_user(); sort text=coalesce(p_filters->>'sort','newest');BEGIN
IF u IS NULL THEN RAISE EXCEPTION 'Forbidden';END IF;
WITH base AS (SELECT p.*,l.display_name lead_name,(SELECT count(*) FROM public.project_roles r WHERE r.project_id=p.id AND r.filled_count<r.slots) open_count,
(SELECT coalesce(jsonb_agg(jsonb_build_object('title',r.title,'available',r.slots-r.filled_count) ORDER BY r.title),'[]') FROM public.project_roles r WHERE r.project_id=p.id AND r.filled_count<r.slots) open_roles,
public.match_breakdown(u,p.id,NULL) breakdown FROM public.projects p JOIN public.profiles l ON l.id=p.owner_id
WHERE (coalesce(p_filters->>'status','open')='all' OR p.status=coalesce(p_filters->>'status','open'))
AND (coalesce(p_filters->>'search','')='' OR p.title||' '||p.description ILIKE '%'||(p_filters->>'search')||'%')
AND (coalesce(p_filters->>'domain','')='' OR p_filters->>'domain'=ANY(p.domains))
AND (coalesce(p_filters->>'field','')='' OR EXISTS(SELECT 1 FROM public.project_domains pd JOIN public.domains d ON d.id=pd.domain_id JOIN public.fields f ON f.id=d.field_id WHERE pd.project_id=p.id AND f.name=p_filters->>'field'))
AND (coalesce(p_filters->>'commitment','')='' OR p.commitment=p_filters->>'commitment')
AND (coalesce(p_filters->>'role','')='' OR EXISTS(SELECT 1 FROM public.project_roles r WHERE r.project_id=p.id AND r.title ILIKE '%'||(p_filters->>'role')||'%'))
AND (coalesce(p_filters->>'skill','')='' OR EXISTS(SELECT 1 FROM public.project_roles r JOIN public.project_role_skills rs ON rs.role_id=r.id JOIN public.skills s ON s.id=rs.skill_id WHERE r.project_id=p.id AND s.name ILIKE '%'||(p_filters->>'skill')||'%'))),
ordered AS (SELECT *,CASE WHEN sort='oldest' THEN -extract(epoch FROM created_at) WHEN sort='roles' THEN open_count ELSE extract(epoch FROM created_at) END sort_key FROM base),page AS (
SELECT * FROM ordered WHERE p_cursor IS NULL OR (sort_key,id)<((p_cursor->>'key')::numeric,(p_cursor->>'id')::uuid) ORDER BY sort_key DESC,id DESC LIMIT least(greatest(p_limit,1),30))
SELECT coalesce(jsonb_agg(to_jsonb(page) ORDER BY sort_key DESC,id DESC),'[]') INTO result FROM page;RETURN result;END $$;
REVOKE ALL ON FUNCTION public.explore_projects(jsonb,jsonb,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.explore_projects(jsonb,jsonb,int) TO authenticated;

CREATE FUNCTION public.viewer_similarity(pid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u uuid=public.verified_user();result jsonb;BEGIN IF u IS NULL THEN RAISE EXCEPTION 'Forbidden';END IF;
SELECT coalesce(jsonb_agg(jsonb_build_object('role_id',r.id,'cosine',(public.match_breakdown(u,pid,r.id)->>'cosine')::float)),'[]') INTO result FROM public.project_roles r WHERE r.project_id=pid;
RETURN result||jsonb_build_array(jsonb_build_object('role_id',NULL,'cosine',(public.match_breakdown(u,pid,NULL)->>'cosine')::float));END $$;
REVOKE ALL ON FUNCTION public.viewer_similarity(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.viewer_similarity(uuid) TO authenticated;
