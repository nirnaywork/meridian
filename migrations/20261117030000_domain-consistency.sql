-- Canonical v3 migration. Existing domain choices remain untouched.
-- The array is authoritative; a single trigger maintains all three joins.
CREATE OR REPLACE FUNCTION public.sync_domain_choices() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE join_table text; parent_key text;
BEGIN
 IF EXISTS(SELECT 1 FROM unnest(NEW.domains) AS chosen(name) WHERE NOT EXISTS(SELECT 1 FROM public.domains d WHERE d.name=chosen.name)) THEN RAISE EXCEPTION 'Unknown domain';END IF;
 IF TG_TABLE_NAME='profiles' THEN join_table='profile_domains';parent_key='profile_id';
 ELSIF TG_TABLE_NAME='projects' THEN join_table='project_domains';parent_key='project_id';
 ELSIF TG_TABLE_NAME='project_roles' THEN join_table='role_domains';parent_key='role_id';
 ELSE RAISE EXCEPTION 'Unsupported domain parent';END IF;
 EXECUTE format('DELETE FROM public.%I WHERE %I=$1',join_table,parent_key) USING NEW.id;
 EXECUTE format('INSERT INTO public.%I(%I,domain_id) SELECT $1,id FROM public.domains WHERE name=ANY($2)',join_table,parent_key) USING NEW.id,NEW.domains;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.sync_domain_choices() FROM PUBLIC,authenticated;
CREATE TRIGGER sync_profile_domains AFTER INSERT OR UPDATE OF domains ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_domain_choices();
CREATE TRIGGER sync_project_domains AFTER INSERT OR UPDATE OF domains ON public.projects FOR EACH ROW EXECUTE FUNCTION public.sync_domain_choices();
CREATE TRIGGER sync_role_domains AFTER INSERT OR UPDATE OF domains ON public.project_roles FOR EACH ROW EXECUTE FUNCTION public.sync_domain_choices();
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
 UPDATE public.profiles SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(body->'domains','[]'))) WHERE id=actor; RETURN actor;
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
 UPDATE public.project_roles SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(r->'domains',body->'domains','[]'))) WHERE id=rid; DELETE FROM public.project_role_skills WHERE role_id=rid;
 FOR s IN SELECT * FROM jsonb_array_elements(r->'skills') LOOP INSERT INTO public.project_role_skills VALUES(rid,(s->>'id')::uuid,s->>'importance');END LOOP;
 rv=r->'vector';IF rv IS NOT NULL AND rv<>'null'::jsonb THEN INSERT INTO public.role_embeddings(role_id,embedding,source_hash,model,version,updated_at,trace) VALUES(rid,(rv->>'embedding')::vector,rv->>'source_hash',rv->>'model',rv->>'version',now(),rv->'trace') ON CONFLICT(role_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now(),trace=excluded.trace;END IF;
 END LOOP;
 IF vec IS NOT NULL THEN INSERT INTO public.project_embeddings(project_id,embedding,source_hash,model,version,updated_at,trace) VALUES(pid,(vec->>'embedding')::vector,vec->>'source_hash',vec->>'model',vec->>'version',now(),vec->'trace') ON CONFLICT(project_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now(),trace=excluded.trace;END IF;
 UPDATE public.projects SET domains=ARRAY(SELECT jsonb_array_elements_text(coalesce(body->'domains','[]'))) WHERE id=pid; RETURN pid;
END $$;

