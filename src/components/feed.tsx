"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  X,
  ArrowDown,
  Compass,
} from "lucide-react";
import {
  api,
  useResource,
  ProjectCard,
  Skeleton,
  Empty,
  ErrorState,
} from "./ui";
import type { Project, Profile } from "@/lib/types";
export function Feed() {
  const profile = useResource<Profile>("/api/data/profile");
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [skill, setSkill] = useState(""),
    [role, setRole] = useState(""),
    [commitment, setCommitment] = useState(""),
    [filters, setFilters] = useState(false),
    [extra, setExtra] = useState<Project[]>([]),
    [more, setMore] = useState(false),
    [end, setEnd] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQuery(search), 250);
    return () => clearTimeout(t);
  }, [search]);
  const params = new URLSearchParams({
      search: query,
      skill,
      role,
      commitment,
    }),
    path = "/api/data/feed?" + params;
  const resource = useResource<Project[]>(path);
  useEffect(() => {
    setExtra([]);
    setEnd(false);
  }, [path]);
  const projects = [...(resource.data ?? []), ...extra];
  async function loadMore() {
    const last = projects.at(-1);
    if (!last?.breakdown) return;
    setMore(true);
    try {
      const next = await api<Project[]>(
        path +
          "&cursor=" +
          encodeURIComponent(
            JSON.stringify({ id: last.id, score: last.breakdown.final_score }),
          ),
      );
      setExtra((v) => [...v, ...next]);
      if (next.length < 12) setEnd(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMore(false);
    }
  }
  return (
    <>
      <div className="workspace-top">
        <span>YOUR NEXT CHAPTER STARTS HERE</span>
        <Link href="/profile">
          Your profile <ArrowUpRight size={15} />
        </Link>
      </div>
      <div className="feed-hero">
        <div>
          <span className="eyebrow">
            <span className="green-dot" /> MADE FOR YOUR SKILLS
          </span>
          <h1>
            Find your next
            <br />
            <em>“let’s build this.”</em>
          </h1>
          <p>
            Good ideas need the right people. These could use someone like you.
          </p>
        </div>
        <div className="feed-orbit">
          <i />
          <i />
          <i />
          <span>✳</span>
          <b>
            YOUR SKILLS.
            <br />
            SHARED POSSIBILITIES.
          </b>
        </div>
      </div>
      <div className="feed-intro">
        <div>
          <h2>A little more you.</h2>
          <p>Projects ranked by how your skills align. Find your spark.</p>
        </div>
        <span className="subtle-pill">
          <Compass size={14} />
          Matched to {profile.data?.display_name.split(" ")[0] ?? "you"}
        </span>
      </div>
      <div className="feed-controls">
        <label className="search-input">
          <Search size={18} />
          <input
            aria-label="Search projects"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ideas, projects, and possibilities…"
          />
        </label>
        <button
          className={`btn secondary ${filters ? "selected" : ""}`}
          onClick={() => setFilters(!filters)}
        >
          <SlidersHorizontal size={16} />
          Filters
          {[skill, role, commitment].filter(Boolean).length > 0 && (
            <b>{[skill, role, commitment].filter(Boolean).length}</b>
          )}
        </button>
      </div>
      {filters && (
        <div className="filter-panel">
          <label>
            Skill
            <input
              value={skill}
              onChange={(e) => setSkill(e.target.value)}
              placeholder="e.g. React"
            />
          </label>
          <label>
            Role
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Designer"
            />
          </label>
          <label>
            Commitment
            <select
              value={commitment}
              onChange={(e) => setCommitment(e.target.value)}
            >
              <option value="">Any commitment</option>
              <option value="casual">Casual · 2–5 hrs/week</option>
              <option value="part-time">Part-time · 5–10 hrs/week</option>
              <option value="intensive">Intensive · 10+ hrs/week</option>
            </select>
          </label>
          <button
            className="text-btn"
            onClick={() => {
              setSkill("");
              setRole("");
              setCommitment("");
            }}
          >
            Clear <X size={14} />
          </button>
        </div>
      )}
      <div className="results-label">
        <span>YOUR DISCOVERY FEED</span>
        <span>Best alignment first ↘</span>
      </div>
      {resource.loading ? (
        <Skeleton />
      ) : resource.error ? (
        <ErrorState message={resource.error} retry={resource.refresh} />
      ) : projects.length ? (
        <div className="card-grid">
          {projects.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </div>
      ) : (
        <Empty
          title="Your next team is still out there."
          description="Try widening your filters or updating your skills. New directions start with a little curiosity."
          href="/profile"
          label="Update your skills"
        />
      )}
      {error && <ErrorState message={error} />}{" "}
      {!resource.loading && !end && (resource.data?.length ?? 0) >= 12 && (
        <div className="load-more">
          <button className="btn secondary" disabled={more} onClick={loadMore}>
            {more ? "Finding more…" : "Explore more projects"}
            <ArrowDown size={16} />
          </button>
        </div>
      )}
      <div className="feed-footnote">
        A match is a starting point. A conversation can turn it into something
        great.
      </div>
    </>
  );
}
