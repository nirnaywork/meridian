"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./ui";
import Link from "next/link";
import { X } from "lucide-react";
export function usePollingResource<T>(path: string, interval = 30000) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let live = true;
    setData(null);
    setLoading(true);
    async function load() {
      try {
        const result = await api<T>(path);
        if (live) {
          setData(result);
          setError("");
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, interval);
    const visible = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [path, interval]);
  useEffect(() => {
    if (!version) return;
    let live = true;
    api<T>(path)
      .then((v) => {
        if (live) {
          setData(v);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version, path]);
  return { data, setData, error, loading, refresh };
}
export function PersonLink({
  id,
  name,
  avatar,
  lead = false,
}: {
  id: string;
  name: string;
  avatar?: string | null;
  lead?: boolean;
}) {
  return (
    <Link href={`/u/${id}`} className="person-link">
      {avatar && <img className="mini-avatar" src={avatar} alt="" />}
      <span>{name}</span>
      {lead && <span className="chip">Lead</span>}
    </Link>
  );
}
export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current!,
      previous = document.activeElement as HTMLElement | null,
      overflow = document.body.style.overflow;
    el.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      el.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="collab-dialog"
      aria-label={title}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div>
        <header className="section-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
