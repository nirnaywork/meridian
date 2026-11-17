"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  BellOff,
  Clock3,
  MessageCircle,
  NotebookPen,
  ArrowUpRight,
} from "lucide-react";
import { usePollingResource } from "./collaboration-ui";
import { useDashboardPreferences } from "./dashboard-preferences";
import { FocusTimer } from "./focus-timer";
import { api, Skeleton, ErrorState, Empty } from "./ui";
import {
  dashboardActionSchema,
  localDay,
  weeklyStreak,
} from "@/lib/personal-dashboard";

type Note = {
  id: string;
  day: string;
  body: string;
  done: boolean;
  completed_at: string | null;
};
type FeedMessage = {
  id: string;
  display_name: string;
  title: string;
  preview: string;
  created_at: string;
  unread: boolean;
  link: string;
};
type Activity = { id: string; title: string; link: string; created_at: string };
type DayData = {
  user_id: string;
  today: string;
  notes: Note[];
  messages: FeedMessage[];
  activity: Activity[];
  projects: {
    id: string;
    title: string;
    status: string;
    owner_id: string;
    open_items: number | string;
  }[];
  tickets: {
    id: string;
    title: string;
    project_id: string;
    project_title: string;
  }[];
  focus_week: { day: string; count: number | string }[];
};
export function PersonalDashboard({ name }: { name: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? <DashboardContent name={name} /> : <Skeleton />;
}
function DashboardContent({ name }: { name: string }) {
  const [day, setDay] = useState(localDay()),
    [now, setNow] = useState(Date.now()),
    [expiry, setExpiry] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [help, setHelp] = useState(false);
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const r = usePollingResource<DayData>(
    "/api/dashboard?zone=" + encodeURIComponent(zone) + "&day=" + day,
    30000,
  );
  const {
    preferences,
    quiet,
    save,
    error: preferenceError,
  } = useDashboardPreferences();
  const noteInput = useRef<HTMLInputElement>(null);
  const selectedDay = useRef(day);
  selectedDay.current = day;
  const dayAtLastTick = useRef(localDay());
  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
      const today = localDay();
      if (dayAtLastTick.current !== today) {
        if (selectedDay.current === dayAtLastTick.current) setDay(today);
        dayAtLastTick.current = today;
      }
    }, 1000);
    return () => clearInterval(tick);
  }, []);
  useEffect(() => {
    r.refresh();
  }, [quiet]);
  async function toggleQuiet() {
    if (!preferences) return;
    setError("");
    setBusy(true);
    let until: string | null = null;
    if (!quiet && expiry) {
      const date = new Date();
      if (expiry === "tomorrow") {
        date.setDate(date.getDate() + 1);
        date.setHours(8, 0, 0, 0);
      } else date.setTime(Date.now() + Number(expiry) * 60000);
      until = date.toISOString();
    }
    try {
      await save({ dnd_enabled: !quiet, dnd_until: until });
      r.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const actions = useRef({ toggleQuiet });
  actions.current = { toggleQuiet };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        target.closest(
          'input,textarea,select,button,a,[contenteditable="true"],dialog',
        )
      )
        return;
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        noteInput.current?.focus();
      }
      if (e.key.toLowerCase() === "d") {
        e.preventDefault();
        void actions.current.toggleQuiet();
      }
      if (e.code === "Space") {
        e.preventDefault();
        window.dispatchEvent(new Event("meridian-toggle-focus"));
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelp((value) => !value);
      }
      if (e.key === "Escape") setHelp(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const date = new Date(now),
    hour = date.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const clock = date
    .toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/\s?[AP]M$/, "");
  const period = date
    .toLocaleTimeString("en", { hour: "numeric", hour12: true })
    .includes("PM")
    ? "PM"
    : "AM";
  const todayCount = Number(
    r.data?.focus_week.find((d) => d.day === localDay())?.count ?? 0,
  );
  return (
    <div className="personal-dashboard">
      <header className="day-heading">
        <div>
          <span className="eyebrow">YOUR DASHBOARD</span>
          <h1>
            {greeting}, {name.trim().split(/\s+/)[0] || "there"}.
          </h1>
          <p>A little space for your day.</p>
        </div>
        <div className="day-clock" aria-label="Local clock">
          <Clock3 size={18} />
          <time dateTime={date.toISOString()}>
            {clock}
            <small>{period}</small>
          </time>
          <span>
            {date.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}{" "}
            · {zone.replaceAll("_", " ")}
          </span>
        </div>
      </header>
      <div className="day-toolbar">
        <div>
          <button
            className={"btn " + (quiet ? "" : "secondary")}
            role="switch"
            aria-checked={quiet}
            disabled={!preferences || busy}
            onClick={() => void toggleQuiet()}
          >
            <BellOff size={17} />
            Do not disturb
          </button>
          <label>
            Auto-off
            <select
              aria-label="Do not disturb auto-off"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            >
              <option value="">Until I switch it off</option>
              <option value="30">30 minutes</option>
              <option value="60">1 hour</option>
              <option value="tomorrow">Tomorrow at 8 AM</option>
            </select>
          </label>
          {quiet && preferences?.dnd_until && (
            <small>
              Until {new Date(preferences.dnd_until).toLocaleString()}
            </small>
          )}
        </div>
        <button
          className="icon-btn"
          aria-label="Keyboard shortcuts"
          aria-expanded={help}
          onClick={() => setHelp(!help)}
        >
          ?
        </button>
        {help && (
          <aside
            role="region"
            aria-label="Keyboard shortcuts"
            className="day-help"
          >
            <b>Keyboard shortcuts</b>
            <p>
              <kbd>N</kbd> New note · <kbd>D</kbd> Do not disturb ·{" "}
              <kbd>Space</kbd> Start or pause focus · <kbd>?</kbd> Help
            </p>
            <p className="muted">
              Available while you are outside form controls.
            </p>
          </aside>
        )}
      </div>
      {(error || preferenceError) && (
        <ErrorState message={error || preferenceError} />
      )}
      <nav className="day-quick" aria-label="Quick actions">
        <Link href="/projects">
          Explore <ArrowUpRight size={14} />
        </Link>
        <Link href="/my-projects">My Projects</Link>
        <Link href="/applications">Applications</Link>
        <Link href="/invitations">Invitations</Link>
        {!quiet && r.data?.messages.find((m) => m.unread) && (
          <Link href={r.data.messages.find((m) => m.unread)!.link}>
            Latest unread conversation →
          </Link>
        )}
      </nav>
      {r.loading ? (
        <Skeleton />
      ) : r.error ? (
        <ErrorState message={r.error} retry={r.refresh} />
      ) : (
        r.data && (
          <>
            <section className="day-strip" aria-label="My day">
              <h2>My day</h2>
              <div>
                <b>{r.data.tickets.length}</b>
                <span>Tickets assigned to you</span>
              </div>
              <div>
                <b>
                  {r.data.projects.reduce(
                    (n, p) => n + Number(p.open_items),
                    0,
                  )}
                </b>
                <span>Open tickets across your projects</span>
              </div>
              <div>
                <b>{todayCount}</b>
                <span>Pomodoros today</span>
              </div>
              <div>
                <b>{weeklyStreak(r.data.focus_week, localDay())}</b>
                <span>Day streak this week</span>
              </div>
            </section>
            <div className="day-grid">
              <div className="day-column">
                {quiet ? (
                  <section className="day-card quiet-card">
                    <BellOff size={28} />
                    <h2>Do not disturb is on</h2>
                    <p>
                      Your messages and activity will be here when you are
                      ready.
                    </p>
                  </section>
                ) : (
                  <>
                    <section className="day-card" aria-label="Recent messages">
                      <header>
                        <MessageCircle size={20} />
                        <h2>Recent messages</h2>
                      </header>
                      {!r.data.messages.length ? (
                        <Empty
                          title="A quiet moment"
                          description="Messages from your active project conversations appear here."
                        />
                      ) : (
                        <ul className="day-feed">
                          {r.data.messages.map((m) => (
                            <li key={m.id}>
                              <Link href={m.link}>
                                <div>
                                  <b>{m.display_name}</b>
                                  <span>{m.title}</span>
                                  {m.unread && (
                                    <span className="chip matched">Unread</span>
                                  )}
                                </div>
                                <p>{m.preview}</p>
                                <time dateTime={m.created_at}>
                                  {new Date(m.created_at).toLocaleString()}
                                </time>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>
                    <section className="day-card" aria-label="Recent activity">
                      <h2>Recent activity</h2>
                      {r.data.activity.length ? (
                        <ul className="day-feed">
                          {r.data.activity.map((a) => (
                            <li key={a.id}>
                              <Link href={a.link}>
                                {a.title}
                                <time dateTime={a.created_at}>
                                  {new Date(a.created_at).toLocaleString()}
                                </time>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="muted">
                          Team updates and ticket activity will appear here.
                        </p>
                      )}
                    </section>
                  </>
                )}
                <section className="day-card">
                  <h2>Your projects</h2>
                  {r.data.projects.length ? (
                    <ul className="day-feed">
                      {r.data.projects.map((p) => (
                        <li key={p.id}>
                          <Link href={"/projects/" + p.id + "/workspace"}>
                            <b>{p.title}</b>
                            <span>
                              {p.owner_id === r.data!.user_id
                                ? "Leading"
                                : "Member"}{" "}
                              · {p.status.replaceAll("_", " ")}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      Find your next team in{" "}
                      <Link href="/projects">Explore</Link>.
                    </p>
                  )}
                  {r.data.tickets.length > 0 && (
                    <>
                      <h3>Assigned tickets</h3>
                      <ul className="day-feed">
                        {r.data.tickets.map((t) => (
                          <li key={t.id}>
                            <Link
                              href={
                                "/projects/" +
                                t.project_id +
                                "/workspace?tab=tickets"
                              }
                            >
                              {t.title}
                              <span>{t.project_title}</span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </section>
              </div>
              <div className="day-column">
                <Notes
                  day={day}
                  setDay={setDay}
                  notes={r.data.notes}
                  refresh={r.refresh}
                  inputRef={noteInput}
                />
                {preferences ? (
                  <FocusTimer userId={r.data.user_id} onComplete={r.refresh} />
                ) : (
                  <Skeleton />
                )}
              </div>
            </div>
          </>
        )
      )}
    </div>
  );
}
function Notes({
  day,
  setDay,
  notes,
  refresh,
  inputRef,
}: {
  day: string;
  setDay: (s: string) => void;
  notes: Note[];
  refresh: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [pendingDone,setPendingDone]=useState<Record<string,boolean>>({});
  useEffect(()=>setPendingDone({}),[notes]);
  const [body, setBody] = useState(""),
    [edit, setEdit] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function mutate(input: unknown) {
    setError("");
    setBusy(true);
    try {
      await api("/api/dashboard", dashboardActionSchema.parse(input));
      refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      await mutate({
        action: "note",
        id: edit ?? crypto.randomUUID(),
        day,
        body,
      })
    ) {
      setBody("");
      setEdit(null);
    }
  }
  const groups = Array.from(new Set(notes.map((n) => n.day)));
  return (
    <section className="day-card" aria-label="Daily notes">
      <header>
        <NotebookPen size={20} />
        <h2>Daily notes</h2>
      </header>
      <label>
        Notes date
        <input
          type="date"
          value={day}
          onChange={(e) => {
            if (e.target.value) setDay(e.target.value);
          }}
        />
      </label>
      <form className="note-compose" onSubmit={submit}>
        <label>
          {edit ? "Edit note" : "New note"}
          <input
            ref={inputRef}
            aria-label="Note text"
            required
            maxLength={500}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button className="btn" disabled={busy}>
          {edit ? "Save note" : "Add note"}
        </button>
        {edit && (
          <button
            type="button"
            className="text-btn"
            onClick={() => {
              setEdit(null);
              setBody("");
            }}
          >
            Cancel edit
          </button>
        )}
      </form>
      {error && <ErrorState message={error} />}
      {!notes.length && (
        <p className="muted">What would you like to remember today?</p>
      )}
      {groups.map((group) => (
        <div key={group} className="note-group">
          <h3>{group === day ? "For this day" : "Carried from " + group}</h3>
          <ul>
            {notes
              .filter((n) => n.day === group)
              .map((note) => (
                <li key={note.id}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={pendingDone[note.id]??note.done}
                      disabled={busy}
                      aria-label={"Complete note: " + note.body}
                      onChange={async(e) => {
                        const done=e.target.checked;
                        setPendingDone(previous=>({...previous,[note.id]:done}));
                        if(!await mutate({action:'note_done',id:note.id,done}))
                          setPendingDone(previous=>{const next={...previous};delete next[note.id];return next});
                      }}
                    />
                    <span className={(pendingDone[note.id]??note.done) ? "note-done" : ""}>
                      {note.body}
                    </span>
                  </label>
                  <div>
                    <button
                      className="text-btn"
                      disabled={busy}
                      aria-label={"Edit note: " + note.body}
                      onClick={() => {
                        setEdit(note.id);
                        setBody(note.body);
                        inputRef.current?.focus();
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="text-btn"
                      disabled={busy}
                      aria-label={"Delete note: " + note.body}
                      onClick={() =>
                        void mutate({ action: "note_delete", id: note.id })
                      }
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      ))}
      <p className="muted">
        Unfinished notes carry forward. Up to 50 notes per date and 300 in
        total.
      </p>
    </section>
  );
}
