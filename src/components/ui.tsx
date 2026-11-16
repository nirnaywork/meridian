"use client";
import { useAuth } from "./auth-provider";
import {
  useEffect,
  useState,
  createContext,
  useContext,
  useCallback,
} from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Compass,
  Sun,
  Moon,
  AlertCircle,
  X,
} from "lucide-react";
import type { SkillOverlap, Project } from "@/lib/types";
import {BestRoleMatch} from './role-match';
export function Logo() {
  const { signedIn, loading } = useAuth();
  return (
    <Link
      href={signedIn ? "/projects" : "/"}
      aria-busy={loading}
      aria-disabled={loading}
      onClick={(e) => {
        if (loading) e.preventDefault();
      }}
      className="logo"
      aria-label="Meridian home"
    >
      <span className="logo-symbol">
        <i />
        <i />
        <i />
      </span>
      meridian<span className="logo-dot">.</span>
    </Link>
  );
}
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(
    () => setDark(document.documentElement.classList.contains("dark")),
    [],
  );
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={dark ? "Use light theme" : "Use dark theme"}
      onClick={() => {
        document.documentElement.classList.toggle("dark");
        localStorage.setItem("meridian-theme", dark ? "light" : "dark");
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) window.location.href = "/sign-in";
    if (res.status === 428) window.location.href = "/onboarding";
    throw Object.assign(new Error(data.message ?? "Please try again"), {
      verify: data.verify,
    });
  }
  return data;
}
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError("");
    api<T>(path)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [path, reload]);
  return {
    data,
    setData,
    error,
    loading,
    refresh: () => setReload((v) => v + 1),
  };
}
const ToastContext = createContext<(message: string) => void>(() => {});
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(""), 5000);
      return () => clearTimeout(t);
    }
  }, [message]);
  const notify = useCallback((m: string) => setMessage(m), []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          {message}
          <button
            className="icon-btn"
            onClick={() => setMessage("")}
            aria-label="Dismiss notification"
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <span>{message}</span>
      {retry && (
        <button className="text-btn" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function Empty({
  title,
  description,
  href,
  label,
}: {
  title: string;
  description: string;
  href?: string;
  label?: string;
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Compass size={30} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      {href && (
        <Link className="btn" href={href}>
          {label}
          <ArrowUpRight size={16} />
        </Link>
      )}
    </div>
  );
}
export function Skeleton() {
  return (
    <div className="card-grid" aria-label="Loading" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div className="project-card skeleton" key={i}>
          <div />
          <div />
          <div />
          <div />
        </div>
      ))}
    </div>
  );
}
export function SkillChips({ match }: { match: SkillOverlap }) {
  return (
    <div className="chips">
      {match.matched_skills.map((s) => (
        <span className="chip matched" key={s}>
          <Check size={12} />
          {s}
        </span>
      ))}
      {match.missing_skills.map((s) => (
        <span className="chip missing" key={s} title="A skill to develop">
          {s}
        </span>
      ))}
    </div>
  );
}
export function ProjectCard({
  project,
  index = 0,
}: {
  project: Project;
  index?: number;
}) {
  const icons = ["◈", "↗", "◉", "⌘", "✳", "⊹"];
  return (
    <article className="project-card">
      <div className="card-top">
        <span className={`project-icon tone-${index % 4}`}>
          {icons[index % icons.length]}
        </span>
        <span className="eyebrow">{project.category}</span>
        <span className="status-dot" title="Open project" />
      </div>
      <Link href={`/projects/${project.id}`} className="card-title">
        <h2>{project.title}</h2>
        <ArrowUpRight size={19} />
      </Link>
      <p className="card-description">{project.description}</p>
      <div className="chips">
        {project.domains?.map((d) => (
          <span className="chip" key={d}>
            {d}
          </span>
        ))}
      </div>
      {project.open_roles && project.open_roles.length > 0 && (
        <p className="open-roles">
          Open roles:{" "}
          {project.open_roles
            .map((role) => `${role.title} (${role.available})`)
            .join(" · ")}
        </p>
      )}
      <div className="card-meta">
        <span>
          {project.commitment === "casual"
            ? "2–5"
            : project.commitment === "part-time"
              ? "5–10"
              : "10+"}{" "}
          hrs / week
        </span>
        <span>·</span>
        <span>{project.duration}</span>
      </div>
      <BestRoleMatch roles={project.roles??[]} compact />
      <div className="card-divider" />
      <p className="role-label">Led by {project.lead_name}{project.is_demo?' · Demo':''}</p>
    </article>
  );
}
