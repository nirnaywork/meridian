"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Activity } from "./dashboard-activity";
import Link from "next/link";
import { ArrowLeft, Send, Plus, Trash2 } from "lucide-react";
import {
  isReadOnly,
  transitions,
  statusLabel,
  type ProjectStatus,
  ticketTypes,
  ticketStatuses,
  priorities,
  nextTicketStatuses,
  messageSchema,
} from "@/lib/collaboration";
import { api, Skeleton, ErrorState, Empty, useToast } from "./ui";
import { Dialog, PersonLink, usePollingResource } from "./collaboration-ui";
type Member = {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_team_lead: boolean;
  role_id: string | null;
  role_title: string | null;
  joined_at: string;
  left_at: string | null;
  left_reason: string;
  removed_by: string | null;
};
type Overview = {
  project: {
    id: string;
    title: string;
    status: ProjectStatus;
    owner_id: string;
    team_size: number;
    started_at: string | null;
    minimum_start_members: number;
  };
  user_id: string;
  lead: { id: string; display_name: string; avatar_url: string | null };
  members: Member[];
  roles: { id: string; title: string; slots: number; filled_count: number }[];
  transfers: { id: string; from_id: string; to_id: string; status: string }[];
  unread_chat: number;
};
type Message = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  display_name: string;
  avatar_url: string | null;
  participants?: string[];
  failed?: boolean;
  optimistic?: boolean;
};
const endpoint = (id: string) => `/api/projects/${id}/workspace`;
function useUrlFilters() {
  const query = useSearchParams();
  return (values: Record<string, string>) => {
    const next = new URLSearchParams(query.toString());
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (next.size ? "?" + next : ""),
    );
  };
}
export function TeamWorkspace({ id }: { id: string }) {
  const r = usePollingResource<Overview>(endpoint(id), 30000),
    query = useSearchParams(),
    setQuery = useUrlFilters();
  const tab = query.get("tab") ?? "overview";
  if (r.loading) return <Skeleton />;
  if (r.error) return <ErrorState message={r.error} retry={r.refresh} />;
  if (!r.data) return null;
  const info = r.data;
  return (
    <>
      <Link className="back-link" href={`/projects/${id}`}>
        <ArrowLeft size={16} />
        Project details
      </Link>
      <header className="page-heading">
        <span className="eyebrow">TEAM DASHBOARD</span>
        <h1>{info.project.title}</h1>
        <p>
          <span className="chip matched">
            {statusLabel(info.project.status)}
          </span>{" "}
          Team: {1 + info.members.filter((m) => !m.left_at).length} of{" "}
          {info.project.team_size}{" "}
          {info.project.started_at && (
            <>
              {" "}
              · Started {new Date(info.project.started_at).toLocaleDateString()}
            </>
          )}
        </p>
      </header>
      <div className="tabs" role="tablist" aria-label="Team Dashboard">
        {["overview", "chat", "updates", "tickets"].map((name) => (
          <button
            key={name}
            role="tab"
            aria-selected={tab === name}
            onClick={() => setQuery({ tab: name })}
          >
            {statusLabel(name)}
            {name === "chat" &&
              info.unread_chat > 0 &&
              " (" + info.unread_chat + ")"}
          </button>
        ))}
      </div>
      {isReadOnly(info.project.status) && (
        <p className="info-note">This dashboard is read-only.</p>
      )}
      {tab === "chat" ? (
        <Conversations info={info} onRead={r.refresh} />
      ) : tab === "tickets" || tab === "updates" ? (
        <Activity
          key={tab}
          url={endpoint(info.project.id)}
          people={people(info)}
          viewer={info.user_id}
          readonly={isReadOnly(info.project.status)}
          kind={tab}
        />
      ) : (
        <WorkspaceOverview info={info} refresh={r.refresh} />
      )}
    </>
  );
}
function WorkspaceOverview({
  info,
  refresh,
}: {
  info: Overview;
  refresh: () => void;
}) {
  const owner = info.user_id === info.project.owner_id,
    active = info.members.filter((m) => !m.left_at),
    router = useRouter(),
    toast = useToast();
  const [prompt, setPrompt] = useState<{
      action: string;
      user_id?: string;
      status?: string;
      id?: string;
      accept?: boolean;
      title: string;
    } | null>(null),
    [note, setNote] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(input: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api(endpoint(info.project.id), input);
      toast("Team updated");
      setPrompt(null);
      refresh();
      if (input.action === "leave") router.push(`/projects/${info.project.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-panel">
      <div className="section-heading">
        <h2>Your team</h2>
        {!owner && (
          <button
            className="text-btn"
            onClick={() => {
              setNote("");
              setPrompt({ action: "leave", title: "Leave this team?" });
            }}
          >
            Leave team
          </button>
        )}
      </div>
      {owner && info.project.status === "open" && (
        <button
          className="btn"
          disabled={busy || active.length < info.project.minimum_start_members}
          onClick={() =>
            setPrompt({
              action: "status",
              status: "in_progress",
              title: "Start this project?",
            })
          }
        >
          Start project
        </button>
      )}
      <PersonLink
        id={info.lead.id}
        name={info.lead.display_name}
        avatar={info.lead.avatar_url}
        lead
      />
      {active.map((m) => (
        <div className="team-member-row" key={m.id}>
          <div>
            <PersonLink
              id={m.user_id}
              name={m.display_name}
              avatar={m.avatar_url}
            />
            <small className="muted">
              {m.role_title || "Team collaborator"}
            </small>
          </div>
          {owner && (
            <div className="chips">
              <label className="sr-only" htmlFor={"role-" + m.id}>
                Role for {m.display_name}
              </label>
              <select
                id={"role-" + m.id}
                disabled={busy || isReadOnly(info.project.status)}
                value={m.role_id ?? ""}
                onChange={(e) =>
                  run({
                    action: "reassign",
                    user_id: m.user_id,
                    role_id: e.target.value || null,
                  })
                }
              >
                <option value="">General collaborator</option>
                {info.roles.map((role) => (
                  <option
                    key={role.id}
                    value={role.id}
                    disabled={
                      role.filled_count >= role.slots && role.id !== m.role_id
                    }
                  >
                    {role.title} ({role.filled_count}/{role.slots})
                  </option>
                ))}
              </select>
              <button
                className="text-btn"
                onClick={() => {
                  setNote("");
                  setPrompt({
                    action: "remove",
                    user_id: m.user_id,
                    title: `Remove ${m.display_name}?`,
                  });
                }}
              >
                Remove
              </button>
              {m.is_team_lead && !isReadOnly(info.project.status) && (
                <button
                  className="text-btn"
                  onClick={() =>
                    setPrompt({
                      action: "transfer",
                      user_id: m.user_id,
                      title: `Offer leadership to ${m.display_name}?`,
                    })
                  }
                >
                  Transfer leadership
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {!active.length && (
        <p className="muted">Your approved teammates will appear here.</p>
      )}
      {owner && (
        <label>
          Project status
          <select
            value={info.project.status}
            disabled={busy}
            onChange={(e) =>
              setPrompt({
                action: "status",
                status: e.target.value,
                title: `Mark project ${statusLabel(e.target.value).toLowerCase()}?`,
              })
            }
          >
            <option value={info.project.status}>
              {statusLabel(info.project.status)}
            </option>
            {transitions[info.project.status]
              .filter(
                (s) =>
                  s !== "in_progress" ||
                  (info.project.status !== "open" && !!info.project.started_at),
              )
              .map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
          </select>
        </label>
      )}
      {info.transfers
        .filter((t) => t.to_id === info.user_id)
        .map((t) => (
          <div className="info-note" key={t.id}>
            <p>
              The lead offered you project ownership. Accepting makes you
              responsible for the team; the previous lead stays as a general
              collaborator.
            </p>
            <button
              className="btn"
              onClick={() =>
                setPrompt({
                  action: "transfer_reply",
                  id: t.id,
                  accept: true,
                  title: "Accept project leadership?",
                })
              }
            >
              Review and accept leadership
            </button>
            <button
              className="text-btn"
              disabled={busy}
              onClick={() =>
                run({ action: "transfer_reply", id: t.id, accept: false })
              }
            >
              Decline
            </button>
          </div>
        ))}
      {info.transfers.some((t) => t.from_id === info.user_id) && (
        <p className="info-note">
          Leadership transfer pending the recipient’s acceptance.
        </p>
      )}
      {info.members.some((m) => m.left_at) && (
        <details>
          <summary>Membership history</summary>
          {info.members
            .filter((m) => m.left_at)
            .map((m) => (
              <p key={m.id}>
                <PersonLink id={m.user_id} name={m.display_name} /> ·{" "}
                {m.removed_by ? "Removed" : "Left"} ·{" "}
                {new Date(m.left_at!).toLocaleDateString()}
                {m.left_reason && ` · ${m.left_reason}`}
              </p>
            ))}
        </details>
      )}
      {error && !prompt && <ErrorState message={error} />}{" "}
      {prompt && (
        <Dialog title={prompt.title} onClose={() => !busy && setPrompt(null)}>
          <p>
            {prompt.action === "status"
              ? "Only Open accepts new applications and invitations. Closed and In progress keep existing requests pending. Completed, Cancelled and Archived reject pending applications and cancel pending invitations. Completed and cancelled projects can only be archived."
              : prompt.action === "transfer"
                ? "The recipient must accept. You remain the lead until then."
                : prompt.action === "leave" || prompt.action === "remove"
                  ? "Workspace access will end immediately, the role slot will be freed and assigned tickets will become unassigned. Messages and membership history are kept."
                  : "Please confirm this team change."}
          </p>
          {["leave", "remove"].includes(prompt.action) && (
            <label>
              Optional note
              <textarea
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
          )}
          {error && <ErrorState message={error} />}
          <div className="form-actions">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => setPrompt(null)}
            >
              Cancel
            </button>
            <button
              className="btn"
              disabled={busy}
              onClick={() => {
                const { title, ...input } = prompt;
                void run({ ...input, note });
              }}
            >
              {busy ? "Updating…" : "Confirm"}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
function relativeTime(date: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(date)) / 60000),
  );
  return minutes < 1
    ? "Just now"
    : minutes < 60
      ? `${minutes}m ago`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h ago`
        : new Date(date).toLocaleDateString();
}
function people(info: Overview) {
  return [
    { id: info.lead.id, name: info.lead.display_name },
    ...info.members
      .filter((m) => !m.left_at)
      .map((m) => ({ id: m.user_id, name: m.display_name })),
  ];
}
function names(info: Overview, ids: string[]) {
  return ids
    .map((id) =>
      id === info.lead.id
        ? info.lead.display_name
        : (info.members.find((m) => m.user_id === id)?.display_name ??
          "Former member"),
    )
    .join(", ");
}
function Conversations({
  info,
  onRead,
}: {
  info: Overview;
  onRead: () => void;
}) {
  const query=useSearchParams(),setQuery=useUrlFilters();
  const selected=query.get("thread")??"everyone";
  const valid=(value:string)=>value==="everyone" || value.split(",").every(id=>/^[a-f0-9-]{36}$/i.test(id));
  const [thread,changeThread]=useState(valid(selected)?selected:"everyone");
  useEffect(()=>{changeThread(valid(selected)?selected:"everyone")},[selected]);
  const setThread=(value:string)=>{changeThread(value);setQuery({thread:value,message:""})};

  const list = usePollingResource<{
    data: { thread: string; unread: number }[];
  }>(endpoint(info.project.id) + "?resource=conversations", 5000);
  const rows = list.data?.data ?? [];
  const recipients =
    thread === "everyone"
      ? []
      : thread.split(",").filter((id) => id !== info.user_id);
  return (
    <section className="content-panel">
      <nav aria-label="Conversations">
        {Array.from(
          new Set(["everyone", thread, ...rows.map((r) => r.thread)]),
        ).map((key) => (
          <button
            key={key}
            className="btn secondary small"
            aria-pressed={key === thread}
            onClick={() => setThread(key)}
          >
            {key === "everyone"
              ? "Everyone"
              : names(
                  info,
                  key.split(",").filter((id) => id !== info.user_id),
                )}{" "}
            ({rows.find((r) => r.thread === key)?.unread ?? 0})
          </button>
        ))}
      </nav>
      {list.error && <ErrorState message={list.error} />}
      <label>
        To
        <select
          multiple
          aria-label="Recipients"
          value={recipients.length ? recipients : ["everyone"]}
          onChange={(e) => {
            const chosen = Array.from(e.target.selectedOptions, (o) => o.value);
            const ids = chosen.filter((id) => id !== "everyone");
            setThread(
              !ids.length ||
                (recipients.length > 0 && chosen.includes("everyone"))
                ? "everyone"
                : [info.user_id, ...ids].sort().join(","),
            );
          }}
        >
          <option value="everyone">Everyone</option>
          {people(info)
            .filter((p) => p.id !== info.user_id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </label>
      <TeamChat
        key={thread}
        thread={thread}
        info={info}
        onRead={() => {
          list.refresh();
          onRead();
        }}
      />
    </section>
  );
}
function TeamChat({
  info,
  thread,
  onRead,
}: {
  info: Overview;
  thread: string;
  onRead: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]),
    [body, setBody] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [older, setOlder] = useState(true),
    [loadingOlder, setLoadingOlder] = useState(false),
    [edit, setEdit] = useState<Message | null>(null),
    [editBody, setEditBody] = useState("");
  const query=useSearchParams();
  const scroll = useRef<HTMLDivElement>(null),
    nearBottom = useRef(true),
    read = useRef(onRead);
  read.current = onRead;
  const readonly = isReadOnly(info.project.status),
    toast = useToast();
  const merge = useCallback((incoming: Message[]) => {
    setMessages((current) => {
      const map = new Map(current.map((m) => [m.id, m]));
      for (const m of incoming) map.set(m.id, m);
      return [...map.values()].sort(
        (a, b) =>
          a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id),
      );
    });
  }, []);
  useEffect(() => {
    let live = true,
      since: number | null = null;
    setMessages([]);
    setLoading(true);
    async function poll() {
      if (document.hidden) return;
      try {
        const response = await api<{ data: Message[]; sequence: number }>(
          endpoint(info.project.id) +
            "?resource=messages&thread=" +
            encodeURIComponent(thread) +
            (since ? "&after=" + since : ""),
        );
        if (!live) return;
        merge(response.data);
        if (!since) setOlder(response.data.length === 50);
        since = response.sequence;
        setError("");
        if (response.data.length && !document.hidden)
          await api(endpoint(info.project.id), {
            action: "read_chat",
            recipients: thread === "everyone" ? [] : thread.split(","),
            seen_at: response.data[response.data.length - 1].created_at,
          });
        if (live && response.data.some((m) => m.author_id !== info.user_id))
          read.current();
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    }
    void poll();
    const timer = setInterval(poll, 5000);
    const visible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [info.project.id, info.user_id, thread, merge]);
  useEffect(() => {
    if (nearBottom.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages]);
  useEffect(()=>{
    const id=query.get('message');
    if(id&&messages.some(m=>m.id===id))document.getElementById('chat-message-'+id)?.scrollIntoView({block:'center'});
  },[messages,query]);
  async function send(existing?: Message) {
    try {
      const text = messageSchema.parse(existing?.body ?? body);
      const id = existing?.id ?? crypto.randomUUID();
      const pending: Message = {
        id,
        author_id: info.user_id,
        body: text,
        created_at: existing?.created_at ?? new Date().toISOString(),
        display_name: "You",
        avatar_url: null,
        edited_at: null,
        deleted_at: null,
        participants: thread === "everyone" ? [] : thread.split(","),
        optimistic: true,
      };
      merge([pending]);
      if (!existing) setBody("");
      nearBottom.current = true;
      try {
        await api(endpoint(info.project.id), {
          action: "message",
          recipients:
            thread === "everyone"
              ? []
              : thread.split(",").filter((id) => id !== info.user_id),
          id,
          body: text,
        });
        merge([{ ...pending, optimistic: false }]);
      } catch (e) {
        merge([{ ...pending, optimistic: false, failed: true }]);
        throw e;
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function earlier() {
    if (!messages[0]) return;
    setLoadingOlder(true);
    const height = scroll.current?.scrollHeight ?? 0;
    nearBottom.current = false;
    try {
      const first = messages.find((m) => !m.optimistic);
      if (!first) return;
      const response = await api<{ data: Message[] }>(
        endpoint(info.project.id) +
          `?resource=messages&thread=${encodeURIComponent(thread)}&before=${encodeURIComponent(first.created_at)}&before_id=${first.id}`,
      );
      merge(response.data);
      setOlder(response.data.length === 50);
      requestAnimationFrame(() => {
        if (scroll.current)
          scroll.current.scrollTop = scroll.current.scrollHeight - height;
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  }
  async function modify(message: Message, remove = false) {
    try {
      await api(endpoint(info.project.id), {
        action: remove ? "delete_message" : "edit_message",
        id: message.id,
        ...(!remove ? { body: messageSchema.parse(editBody) } : {}),
      });
      merge([
        {
          ...message,
          body: remove ? "Message removed" : editBody.trim(),
          deleted_at: remove ? new Date().toISOString() : null,
          edited_at: remove ? message.edited_at : new Date().toISOString(),
        },
      ]);
      setEdit(null);
      toast(remove ? "Message removed" : "Message updated");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <section className="chat-panel" aria-label="Team chat">
      {error && <ErrorState message={error} />}
      <div
        className="chat-messages"
        ref={scroll}
        onScroll={() => {
          if (scroll.current)
            nearBottom.current =
              scroll.current.scrollHeight -
                scroll.current.scrollTop -
                scroll.current.clientHeight <
              100;
        }}
        role="log"
        aria-label="Messages"
        aria-live="polite"
      >
        {loading ? (
          <Skeleton />
        ) : (
          <>
            {older && (
              <button
                className="text-btn"
                disabled={loadingOlder}
                onClick={earlier}
              >
                {loadingOlder ? "Loading…" : "Load earlier messages"}
              </button>
            )}
            {messages.length ? (
              messages.map((m) => (
                <article
                  id={"chat-message-"+m.id}
                  className={`chat-message ${m.optimistic ? "sending" : ""}`}
                  key={m.id}
                >
                  <header>
                    <PersonLink
                      id={m.author_id}
                      name={m.display_name}
                      avatar={m.avatar_url}
                      lead={m.author_id === info.project.owner_id}
                    />
                    <time
                      dateTime={m.created_at}
                      title={new Date(m.created_at).toLocaleString()}
                    >
                      {relativeTime(m.created_at)}
                      {m.edited_at ? " · edited" : ""}
                    </time>
                  </header>
                  <p className="muted">
                    To:{" "}
                    {m.participants?.length
                      ? names(
                          info,
                          m.participants.filter((id) => id !== m.author_id),
                        )
                      : "Everyone"}
                  </p>
                  <p className="preserve-lines">{m.body}</p>
                  {m.failed ? (
                    <button className="text-btn" onClick={() => send(m)}>
                      Send failed · Retry
                    </button>
                  ) : m.optimistic ? (
                    <small>Sending…</small>
                  ) : (
                    !readonly &&
                    !m.deleted_at && (
                      <div className="message-tools">
                        {m.author_id === info.user_id && (
                          <button
                            className="text-btn"
                            onClick={() => {
                              setEdit(m);
                              setEditBody(m.body);
                            }}
                          >
                            Edit
                          </button>
                        )}
                        {m.author_id === info.user_id && (
                          <button
                            className="text-btn"
                            onClick={() => modify(m, true)}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    )
                  )}
                </article>
              ))
            ) : (
              <Empty
                title="Start the conversation"
                description="Introduce yourself and share what you’re working on."
              />
            )}
          </>
        )}
      </div>
      <form
        className="chat-composer"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label className="sr-only" htmlFor="chat-message">
          Message your team
        </label>
        <textarea
          id="chat-message"
          rows={2}
          placeholder={
            readonly ? "This workspace is read-only" : "Message your team…"
          }
          maxLength={2000}
          value={body}
          disabled={readonly}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="btn" disabled={readonly || !body.trim()}>
          <Send size={16} />
          Send
        </button>
      </form>
      <small className="muted">
        Enter to send · Shift+Enter for a new line · Plain text only
      </small>
      {edit && (
        <Dialog title="Edit message" onClose={() => setEdit(null)}>
          <label>
            Message
            <textarea
              maxLength={2000}
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
            />
          </label>
          <button className="btn" onClick={() => modify(edit)}>
            Save message
          </button>
        </Dialog>
      )}
    </section>
  );
}
