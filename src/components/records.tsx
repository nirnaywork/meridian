"use client";
import {RoleMatchBadge} from './role-match';
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Plus, Check, ArrowRight } from "lucide-react";
import {
  api,
  useResource,
  useToast,
  ErrorState,
  Empty,
  Skeleton,
  SkillChips,
} from "./ui";
import type { MatchRecord, Project } from "@/lib/types";
export function Records({ invitations = false }: { invitations?: boolean }) {
  const resource = useResource<MatchRecord[]>(
      "/api/data/" + (invitations ? "invitations" : "applications"),
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const toast = useToast();
  async function respond(id: string, decision: string) {
    setBusy(id);
    setError("");
    try {
      await api("/api/actions", {
        action: "respond",
        kind: invitations ? "invitation" : "application",
        id,
        decision,
      });
      toast(
        decision === "accepted"
          ? "You’re on the team!"
          : "Updated successfully",
      );
      resource.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      <div className="page-heading">
        <span className="eyebrow">CONNECTIONS IN THE MAKING</span>
        <h1>{invitations ? "You’ve caught their eye." : "Your next steps."}</h1>
        <p>
          {invitations
            ? "A team sees something in your skills. See if the feeling is mutual."
            : "Follow your applications, from a first hello to a shared project."}
        </p>
      </div>
      {error && <ErrorState message={error} />}
      {resource.loading ? (
        <Skeleton />
      ) : resource.error ? (
        <ErrorState message={resource.error} retry={resource.refresh} />
      ) : resource.data?.length ? (
        <div className="records-list">
          {resource.data.map((r) => (
            <article className="record-card" key={r.id}>
              <div className="record-heading">
                <div>
                  <span className={`status-badge ${r.status}`}>{r.status}</span>
                  <Link
                    href={`/projects/${r.project_id}`}
                    className="card-title"
                  >
                    <h2>{r.projects.title}</h2>
                    <ArrowUpRight size={18} />
                  </Link>
                  <p>
                    {r.project_roles?.title ?? "Whole project"} ·{" "}
                    {new Date(r.created_at).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <RoleMatchBadge snapshot={r.matchPercent}/>
              </div>
              <SkillChips match={r.breakdown} />
              {r.message && <p className="quote">{r.message}</p>}
              {r.status === "pending" && (
                <div className="record-actions">
                  {invitations ? (
                    <>
                      <button
                        className="btn small"
                        disabled={busy === r.id}
                        onClick={() => respond(r.id, "accepted")}
                      >
                        Accept & join <Check size={16} />
                      </button>
                      <button
                        className="btn secondary small"
                        disabled={busy === r.id}
                        onClick={() => respond(r.id, "declined")}
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    <button
                      className="text-btn"
                      disabled={busy === r.id}
                      onClick={() => respond(r.id, "withdrawn")}
                    >
                      Withdraw application
                    </button>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title={
            invitations
              ? "Good connections take a little time."
              : "Every collaboration starts with a hello."
          }
          description={
            invitations
              ? "Invitations from team leads will appear here. A thoughtful profile helps the right people find you."
              : "Find a project that sparks your curiosity and send your first application."
          }
          href={invitations ? "/profile" : "/projects"}
          label={invitations ? "Polish your profile" : "Explore projects"}
        />
      )}
    </>
  );
}
export function MyProjects() {
  const r = useResource<Project[]>("/api/data/my-projects");
  return (
    <>
      <div className="section-heading page-heading">
        <div>
          <span className="eyebrow">IDEAS YOU’RE BRINGING TO LIFE</span>
          <h1>Your projects.</h1>
          <p>A little direction. The right people. Something worth making.</p>
        </div>
        <Link className="btn" href="/projects/new">
          <Plus size={17} />
          New project
        </Link>
      </div>
      {r.loading ? (
        <Skeleton />
      ) : r.error ? (
        <ErrorState message={r.error} retry={r.refresh} />
      ) : r.data?.length ? (
        <div className="card-grid">
          {r.data.map((p, i) => (
            <article className="project-card" key={p.id}>
              <div className="card-top">
                <span className={`project-icon tone-${i % 4}`}>↗</span>
                <span className="eyebrow">{p.category}</span>
                <span className={`status-badge ${p.status}`}>
                  {p.status.replace("_", " ")}
                </span>
              </div>
              <Link href={`/projects/${p.id}`} className="card-title">
                <h2>{p.title}</h2>
                <ArrowUpRight size={18} />
              </Link>
              <p className="card-description">{p.description}</p>
              <div className="chips">
                {p.roles.map((role) => (
                  <span key={role.id} className="chip">
                    {role.title} · {role.filled_count}/{role.slots}
                  </span>
                ))}
              </div>
              <div className="card-divider" />
              <div className="card-bottom">
                <Link href={`/projects/${p.id}`} className="text-btn">
                  Manage your team <ArrowRight size={16} />
                </Link>
                <Link href={`/projects/${p.id}/edit`} className="text-btn">
                  Edit
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          title="An idea is a great place to start."
          description="You don’t need a perfect plan. Tell people what you want to build, and find the skills to make it happen."
          href="/projects/new"
          label="Start your first project"
        />
      )}
    </>
  );
}
