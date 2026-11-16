-- Keep the previous deployed app working until the percentage build is live.
CREATE OR REPLACE FUNCTION public.project_matches(p_project uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE u uuid=public.verified_user(); result jsonb;
BEGIN
 IF u IS NULL THEN RAISE EXCEPTION 'Forbidden'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('role_id',r.id,'breakdown',public.match_breakdown(u,p_project,r.id))),'[]') INTO result FROM public.project_roles r WHERE project_id=p_project;
 result=result || jsonb_build_array(jsonb_build_object('role_id',NULL,'breakdown',public.match_breakdown(u,p_project,NULL))); RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.project_matches(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.project_matches(uuid) TO authenticated;
