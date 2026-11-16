"use client";
import { useEffect, useState } from "react";
import { Search, Plus, X, Check } from "lucide-react";
import { api } from "./ui";
import type { Skill } from "@/lib/types";
export function SkillsPicker({
  value,
  onChange,
  role = false,
}: {
  value: Skill[];
  onChange: (skills: Skill[]) => void;
  role?: boolean;
}) {
  const [q, setQ] = useState(""),
    [results, setResults] = useState<Skill[]>([]),
    [focused, setFocused] = useState(false);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      api<Skill[]>("/api/data/skills?q=" + encodeURIComponent(q))
        .then((d) => {
          if (live) setResults(d);
        })
        .catch(() => {});
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);
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
          {results
            .filter((r) => !value.some((s) => s.name === r.name))
            .slice(0, 8)
            .map((r) => (
              <button type="button" key={r.id} onClick={() => add(r)}>
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
