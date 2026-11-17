-- New private dashboard data. InsForge owns the file's transaction.
CREATE TABLE IF NOT EXISTS public.dashboard_preferences (
 user_id uuid PRIMARY KEY REFERENCES public.profiles(id),
 dnd_enabled boolean NOT NULL DEFAULT false,
 dnd_until timestamptz,
 settings jsonb NOT NULL DEFAULT '{"focus":25,"short":5,"long":15,"custom":10}'::jsonb
);
CREATE TABLE IF NOT EXISTS public.daily_notes (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id),
 day date NOT NULL, body text NOT NULL CHECK(length(btrim(body)) BETWEEN 1 AND 500),
 done boolean NOT NULL DEFAULT false, completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS daily_notes_owner_day ON public.daily_notes(user_id,day,created_at);
CREATE TABLE IF NOT EXISTS public.focus_sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id),
 kind text NOT NULL CHECK(kind IN ('focus','custom')), seconds integer NOT NULL CHECK(seconds BETWEEN 60 AND 7200),
 completed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS focus_sessions_owner_date ON public.focus_sessions(user_id,completed_at);
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['dashboard_preferences','daily_notes','focus_sessions'] LOOP
 EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
 EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',name);
 EXECUTE format('GRANT SELECT ON public.%I TO authenticated',name);
 EXECUTE format('GRANT ALL ON public.%I TO project_admin',name);
 EXECUTE format('DROP POLICY IF EXISTS owner_only ON public.%I',name);
 EXECUTE format('CREATE POLICY owner_only ON public.%I FOR ALL TO authenticated USING(user_id=public.verified_user()) WITH CHECK(user_id=public.verified_user())',name);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.personal_preferences() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE viewer uuid=public.verified_user(); result jsonb; BEGIN
 IF viewer IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(p) INTO result FROM public.dashboard_preferences p WHERE user_id=viewer;
 RETURN coalesce(result,jsonb_build_object('user_id',viewer,'dnd_enabled',false,'dnd_until',NULL,'settings',jsonb_build_object('focus',25,'short',5,'long',15,'custom',10)));
END $$;
REVOKE ALL ON FUNCTION public.personal_preferences() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.personal_preferences() TO authenticated,project_admin;

CREATE OR REPLACE FUNCTION public.personal_dashboard(zone text DEFAULT 'UTC',selected_day date DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE viewer uuid=public.verified_user(); prefs jsonb; quiet boolean; today date=(now() AT TIME ZONE zone)::date; notes_day date=coalesce(selected_day,today); BEGIN
 IF viewer IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
 prefs=public.personal_preferences();
 quiet=(prefs->>'dnd_enabled')::boolean AND (prefs->>'dnd_until' IS NULL OR (prefs->>'dnd_until')::timestamptz>now());
 RETURN jsonb_build_object('user_id',viewer,'today',today,'day',notes_day,'preferences',prefs,
 'messages',CASE WHEN quiet THEN '[]'::jsonb ELSE coalesce((
 SELECT jsonb_agg(row ORDER BY created_at DESC,id) FROM (
 SELECT m.id,m.project_id,m.author_id,m.thread,m.created_at,pr.display_name,p.title,
 left(m.body,180) preview,
 m.author_id<>viewer AND m.created_at>coalesce(s.last_read_message_at,'epoch'::timestamptz) unread,
 '/projects/'||p.id||'/workspace?tab=chat&thread='||m.thread||'&message='||m.id link
 FROM public.project_messages m JOIN public.projects p ON p.id=m.project_id JOIN public.profiles pr ON pr.id=m.author_id
 LEFT JOIN public.workspace_read_state s ON s.project_id=p.id AND s.user_id=viewer AND s.thread=m.thread
 WHERE public.team_access(p.id,viewer) AND m.deleted_at IS NULL AND (m.thread='everyone' OR viewer=ANY(m.participants))
 ORDER BY m.created_at DESC,m.id LIMIT 12
 ) row),'[]') END,
 'activity',CASE WHEN quiet THEN '[]'::jsonb ELSE coalesce((
 SELECT jsonb_agg(row ORDER BY created_at DESC) FROM (
 SELECT n.id,n.title,n.link,n.created_at FROM public.notifications n
 WHERE n.recipient_id=viewer AND n.project_id IS NOT NULL AND public.team_access(n.project_id,viewer)
 AND (n.type='update.posted' OR n.type LIKE 'ticket.%' OR n.type='project.status')
 ORDER BY n.created_at DESC,n.id LIMIT 6) row),'[]') END,
 'notes',coalesce((SELECT jsonb_agg(n ORDER BY n.day,n.created_at,n.id) FROM public.daily_notes n WHERE n.user_id=viewer AND
 (n.day=notes_day OR (NOT n.done AND n.day<notes_day) OR (n.completed_at AT TIME ZONE zone)::date=notes_day)),'[]'),
 'projects',coalesce((SELECT jsonb_agg(row ORDER BY created_at DESC) FROM
 (SELECT p.id,p.title,p.status,p.owner_id,p.created_at,
 (SELECT count(*) FROM public.project_tickets t WHERE t.project_id=p.id AND t.status IN ('open','in_progress')) open_items
 FROM public.projects p WHERE public.team_access(p.id,viewer) ORDER BY p.created_at DESC LIMIT 30) row),'[]'),
 'tickets',coalesce((SELECT jsonb_agg(row ORDER BY created_at DESC) FROM
 (SELECT t.id,t.title,t.project_id,t.created_at,p.title project_title FROM public.project_tickets t JOIN public.projects p ON p.id=t.project_id
 WHERE t.assignee_id=viewer AND t.status IN ('open','in_progress') AND public.team_access(t.project_id,viewer)
 ORDER BY t.created_at DESC LIMIT 12) row),'[]'),
 'focus_week',coalesce((SELECT jsonb_agg(row ORDER BY day) FROM (
 SELECT (f.completed_at AT TIME ZONE zone)::date AS day,count(*) AS count FROM public.focus_sessions f WHERE f.user_id=viewer AND f.kind='focus'
 AND (f.completed_at AT TIME ZONE zone)::date BETWEEN today-6 AND today GROUP BY 1) row),'[]'));
END $$;
REVOKE ALL ON FUNCTION public.personal_dashboard(text,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.personal_dashboard(text,date) TO authenticated,project_admin;

CREATE OR REPLACE FUNCTION public.personal_dashboard_action(actor uuid,input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE action text=input->>'action'; identifier uuid=(input->>'id')::uuid; BEGIN
 PERFORM public.check_actor(actor);
 PERFORM 1 FROM public.profiles WHERE id=actor FOR UPDATE;
 IF action='preferences' THEN
 INSERT INTO public.dashboard_preferences(user_id) VALUES(actor) ON CONFLICT(user_id) DO NOTHING;
 UPDATE public.dashboard_preferences SET
 dnd_enabled=coalesce((input->>'dnd_enabled')::boolean,dnd_enabled),
 dnd_until=CASE WHEN input ? 'dnd_until' THEN (input->>'dnd_until')::timestamptz ELSE dnd_until END,
 settings=coalesce(input->'settings',settings) WHERE user_id=actor;
 ELSIF action='note' THEN
 IF NOT EXISTS(SELECT 1 FROM public.daily_notes WHERE id=identifier AND user_id=actor) THEN
 IF (SELECT count(*) FROM public.daily_notes WHERE user_id=actor)>=300 OR (SELECT count(*) FROM public.daily_notes WHERE user_id=actor AND day=(input->>'day')::date)>=50
 THEN RAISE EXCEPTION 'Keep up to 50 notes per day and 300 notes in total. Remove older notes to make room.'; END IF;
 INSERT INTO public.daily_notes(id,user_id,day,body) VALUES(identifier,actor,(input->>'day')::date,btrim(input->>'body'));
 ELSE UPDATE public.daily_notes SET body=btrim(input->>'body') WHERE id=identifier AND user_id=actor; END IF;
 ELSIF action='note_done' THEN
 UPDATE public.daily_notes SET done=(input->>'done')::boolean,completed_at=CASE WHEN (input->>'done')::boolean THEN now() END WHERE id=identifier AND user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Note not found' USING ERRCODE='42501'; END IF;
 ELSIF action='note_delete' THEN
 DELETE FROM public.daily_notes WHERE id=identifier AND user_id=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Note not found' USING ERRCODE='42501'; END IF;
 ELSIF action='focus_complete' THEN
 INSERT INTO public.focus_sessions(id,user_id,kind,seconds) VALUES(identifier,actor,input->>'kind',(input->>'seconds')::int) ON CONFLICT(id) DO NOTHING;
 ELSE RAISE EXCEPTION 'Unknown dashboard action'; END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.personal_dashboard_action(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.personal_dashboard_action(uuid,jsonb) TO project_admin;
