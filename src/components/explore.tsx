"use client";
import { useState, useEffect } from "react";
import {
  api,
  useResource,
  ProjectCard,
  Skeleton,
  ErrorState,
  Empty,
} from "./ui";
import { taxonomyFiles } from "@/data/taxonomy";
import type { Project } from "@/lib/types";
export function Explore() {
  const [filters, setFilters] = useState({
      search: "",
      sort: "newest",
      field: "",
      domain: "",
      skill: "",
      role: "",
      commitment: "",
      status: "open",
    }),
    [extra, setExtra] = useState<Project[]>([]),
    [ended, setEnded] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const path = "/api/data/projects?" + new URLSearchParams(filters),
    r = useResource<Project[]>(path);
  useEffect(() => {
    setExtra([]);
    setEnded(false);
  }, [path]);
  const rows = [...(r.data ?? []), ...extra];
  async function more() {
    setBusy(true);
    try {
      const last = rows.at(-1)!;
      const next = await api<Project[]>(
        path +
          "&cursor=" +
          encodeURIComponent(
            JSON.stringify({ id: last.id, key: Number(last.sort_key) }),
          ),
      );
      setExtra((v) => [...v, ...next]);
      setEnded(next.length < 12);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <h1>Explore projects.</h1>
        <p>
          Browse ideas from every field. Every open project welcomes your
          application.
        </p>
      </div>
      <div className="filter-panel">
        {(["search", "skill", "role"] as const).map((k) => (
          <label key={k}>
            {k}
            <input
              value={filters[k]}
              onChange={(e) => setFilters({ ...filters, [k]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Sort
          <select
            aria-label="Sort"
            value={filters.sort}
            onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="roles">Most roles open</option>
          </select>
        </label>
        <label>
          Field
          <select
            value={filters.field}
            onChange={(e) =>
              setFilters({ ...filters, field: e.target.value, domain: "" })
            }
          >
            <option value="">All fields</option>
            {taxonomyFiles.map((f) => (
              <option key={f.field.slug}>{f.field.name}</option>
            ))}
          </select>
        </label>
        <label>
          Domain
          <select
            value={filters.domain}
            onChange={(e) => setFilters({ ...filters, domain: e.target.value })}
          >
            <option value="">All domains</option>
            {taxonomyFiles
              .filter((f) => !filters.field || f.field.name === filters.field)
              .flatMap((f) => f.domains)
              .map((d) => (
                <option key={d.slug}>{d.name}</option>
              ))}
          </select>
        </label>
        <label>
          Commitment
          <select
            value={filters.commitment}
            onChange={(e) =>
              setFilters({ ...filters, commitment: e.target.value })
            }
          >
            <option value="">Any</option>
            {["casual", "part-time", "intensive"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          >
            {["open", "closed", "in_progress", "all"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
      </div>
      {r.loading ? (
        <Skeleton />
      ) : r.error ? (
        <ErrorState message={r.error} retry={r.refresh} />
      ) : rows.length ? (
        <div className="card-grid">
          {rows.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </div>
      ) : (
        <Empty
          title="No projects found."
          description="Try a different field, domain, or search."
        />
      )}
      {error && <ErrorState message={error} />}{" "}
      {!ended && (r.data?.length ?? 0) >= 12 && (
        <button className="btn secondary" disabled={busy} onClick={more}>
          {busy ? "Loading…" : "More projects"}
        </button>
      )}
    </>
  );
}
