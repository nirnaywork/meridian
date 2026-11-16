"use client";
import { useEffect, useState } from "react";
import { Search, Plus, X, Check } from "lucide-react";
import { api } from "./ui";
import { taxonomy } from "@/data/taxonomy";
import type { Skill } from "@/lib/types";
export function SkillsPicker({
  value,
  onChange,
  role = false,
  domains = [],
}: {
  value: Skill[];
  onChange: (skills: Skill[]) => void;
  role?: boolean;
  domains?: string[];
}) {
  const [q, setQ] = useState(""),
    [results, setResults] = useState<Skill[]>([]),
    [focused, setFocused] = useState(false),
    [scroll, setScroll] = useState(0);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      Promise.resolve(
        taxonomy
          .filter(
            (s) =>
              (!domains.length || s.domains.some((d) => domains.includes(d))) &&
              [s.name, ...s.aliases].some((n) =>
                n.toLowerCase().includes(q.toLowerCase()),
              ),
          )
          ,
      )
        .then((d) => {
          if (live) setResults(d);
        })
        .catch(() => {});
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q, domains.join("|")]);
  function add(skill: Skill) {
    if (!value.some((s) => s.name.toLowerCase() === skill.name.toLowerCase()))
      onChange([
        ...value,
        {
          ...skill,
          ...(role
            ? { importance: "required" as const }
            : { proficiency: "intermediate" as const }),
        },
      ]);
    setQ("");
    setFocused(false);
  }
  return (
    <div className="skills-picker">
      <label className="search-input">
        <Search size={18} />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setFocused(true);
          }}
          onFocus={() => setFocused(true)}
          placeholder="Search skills — React, design, Python…"
          aria-label="Search skills"
          maxLength={70}
        />
      </label>
      {focused && (
        <div className="skill-results">
          <div
            style={{ height: 280, overflow: "auto" }}
            onScroll={(e) => setScroll(e.currentTarget.scrollTop)}
          >
            <div
              style={{
                paddingTop: Math.floor(scroll / 56) * 56,
                paddingBottom:
                  Math.max(0, results.length - Math.floor(scroll / 56) - 7) *
                  56,
              }}
            >
              {results
                .filter((r) => !value.some((s) => s.name === r.name))
                .slice(Math.floor(scroll / 56), Math.floor(scroll / 56) + 7)
                .map((r) => (
                  <button
                    style={{ height: 56 }}
                    type="button"
                    key={r.name}
                    onClick={() => add(r)}
                  >
                    <span>
                      {r.name}
                      <small>
                        {r.category}
                        {r.is_verified ? "" : " · Community skill"}
                      </small>
                    </span>
                    <Plus size={16} />
                  </button>
                ))}
            </div>
          </div>
          {q.trim() &&
            !results.some(
              (r) => r.name.toLowerCase() === q.trim().toLowerCase(),
            ) && (
              <button type="button" onClick={() => add({ name: q.trim() })}>
                <span>
                  Add “{q.trim()}”
                  <small>
                    Saved as a community skill, pending verification
                  </small>
                </span>
                <Plus size={16} />
              </button>
            )}
          <button
            className="text-btn"
            type="button"
            onClick={() => setFocused(false)}
          >
            Done browsing <Check size={14} />
          </button>
        </div>
      )}
      <div className="selected-skills">
        {value.map((s, i) => (
          <div key={s.name}>
            <span className="skill-name">{s.name}</span>
            <select
              aria-label={`${s.name} ${role ? "importance" : "proficiency"}`}
              value={role ? s.importance : s.proficiency}
              onChange={(e) =>
                onChange(
                  value.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          [role ? "importance" : "proficiency"]: e.target.value,
                        }
                      : x,
                  ),
                )
              }
            >
              {(role
                ? ["required", "preferred"]
                : ["beginner", "intermediate", "advanced"]
              ).map((p) => (
                <option key={p} value={p}>
                  {p[0].toUpperCase() + p.slice(1)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Remove ${s.name}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
