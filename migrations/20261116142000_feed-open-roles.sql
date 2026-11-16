CREATE OR REPLACE FUNCTION public.match_projects_for_user(p_user uuid,p_limit int DEFAULT 12,p_cursor jsonb DEFAULT NULL,p_search text DEFAULT '',p_skill text DEFAULT '',p_role text DEFAULT '',p_commitment text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF p_user IS DISTINCT FROM public.verified_user() THEN RAISE EXCEPTION 'Forbidden'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_user AND onboarding_complete) THEN RAISE EXCEPTION 'Finish onboarding'; END IF;
 WITH ranked AS (
 SELECT p.*,l.display_name lead_name,r.id role_id,r.title role_title,r.slots,r.filled_count,(SELECT coalesce(jsonb_agg(jsonb_build_object('title',rr.title,'available',rr.slots-rr.filled_count) ORDER BY rr.title),'[]') FROM public.project_roles rr WHERE rr.project_id=p.id AND rr.filled_count<rr.slots) open_roles,public.match_breakdown(p_user,p.id,r.id) breakdown
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
