"use client";
import { useState } from "react";
import { taxonomyFiles } from "@/data/taxonomy";
export function DomainPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [field, setField] = useState(""),
    [q, setQ] = useState("");
  const domains = taxonomyFiles
    .filter((f) => !field || f.field.name === field)
    .flatMap((f) => f.domains)
    .filter((d) => d.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="domain-picker">
      <h3>Choose your domains first</h3>
      <label>
        Browse by field
        <select value={field} onChange={(e) => setField(e.target.value)}>
          <option value="">All fields</option>
          {taxonomyFiles.map((f) => (
            <option key={f.field.slug}>{f.field.name}</option>
          ))}
        </select>
      </label>
      <label>
        Search domains
        <input value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      <div className="domain-options">
        {domains.map((d) => (
          <label key={d.slug}>
            <input
              type="checkbox"
              checked={value.includes(d.name)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...value, d.name]
                    : value.filter((v) => v !== d.name),
                )
              }
            />
            {d.name}
          </label>
        ))}
      </div>
      <p>
        {value.join(" · ") || "Choose the focus areas you want to explore."}
      </p>
    </div>
  );
}
