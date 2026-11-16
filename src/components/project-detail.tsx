"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Clock,
  Users,
  Calendar,
  Check,
  Flag,
} from "lucide-react";
import {
  api,
  useResource,
  useToast,
  ErrorState,
  Empty,
  Skeleton,
  MatchScore,
  SkillChips,
} from "./ui";
import type { Project, Breakdown, MatchRecord } from "@/lib/types";
type Detail = Project & {
  user_id: string;
  matches: { role_id: string | null; breakdown: Breakdown | null }[];
};
export function ProjectDetail({ id }: { id: string }) {
  const resource = useResource<Detail>("/api/data/project?id=" + id),
    [role, setRole] = useState<string | null>(null),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [outcome, setOutcome] = useState("");
  const toast = useToast();
  if (resource.loading) return <Skeleton />;
  if (resource.error)
    return <ErrorState message={resource.error} retry={resource.refresh} />;
  const p = resource.data;
  if (!p) return null;
  const isOwner = p.user_id === p.owner_id;
  const selected = role ?? p.roles[0]?.id ?? null;
  const match = p.matches.find((m) => m.role_id === selected)?.breakdown;
  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        blocked?: boolean;
        message?: string;
        status?: string;
      }>("/api/actions", {
        action: "apply",
        project_id: id,
        role_id: selected,
        message,
      });
      if (result.blocked)
        setError(result.message ?? "This match needs more skills.");
      else {
        setOutcome(
          result.status === "approved"
            ? "You’re on the team! Your skills are a strong fit."
            : "Your application is with the team lead.",
        );
        toast(
          result.status === "approved"
            ? "Welcome to the team!"
            : "Application sent",
        );
        resource.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link href={isOwner ? "/my-projects" : "/feed"} className="back-link">
        <ArrowLeft size={15} />
        {isOwner ? "My projects" : "Discover projects"}
      </Link>
      <div className="detail-header">
        <div>
          <div className="chips">
            <span className="chip matched">
              {p.status === "open"
                ? "Open for collaborators"
                : p.status.replace("_", " ")}
            </span>
            <span className="chip">{p.category}</span>
            {p.is_demo && <span className="chip">Demo project</span>}
          </div>
          <h1>{p.title}</h1>
          <p>
            Led by <b>{p.lead_name}</b> · Different skills, one shared
            direction.
          </p>
        </div>
        {isOwner && (
          <Link href={`/projects/${id}/edit`} className="btn secondary">
            Edit project <ArrowUpRight size={16} />
          </Link>
        )}
      </div>
      <div className="detail-meta">
        <span>
          <Clock size={17} />
          {p.commitment}
        </span>
        <span>
          <Calendar size={17} />
          {p.duration}
        </span>
        <span>
          <Users size={17} />
          {p.team_size} people, including the lead
        </span>
      </div>
      <div className="detail-columns">
        <div>
          <section className="content-panel">
            <span className="eyebrow">THE IDEA</span>
            <h2>Something worth building.</h2>
            <p className="preserve-lines">{p.description}</p>
            <div className="chips">
              {p.tags.filter(Boolean).map((t) => (
                <span className="chip" key={t}>
                  {t}
                </span>
              ))}
            </div>
          </section>
          <section className="content-panel">
            <span className="eyebrow">FIND YOUR PLACE</span>
            <h2>People we’re looking for</h2>
            {p.roles.length ? (
              p.roles.map((r) => {
                const b = p.matches.find((m) => m.role_id === r.id)?.breakdown;
                return (
                  <article className="role-detail" key={r.id}>
                    <div className="section-heading">
                      <h3>{r.title}</h3>
                      <span className="subtle-pill">
                        {r.filled_count} / {r.slots} filled
                      </span>
                    </div>
                    <p>{r.description}</p>
                    <div className="chips">
                      {r.skills.map((s) => (
                        <span
                          key={s.id}
                          className={`chip ${b?.matched_skills.includes(s.name) ? "matched" : ""}`}
                        >
                          {s.name}
                          {s.importance === "preferred" && (
                            <small>preferred</small>
                          )}
                        </span>
                      ))}
                    </div>
                    {b && <MatchScore match={b} />}
                  </article>
                );
              })
            ) : (
              <p>
                Open collaboration — bring your skills to the whole project.
              </p>
            )}
          </section>
        </div>
        {!isOwner && (
          <aside className="apply-panel">
            <span className="eyebrow">A SHARED DIRECTION</span>
            <h2>See yourself here?</h2>
            {match ? (
              <>
                <MatchScore match={match} large />
                <SkillChips match={match} />
              </>
            ) : (
              <p>Update your profile to prepare a match for this project.</p>
            )}
            {outcome ? (
              <div className="success-box" role="status">
                {outcome}
                <Link href="/applications">Track your application →</Link>
              </div>
            ) : (
              <form onSubmit={apply}>
                {p.roles.length > 0 && (
                  <label>
                    Choose your role
                    <select
                      value={selected ?? ""}
                      onChange={(e) => setRole(e.target.value)}
                    >
                      {p.roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.title}
                          {r.filled_count >= r.slots
                            ? " (full — lead review)"
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Say a little hello <span className="optional">optional</span>
                  <textarea
                    rows={4}
                    maxLength={1500}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What draws you to this idea?"
                  />
                </label>
                {error && <ErrorState message={error} />}
                <button
                  className="btn full"
                  disabled={
                    busy ||
                    p.status !== "open" ||
                    !match ||
                    match.band === "WEAK"
                  }
                >
                  {busy
                    ? "Finding your fit…"
                    : match?.band === "WEAK"
                      ? "A few skills to develop"
                      : "Apply to join"}
                  <ArrowUpRight size={17} />
                </button>
                {match?.band === "WEAK" && (
                  <p className="info-note">
                    Develop{" "}
                    {match.missing_skills.length
                      ? match.missing_skills.join(", ")
                      : "more relevant experience"}{" "}
                    to improve this match.{" "}
                    <Link href="/profile">Update your skills</Link> when you’re
                    ready.
                  </p>
                )}
                <small className="muted">
                  Strong matches can join automatically when space is available.
                  Other applications are reviewed by the lead.
                </small>
              </form>
            )}
          </aside>
        )}
      </div>
      {isOwner && (
        <LeadWorkspace project={p} refreshProject={resource.refresh} />
      )}
    </>
  );
}
type Candidate = {
  id: string;
  display_name: string;
  headline: string;
  is_demo: boolean;
  breakdown: Breakdown;
};
type TeamMember = {
  user_id: string;
  role_id: string | null;
  profiles: { display_name: string; headline: string };
  project_roles: { title: string } | null;
};
function LeadWorkspace({
  project,
  refreshProject,
}: {
  project: Detail;
  refreshProject: () => void;
}) {
  const [tab, setTab] = useState("applicants"),
    [role, setRole] = useState(project.roles[0]?.id ?? ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const applicants = useResource<MatchRecord[]>(
      "/api/data/applicants?id=" + project.id,
    ),
    team = useResource<TeamMember[]>("/api/data/team?id=" + project.id);
  const toast = useToast();
  async function decide(id: string, decision: string) {
    setBusy(id);
    setError("");
    try {
      await api("/api/actions", {
        action: "respond",
        kind: "application",
        id,
        decision,
      });
      toast("Application " + decision);
      applicants.refresh();
      team.refresh();
      refreshProject();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <section className="lead-workspace">
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR TEAM, TAKING SHAPE</span>
          <h2>Project workspace</h2>
        </div>
        <Flag size={23} />
      </div>
      <div className="tabs">
        {["applicants", "talent", "team"].map((t) => (
          <button
            key={t}
            className={t === tab ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "talent"
              ? "Find talent"
              : t === "team"
                ? "Your team"
                : "Applicants"}
          </button>
        ))}
      </div>
      {error && <ErrorState message={error} />}
      {tab === "applicants" &&
        (applicants.loading ? (
          <Skeleton />
        ) : applicants.error ? (
          <ErrorState message={applicants.error} retry={applicants.refresh} />
        ) : applicants.data?.length ? (
          <>
            <label className="inline-filter">
              Role
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">All roles</option>
                {project.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            {applicants.data
              .filter((a) => !role || a.role_id === role)
              .map((a) => (
                <article className="record-card" key={a.id}>
                  <div className="record-heading">
                    <div>
                      <h3>{a.profiles?.display_name}</h3>
                      <p>{a.profiles?.headline}</p>
                      <small>
                        {a.project_roles?.title ?? "Whole project"} · {a.status}
                      </small>
                    </div>
                    <MatchScore match={a.breakdown} />
                  </div>
                  <SkillChips match={a.breakdown} />
                  {a.message && <p className="quote">“{a.message}”</p>}
                  {a.status === "pending" && (
                    <div className="record-actions">
                      <button
                        className="btn small"
                        disabled={busy === a.id}
                        onClick={() => decide(a.id, "approved")}
                      >
                        Approve <Check size={15} />
                      </button>
                      <button
                        className="btn secondary small"
                        disabled={busy === a.id}
                        onClick={() => decide(a.id, "rejected")}
                      >
                        Decline application
                      </button>
                    </div>
                  )}
                </article>
              ))}
          </>
        ) : (
          <Empty
            title="Make room for your next teammate."
            description="Applications will appear here, ranked by skill fit. You can also find talent and send an invitation."
          />
        ))}
      {tab === "talent" &&
        (project.roles.length ? (
          <>
            <label className="inline-filter">
              Find people for
              <select
                value={role || project.roles[0].id}
                onChange={(e) => setRole(e.target.value)}
              >
                {project.roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
              </select>
            </label>
            <Talent role={role || project.roles[0].id} project={project.id} />
          </>
        ) : (
          <Empty
            title="Start with a role."
            description="Add a role and the skills you need to discover potential teammates."
            href={`/projects/${project.id}/edit`}
            label="Add a role"
          />
        ))}
      {tab === "team" &&
        (team.loading ? (
          <Skeleton />
        ) : team.error ? (
          <ErrorState message={team.error} retry={team.refresh} />
        ) : (
          <>
            <div className="team-lead-row">
              <span className="avatar">{project.lead_name?.slice(0, 2)}</span>
              <div>
                <b>{project.lead_name}</b>
                <p>Team lead · You</p>
              </div>
            </div>
            {team.data?.map((m) => (
              <div className="team-lead-row" key={m.user_id}>
                <span className="avatar">
                  {m.profiles.display_name.slice(0, 2)}
                </span>
                <div>
                  <b>{m.profiles.display_name}</b>
                  <p>{m.project_roles?.title ?? "Collaborator"}</p>
                </div>
              </div>
            ))}
            {!team.data?.length && (
              <p className="info-note">
                Your team starts with you. Approve an applicant or invite
                someone to help bring it to life.
              </p>
            )}
            {project.roles.map((r) => (
              <div className="capacity" key={r.id}>
                <span>{r.title}</span>
                <progress max={r.slots} value={r.filled_count} />
                <b>
                  {r.filled_count}/{r.slots}
                </b>
              </div>
            ))}
          </>
        ))}
    </section>
  );
}
function Talent({ role, project }: { role: string; project: string }) {
  const resource = useResource<Candidate[]>("/api/data/talent?role=" + role),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [sent, setSent] = useState<string[]>([]);
  const toast = useToast();
  async function invite(id: string) {
    setBusy(id);
    setError("");
    try {
      const r = await api<{ blocked?: boolean; message?: string }>(
        "/api/actions",
        {
          action: "invite",
          project_id: project,
          role_id: role,
          target: id,
          message: "",
        },
      );
      if (r.blocked) throw new Error(r.message);
      setSent((s) => [...s, id]);
      toast("Invitation sent. They’ll decide if it’s a fit.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      {error && <ErrorState message={error} />}
      {resource.loading ? (
        <Skeleton />
      ) : resource.error ? (
        <ErrorState message={resource.error} retry={resource.refresh} />
      ) : resource.data?.length ? (
        resource.data.map((c) => (
          <article className="record-card" key={c.id}>
            <div className="record-heading">
              <div>
                <h3>
                  {c.display_name}
                  {c.is_demo && <span className="chip">Demo</span>}
                </h3>
                <p>{c.headline}</p>
              </div>
              <MatchScore match={c.breakdown} />
            </div>
            <SkillChips match={c.breakdown} />
            <div className="record-actions">
              <button
                className="btn secondary small"
                disabled={
                  busy === c.id ||
                  c.breakdown.band === "WEAK" ||
                  sent.includes(c.id)
                }
                onClick={() => invite(c.id)}
              >
                {sent.includes(c.id)
                  ? "Invitation sent"
                  : c.breakdown.band === "WEAK"
                    ? "Below invitation threshold"
                    : "Invite to project"}
                <ArrowUpRight size={15} />
              </button>
              {c.breakdown.band === "WEAK" && (
                <small className="muted">
                  Missing requirements or limited skill alignment.
                </small>
              )}
            </div>
          </article>
        ))
      ) : (
        <Empty
          title="Your people are on their way."
          description="No matching profiles are ready for this role yet. Check your required skills and try again later."
        />
      )}
    </>
  );
}
