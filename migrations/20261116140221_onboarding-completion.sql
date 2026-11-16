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
 IF vec IS NOT NULL THEN INSERT INTO public.profile_embeddings VALUES(actor,(vec->>'embedding')::vector,vec->>'source_hash',vec->>'model',vec->>'version',now()) ON CONFLICT(profile_id) DO UPDATE SET embedding=excluded.embedding,source_hash=excluded.source_hash,model=excluded.model,version=excluded.version,updated_at=now();END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profile_embeddings WHERE profile_id=actor) THEN RAISE EXCEPTION 'Embedding is required';END IF;
 RETURN actor;
END $$;
