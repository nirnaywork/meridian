"use client";
import {isReadOnly} from "@/lib/collaboration";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowRight, ArrowLeft, Trash2 } from "lucide-react";
import { api, ErrorState } from "./ui";
import { DomainPicker } from "./domain-picker";
import {DomainSuggestions,LegacyDomainBanner} from './domain-guidance';
import { taxonomyFiles } from "@/data/taxonomy";
import { SkillsPicker } from "./skills-picker";
import type { Project, Role } from "@/lib/types";
import {requiredDomains} from '@/lib/validation';
const emptyProject = {
  title: "",
  description: "",
  category: "Web",
  tags: [],
  commitment: "part-time",
  duration: "4–8 weeks",
  team_size: 4,
  status: "open",
  revision: 0,
  roles: [],
  domains: [],
} as unknown as Project;
export function ProjectEditor({ id }: { id?: string }) {
  const [form, setForm] = useState<Project>(emptyProject),
    [step, setStep] = useState(0),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(!!id),
    router = useRouter();
  useEffect(() => {
    if (id)
      api<Project>("/api/data/project?id=" + id)
        .then(setForm)
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
  }, [id]);
  const field = (k: keyof Project, v: unknown) =>
    setForm((f) => ({ ...f, [k]: v }));
  function roleField(i: number, k: keyof Role, v: unknown) {
    field(
      "roles",
      form.roles.map((r, j) => (i === j ? { ...r, [k]: v } : r)),
    );
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if(!id&&!requiredDomains.safeParse(form.domains??[]).success){setError('Choose at least one domain.');return;}
    if(form.roles.some(r=>!r.domains?.length&&!form.domains?.length&&!r.id)){setError('Choose a domain for each new role, or project domains to inherit.');return;}
    if (step === 0) {
      setStep(1);
      return;
    }
    setBusy(true);
    try {
      const result = await api<{ id: string }>("/api/data/project", {
        ...form,
        tags: form.tags.filter(Boolean),
      });
      router.push("/projects/" + result.id + (id ? "" : "/workspace"));
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if(id && !loading && isReadOnly(form.status))return <section className="content-panel"><h1>This project is read-only</h1><p>Completed, cancelled and archived projects keep their history.</p><Link href={`/projects/${id}/workspace`}>Open Team Dashboard</Link></section>;
  return (
    <div className="editor-width">
      <Link href="/my-projects" className="back-link">
        <ArrowLeft size={15} />
        My projects
      </Link>
      <div className="page-heading">
        <span className="eyebrow">MAKE ROOM FOR SOMETHING GREAT</span>
        <h1>{id ? "Shape your project." : "Start with an idea."}</h1>
        <p>Give the right people a reason to say “I’m in.”</p>
      </div>
      <div className="steps">
        <span className="done">
          <i>1</i>The idea
        </span>
        <span className={step === 1 ? "done" : ""}>
          <i>2</i>The team
        </span>
      </div>
      <form onSubmit={submit} className="form-panel">
        {id&&!form.domains?.length&&<LegacyDomainBanner id={'project:'+id} href="#project-domains"/>}
        <div id="project-domains" />
        <DomainSuggestions skills={form.roles.flatMap(r=>r.skills)} value={form.domains??[]} onConfirm={v=>field('domains',v)}/>
        <label>
          Add an editable role template
          <select
            value=""
            onChange={(e) => {
              const t = taxonomyFiles
                .flatMap((f) => f.role_templates)
                .find((t) => t.slug === e.target.value);
              if (t)
                field("roles", [
                  ...form.roles,
                  {
                    title: t.title,
                    description: "",
                    slots: 1,
                    filled_count: 0,
                    domains: [t.domain],
                    skills: t.required_skills.map((name) => ({
                      name,
                      importance: "required",
                    })),
                  },
                ]);
            }}
          >
            <option value="">Choose a designation</option>
            {taxonomyFiles
              .flatMap((f) => f.role_templates)
              .filter(
                (t) => !form.domains?.length || form.domains.includes(t.domain),
              )
              .map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.title}
                </option>
              ))}
          </select>
        </label>
        <DomainPicker
          value={form.domains ?? []}
          onChange={(v) => field("domains", v)}
        />
        {step === 0 ? (
          <>
            <label>
              Project name
              <input
                required
                minLength={3}
                maxLength={120}
                value={form.title}
                onChange={(e) => field("title", e.target.value)}
                placeholder="Give your idea a name"
              />
            </label>
            <label>
              What are you building?
              <textarea
                required
                minLength={30}
                maxLength={8000}
                rows={7}
                value={form.description}
                onChange={(e) => field("description", e.target.value)}
                placeholder="The problem, your idea, and what you’d love to make together…"
              />
            </label>
            <div className="form-grid">
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(e) => field("category", e.target.value)}
                >
                  {[
                    "Web",
                    "Mobile",
                    "ML / AI",
                    "Data",
                    "Design",
                    "Climate",
                    "Social impact",
                    "Game Development",
                    "Embedded / IoT",
                    "Education",
                    "Other",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Commitment
                <select
                  value={form.commitment}
                  onChange={(e) => field("commitment", e.target.value)}
                >
                  <option value="casual">Casual · 2–5 hrs / week</option>
                  <option value="part-time">Part-time · 5–10 hrs / week</option>
                  <option value="intensive">Intensive · 10+ hrs / week</option>
                </select>
              </label>
              <label>
                Duration
                <input
                  required
                  maxLength={80}
                  value={form.duration}
                  onChange={(e) => field("duration", e.target.value)}
                />
              </label>
              <label>
                Team size (including you)
                <input
                  type="number"
                  required
                  min={2}
                  max={50}
                  value={form.team_size}
                  onChange={(e) => field("team_size", Number(e.target.value))}
                />
              </label>
            </div>
            <label>
              Tags (comma-separated)
              <input
                value={form.tags.join(", ")}
                onChange={(e) =>
                  field(
                    "tags",
                    e.target.value.split(",").map((t) => t.trim()),
                  )
                }
                placeholder="Open source, hackathon, social good"
              />
            </label>
          </>
        ) : (
          <>
            <div className="section-heading">
              <div>
                <h2>Who’s missing from your team?</h2>
                <p>Specific skills make better connections.</p>
              </div>
              <button
                type="button"
                className="btn secondary small"
                onClick={() =>
                  field("roles", [
                    ...form.roles,
                    {
                      title: "",
                      description: "",
                      slots: 1,
                      filled_count: 0,
                      skills: [],
                      domains: [],
                    },
                  ])
                }
              >
                <Plus size={16} />
                Add role
              </button>
            </div>
            {form.roles.length === 0 && (
              <div className="info-note">
                No roles yet. Add specific roles, or invite people to apply to
                the project as a whole.
              </div>
            )}
            {form.roles.map((r, i) => (
              <div className="role-editor" key={r.id??i}>
                <div className="section-heading">
                  <span className="eyebrow">
                    ROLE {String(i + 1).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove role ${i + 1}`}
                    onClick={() =>
                      field(
                        "roles",
                        form.roles.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <div className="form-grid">
                  <label>
                    Role title
                    <input
                      required
                      minLength={2}
                      maxLength={100}
                      value={r.title}
                      onChange={(e) => roleField(i, "title", e.target.value)}
                      placeholder="e.g. Frontend Developer"
                    />
                  </label>
                  <label>
                    Openings
                    <input
                      type="number"
                      min={Math.max(1, r.filled_count)}
                      max={49}
                      required
                      value={r.slots}
                      onChange={(e) =>
                        roleField(i, "slots", Number(e.target.value))
                      }
                    />
                  </label>
                </div>
                <label>
                  What will they do?
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={r.description}
                    onChange={(e) =>
                      roleField(i, "description", e.target.value)
                    }
                  />
                </label>
                <DomainPicker value={r.domains??[]} onChange={v=>roleField(i,'domains',v)}/>
                <p className="muted">With no separate selection, this role inherits the project’s domains.</p>
                <SkillsPicker
                  domains={form.domains}
                  role
                  value={r.skills}
                  onChange={(s) => roleField(i, "skills", s)}
                />
              </div>
            ))}
            {id && <p className="info-note">Project status: {form.status.replaceAll('_',' ')}. Manage lifecycle changes in the <Link href={`/projects/${id}/workspace`}>Team Dashboard</Link>.</p>}
          </>
        )}
        {error && <ErrorState message={error} />}
        <div className="form-actions">
          {step === 1 && (
            <button
              className="text-btn"
              type="button"
              onClick={() => setStep(0)}
            >
              <ArrowLeft size={16} />
              Back
            </button>
          )}
          <button className="btn" disabled={busy || loading}>
            {busy
              ? "Preparing your project’s matches…"
              : step === 0
                ? "Build your team"
                : id
                  ? "Save changes"
                  : "Publish project"}
            <ArrowRight size={17} />
          </button>
        </div>
      </form>
    </div>
  );
}
