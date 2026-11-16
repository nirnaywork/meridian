-- Parameters generated from src/lib/matching/match-calibration.json.
DROP FUNCTION public.project_matches(uuid);
-- Vectors, versions, distances and existing application cosine snapshots stay untouched.
CREATE TABLE public.match_percentage_calibration(provider text PRIMARY KEY,embedding_version text NOT NULL,c0 float8 NOT NULL,k float8 NOT NULL CHECK(k>0),calibration_version text NOT NULL);
ALTER TABLE public.match_percentage_calibration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.match_percentage_calibration FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.match_percentage_calibration TO project_admin;
INSERT INTO public.match_percentage_calibration VALUES
 ('minilm','domains-minilm-751bff37-q8-v3',0.49966375338843566,11.31196095168161,'role-percent-2026-11-v1'),
 ('hashed','domains-tfidf-v5',0.30,10,'role-percent-2026-11-v1');
ALTER TABLE public.applications ADD COLUMN match_percent int CHECK(match_percent BETWEEN 1 AND 99),ADD COLUMN calibration_version text;
ALTER TABLE public.applications ADD CONSTRAINT percentage_snapshot_pair CHECK((match_percent IS NULL)=(calibration_version IS NULL));
CREATE FUNCTION public.snapshot_application_percentage() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE cfg public.match_percentage_calibration;
BEGIN
 NEW.match_percent=NULL;NEW.calibration_version=NULL;
 SELECT * INTO cfg FROM public.match_percentage_calibration WHERE provider=NEW.breakdown->>'model' AND embedding_version=NEW.breakdown->>'version';
 IF NEW.role_id IS NOT NULL AND NEW.cosine IS NOT NULL AND cfg.provider IS NOT NULL THEN
 NEW.match_percent=round(greatest(1,least(99,100/(1+exp(-cfg.k*(NEW.cosine-cfg.c0))))))::int;
 NEW.calibration_version=cfg.calibration_version;
 END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.snapshot_application_percentage() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER application_percentage_snapshot BEFORE INSERT ON public.applications FOR EACH ROW EXECUTE FUNCTION public.snapshot_application_percentage();
UPDATE public.applications a SET match_percent=round(greatest(1,least(99,100/(1+exp(-c.k*(a.cosine-c.c0))))))::int,calibration_version=c.calibration_version FROM public.match_percentage_calibration c
WHERE a.role_id IS NOT NULL AND a.cosine IS NOT NULL AND a.breakdown->>'model'=c.provider AND a.breakdown->>'version'=c.embedding_version;

CREATE FUNCTION public.role_matches_for_viewer(p_viewer uuid,p_roles uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_viewer IS DISTINCT FROM public.verified_user() OR p_viewer IS NULL THEN RAISE EXCEPTION 'Forbidden';END IF;
 IF cardinality(p_roles)>500 THEN RAISE EXCEPTION 'Too many roles';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('role_id',r.id,'owner',p.owner_id=p_viewer,'profile_present',u.profile_id IS NOT NULL,'role_present',e.role_id IS NOT NULL,'model',e.model,'version',e.version,
 'compatible',u.model=e.model AND u.version=e.version,
 'cosine',CASE WHEN u.model=e.model AND u.version=e.version THEN 1-(u.embedding <=> e.embedding) ELSE NULL END,
 'matched_skills',coalesce(s.matched,'{}'::text[]),'missing_skills',coalesce(s.missing,'{}'::text[]))),'[]'::jsonb) INTO result
 FROM public.project_roles r JOIN public.projects p ON p.id=r.project_id
 LEFT JOIN public.profile_embeddings u ON u.profile_id=p_viewer LEFT JOIN public.role_embeddings e ON e.role_id=r.id
 LEFT JOIN LATERAL(SELECT array_agg(sk.name ORDER BY sk.name) FILTER(WHERE ps.skill_id IS NOT NULL) matched,array_agg(sk.name ORDER BY sk.name) FILTER(WHERE ps.skill_id IS NULL) missing
 FROM public.project_role_skills rs JOIN public.skills sk ON sk.id=rs.skill_id LEFT JOIN public.profile_skills ps ON ps.skill_id=rs.skill_id AND ps.profile_id=p_viewer
 WHERE rs.role_id=r.id AND rs.importance='required')s ON true WHERE r.id=ANY(p_roles);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.role_matches_for_viewer(uuid,uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.role_matches_for_viewer(uuid,uuid[]) TO authenticated;

-- Explore ordering stays neutral; no project match is computed.
CREATE OR REPLACE FUNCTION public.explore_projects(p_filters jsonb DEFAULT '{}',p_cursor jsonb DEFAULT NULL,p_limit int DEFAULT 12) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; u uuid=public.verified_user(); sort text=coalesce(p_filters->>'sort','newest');BEGIN
IF u IS NULL THEN RAISE EXCEPTION 'Forbidden';END IF;
WITH base AS (SELECT p.*,l.display_name lead_name,(SELECT count(*) FROM public.project_roles r WHERE r.project_id=p.id AND r.filled_count<r.slots) open_count,
(SELECT coalesce(jsonb_agg(jsonb_build_object('title',r.title,'available',r.slots-r.filled_count) ORDER BY r.title),'[]') FROM public.project_roles r WHERE r.project_id=p.id AND r.filled_count<r.slots) open_roles FROM public.projects p JOIN public.profiles l ON l.id=p.owner_id
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

