-- Filter classification is separate from user-authored canonical domain choices.
ALTER TABLE public.projects ADD COLUMN field text NOT NULL DEFAULT 'Interdisciplinary',ADD COLUMN domain text NOT NULL DEFAULT 'General collaboration';
ALTER TABLE public.projects ALTER COLUMN commitment SET DEFAULT 'part-time';
CREATE FUNCTION public.refresh_project_filter_classification(pid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE p public.projects; chosen_domain text; chosen_field text;
BEGIN
 SELECT * INTO p FROM public.projects WHERE id=pid;IF p.id IS NULL THEN RETURN;END IF;
 SELECT d.name,f.name INTO chosen_domain,chosen_field FROM public.domains d JOIN public.fields f ON f.id=d.field_id WHERE d.name=ANY(p.domains) ORDER BY d.name LIMIT 1;
 IF chosen_domain IS NULL THEN
 SELECT d.name,f.name INTO chosen_domain,chosen_field FROM public.project_roles r JOIN public.project_role_skills rs ON rs.role_id=r.id JOIN public.skill_domains sd ON sd.skill_id=rs.skill_id JOIN public.domains d ON d.id=sd.domain_id JOIN public.fields f ON f.id=d.field_id
 WHERE r.project_id=pid GROUP BY d.name,f.name ORDER BY count(DISTINCT rs.skill_id) DESC,d.name LIMIT 1;
 END IF;
 IF chosen_domain IS NULL THEN
 SELECT d.name,f.name INTO chosen_domain,chosen_field FROM public.domains d JOIN public.fields f ON f.id=d.field_id WHERE d.name=CASE lower(p.category)
 WHEN 'web' THEN 'Web Development' WHEN 'mobile' THEN 'Mobile App Development' WHEN 'ml / ai' THEN 'ML Engineering' WHEN 'data' THEN 'Data Science' WHEN 'design' THEN 'UI/UX Design' WHEN 'game development' THEN 'Game Development' WHEN 'embedded / iot' THEN 'IoT' END LIMIT 1;
 END IF;
 UPDATE public.projects SET field=coalesce(chosen_field,'Interdisciplinary'),domain=coalesce(chosen_domain,'General collaboration') WHERE id=pid AND (field,domain) IS DISTINCT FROM (coalesce(chosen_field,'Interdisciplinary'),coalesce(chosen_domain,'General collaboration'));
END $$;
REVOKE ALL ON FUNCTION public.refresh_project_filter_classification(uuid) FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.sync_project_filter_classification() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE pid uuid; old_pid uuid;
BEGIN
 IF TG_TABLE_NAME='projects' THEN pid=NEW.id;
 ELSIF TG_TABLE_NAME='project_roles' THEN pid=CASE WHEN TG_OP='DELETE' THEN OLD.project_id ELSE NEW.project_id END;IF TG_OP='UPDATE' THEN old_pid=OLD.project_id;END IF;
 ELSE SELECT project_id INTO pid FROM public.project_roles WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.role_id ELSE NEW.role_id END;
 IF TG_OP='UPDATE' THEN SELECT project_id INTO old_pid FROM public.project_roles WHERE id=OLD.role_id;END IF;
 END IF;
 IF pid IS NOT NULL THEN PERFORM public.refresh_project_filter_classification(pid);END IF;
 IF old_pid IS NOT NULL AND old_pid IS DISTINCT FROM pid THEN PERFORM public.refresh_project_filter_classification(old_pid);END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sync_project_filter_classification() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER project_filter_classification AFTER INSERT OR UPDATE OF domains,category ON public.projects FOR EACH ROW EXECUTE FUNCTION public.sync_project_filter_classification();
CREATE TRIGGER role_filter_classification AFTER INSERT OR UPDATE OF project_id OR DELETE ON public.project_roles FOR EACH ROW EXECUTE FUNCTION public.sync_project_filter_classification();
CREATE TRIGGER role_skill_filter_classification AFTER INSERT OR UPDATE OR DELETE ON public.project_role_skills FOR EACH ROW EXECUTE FUNCTION public.sync_project_filter_classification();
DO $$ DECLARE pid uuid;BEGIN FOR pid IN SELECT id FROM public.projects LOOP PERFORM public.refresh_project_filter_classification(pid);END LOOP;END $$;

CREATE FUNCTION public.search_projects(p_filters jsonb DEFAULT '{}',p_page int DEFAULT 1,p_limit int DEFAULT 12) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb; sort text=coalesce(p_filters->>'sort','newest');
BEGIN
 IF public.verified_user() IS NULL THEN RAISE EXCEPTION 'Forbidden';END IF;
 IF p_page IS NULL OR p_limit IS NULL OR p_page<1 OR p_page>100000 OR p_limit<1 OR p_limit>30 THEN RAISE EXCEPTION 'Invalid pagination';END IF;
 WITH base AS (SELECT p.*,l.display_name lead_name,
 (SELECT count(*) FROM public.project_roles r WHERE r.project_id=p.id AND r.filled_count<r.slots) open_count,
 (SELECT coalesce(jsonb_agg(jsonb_build_object('title',r.title,'available',r.slots-r.filled_count) ORDER BY r.title,r.id),'[]') FROM public.project_roles r WHERE r.project_id=p.id AND r.filled_count<r.slots) open_roles,
 ARRAY(SELECT DISTINCT s.name FROM public.project_roles r JOIN public.project_role_skills rs ON rs.role_id=r.id JOIN public.skills s ON s.id=rs.skill_id WHERE r.project_id=p.id ORDER BY s.name) skills
 FROM public.projects p JOIN public.profiles l ON l.id=p.owner_id
 WHERE (coalesce(p_filters->>'status','open') IN ('','all') OR p.status=coalesce(p_filters->>'status','open'))
 AND (coalesce(p_filters->>'search','')='' OR strpos(lower(concat_ws(' ',p.title,p.description,array_to_string(p.tags,' '))),lower(p_filters->>'search'))>0)
 AND (coalesce(p_filters->>'domain','')='' OR p.domain=p_filters->>'domain' OR p_filters->>'domain'=ANY(p.domains))
 AND (coalesce(p_filters->>'field','')='' OR p.field=p_filters->>'field' OR EXISTS(SELECT 1 FROM public.project_domains pd JOIN public.domains d ON d.id=pd.domain_id JOIN public.fields f ON f.id=d.field_id WHERE pd.project_id=p.id AND f.name=p_filters->>'field'))
 AND (coalesce(p_filters->>'commitment','')='' OR p.commitment=p_filters->>'commitment')
 AND (coalesce(p_filters->>'role','')='' OR EXISTS(SELECT 1 FROM public.project_roles r WHERE r.project_id=p.id AND r.filled_count<r.slots AND strpos(lower(r.title),lower(p_filters->>'role'))>0))
 AND (coalesce(p_filters->>'skill','')='' OR EXISTS(SELECT 1 FROM public.project_roles r JOIN public.project_role_skills rs ON rs.role_id=r.id JOIN public.skills s ON s.id=rs.skill_id WHERE r.project_id=p.id AND strpos(lower(s.name),lower(p_filters->>'skill'))>0))),
 ordered AS (SELECT *,CASE WHEN sort='oldest' THEN -extract(epoch FROM created_at) WHEN sort='roles' THEN open_count ELSE extract(epoch FROM created_at) END sort_key FROM base),
 page_rows AS (SELECT * FROM ordered ORDER BY sort_key DESC,id DESC LIMIT p_limit OFFSET (p_page-1)*p_limit)
 SELECT jsonb_build_object('data',coalesce((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY sort_key DESC,id DESC) FROM page_rows),'[]'),'total',(SELECT count(*) FROM base),'page',p_page,'limit',p_limit) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.search_projects(jsonb,int,int) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.search_projects(jsonb,int,int) TO authenticated;
