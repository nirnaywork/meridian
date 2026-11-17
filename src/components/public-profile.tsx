"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  profileMetadataSchema,
  type ProfileMetadata,
} from "@/lib/collaboration";
import { api, useResource, ErrorState, Skeleton, Empty, useToast } from "./ui";
const empty: ProfileMetadata = {
  github: "",
  linkedin: "",
  website: "",
  custom: [],
  visibility: "private",
};
export function ProfileLinksEditor({ id }: { id: string }) {
  const r = useResource<{
    links: Omit<ProfileMetadata, "visibility">;
    visibility: "private" | "public";
  }>("/api/profile-metadata");
  const [form, setForm] = useState(empty),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const toast = useToast();
  useEffect(() => {
    if (r.data)
      setForm({ ...empty, ...r.data.links, visibility: r.data.visibility });
  }, [r.data]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const parsed = profileMetadataSchema.parse(form);
      await api("/api/profile-metadata", parsed);
      setForm(parsed);
      toast("Links and visibility saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="content-panel profile-links-editor" id="profile-links">
      <div className="section-heading">
        <h2>Links & visibility</h2>
        <Link href={`/u/${id}`}>Preview profile →</Link>
      </div>
      <p className="muted">
        These details never change your embedding. Profiles are visible only to
        signed-in Meridian users.
      </p>
      {r.loading ? (
        <Skeleton />
      ) : r.error ? (
        <ErrorState message={r.error} retry={r.refresh} />
      ) : (
        <form onSubmit={save}>
          {(["github", "linkedin", "website"] as const).map((key) => (
            <label key={key}>
              {key === "github"
                ? "GitHub"
                : key === "linkedin"
                  ? "LinkedIn"
                  : "Portfolio / Website"}
              <input
                value={form[key]}
                maxLength={2048}
                placeholder="https://"
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          {form.custom.map((link, i) => (
            <div className="custom-link-row" key={i}>
              <label>
                Link label
                <input
                  value={link.label}
                  maxLength={40}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      custom: form.custom.map((c, j) =>
                        j === i ? { ...c, label: e.target.value } : c,
                      ),
                    })
                  }
                />
              </label>
              <label>
                Link URL
                <input
                  value={link.url}
                  maxLength={2048}
                  placeholder="https://"
                  onChange={(e) =>
                    setForm({
                      ...form,
                      custom: form.custom.map((c, j) =>
                        j === i ? { ...c, url: e.target.value } : c,
                      ),
                    })
                  }
                />
              </label>
              <button
                type="button"
                className="text-btn"
                onClick={() =>
                  setForm({
                    ...form,
                    custom: form.custom.filter((_, j) => j !== i),
                  })
                }
              >
                Remove link
              </button>
            </div>
          ))}
          <button
            type="button"
            className="text-btn"
            disabled={form.custom.length >= 3}
            onClick={() =>
              setForm({
                ...form,
                custom: [...form.custom, { label: "", url: "" }],
              })
            }
          >
            Add custom link
          </button>
          <label>
            Profile visibility
            <select
              value={form.visibility}
              onChange={(e) =>
                setForm({
                  ...form,
                  visibility: e.target.value as ProfileMetadata["visibility"],
                })
              }
            >
              <option value="private">Team-only / Private</option>
              <option value="public">Public to signed-in users</option>
            </select>
          </label>
          <p className="muted">
            Private: only you, current teammates, and people you have an
            application or invitation relationship with can see your full
            profile. Your name and avatar remain visible where you participate.
          </p>
          {error && <ErrorState message={error} />}
          <button className="btn" disabled={busy}>
            {busy ? "Saving…" : "Save links & visibility"}
          </button>
        </form>
      )}
    </section>
  );
}
export function PublicProfile({ id }: { id: string }) {
  const r = useResource<any>("/api/profiles/" + id);
  if (r.loading) return <Skeleton />;
  if (r.error) return <ErrorState message={r.error} retry={r.refresh} />;
  const p = r.data;
  if (!p) return null;
  const links = [
    ["GitHub", p.links.github],
    ["LinkedIn", p.links.linkedin],
    ["Website", p.links.website],
    ...(p.links.custom ?? []).map((c: any) => [c.label, c.url]),
  ].filter(([, url]) => Boolean(url));
  return (
    <>
      <header className="page-heading">
        <span className="eyebrow">MERIDIAN PROFILE</span>
        {p.avatar_url && (
          <img className="public-avatar" src={p.avatar_url} alt="" />
        )}
        <h1>{p.display_name}</h1>
        <p>{p.headline}</p>
        {p.university && <p>{p.university}</p>}
      </header>
      <section className="content-panel">
        <h2>About</h2>
        <p className="preserve-lines">{p.bio || "No bio added yet."}</p>
        {p.interests && <p>Interests: {p.interests}</p>}
        <div className="chips">
          {p.domains.map((d: string) => (
            <span className="chip" key={d}>
              {d}
            </span>
          ))}
        </div>
      </section>
      <section className="content-panel">
        <h2>Skills</h2>
        <div className="chips">
          {p.skills.map((s: any) => (
            <span key={s.name} className="chip">
              {s.name} · {s.proficiency}
            </span>
          ))}
        </div>
      </section>
      {links.length > 0 && (
        <section className="content-panel">
          <h2>Portfolio & links</h2>
          <div className="chips">
            {links.map(([label, url]) => (
              <a
                key={label + url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn secondary"
              >
                {label} ↗
              </a>
            ))}
          </div>
        </section>
      )}
      <section className="content-panel">
        <h2>Projects</h2>
        {p.projects.length ? (
          p.projects.map((project: any) => (
            <article key={project.id} className="record-card">
              <Link href={`/projects/${project.id}`}>{project.title}</Link>
              <p>
                {project.participation} · {project.status.replaceAll("_", " ")}
              </p>
            </article>
          ))
        ) : (
          <p className="muted">No projects to show.</p>
        )}
      </section>
    </>
  );
}
