"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { api, ErrorState, SkillChips } from "./ui";
import {RoleMatchBadge} from './role-match';
import type { HoodProps } from "./under-the-hood";
import type {
  StoredEmbedding,
  SimilarityData,
  ApplicantSummary,
} from "@/lib/embedding-types";
import type { HoodTab } from "@/lib/under-the-hood";
const EmbeddingExplainer = dynamic(() =>
  import("./embedding-explainer").then((m) => m.EmbeddingExplainer),
);
const SimilarityExplainer = dynamic(() =>
  import("./embedding-explainer").then((m) => m.SimilarityExplainer),
);
const PercentageExplainer=dynamic(()=>import('./percentage-explainer'));
type Props = HoodProps & {
  present: boolean;
  tab: HoodTab;
  role: string;
  select: (tab: HoodTab, role?: string) => void;
  navigate:(href:string)=>void;
};
export default function UnderTheHoodContent({
  kind,
  projectId,
  roles = [],
  tab,
  role,
  select,
  present,
  navigate,
  owner,
}: Props) {
  const cache = useRef(new Map<string, unknown>()),
    pending = useRef(new Map<string, Promise<unknown>>());
  const selected =
    tab === "roles"
      ? roles.some((r) => r.id === role)
        ? role
        : (roles[0]?.id ?? "")
      : roles.some((r) => r.id === role)
        ? role
        : "";
  const suffix = selected ? `?role=${encodeURIComponent(selected)}` : "";
  const path =
    kind === "profile"
      ? "/api/embeddings/me"
      : tab === "similarity"
        ? `/api/projects/${projectId}/similarity${suffix}`
        : `/api/projects/${projectId}/embedding${tab === "roles" ? suffix : ""}`;
  const [loaded, setLoaded] = useState<{ path: string; data: any } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!present) return;
    let live = true;
    setError("");
    if (cache.current.has(path)) {
      setLoaded({ path, data: cache.current.get(path) });
      return;
    }
    let request = pending.current.get(path);
    if (!request) {
      request = api(path)
        .then((data) => {
          cache.current.set(path, data);
          return data;
        })
        .finally(() => pending.current.delete(path));
      pending.current.set(path, request);
    }
    request
      .then((data) => {
        if (live) setLoaded({ path, data });
      })
      .catch((e) => {
        if (live) setError((e as Error).message);
      });
    return () => {
      live = false;
    };
  }, [path, retry, present]);
  if (error)
    return <ErrorState message={error} retry={() => setRetry((n) => n + 1)} />;
  const data =
    loaded?.path === path ? loaded.data : (cache.current.get(path) as any);
  const selector =
    kind === "project" && tab !== "embedding" ? (
      <label className="hood-selector">
        {tab === "roles" ? "Role embedding" : "Compare against"}
        <select
          aria-label={tab === "roles" ? "Role embedding" : "Compare against"}
          value={selected}
          onChange={(e) => select(tab, e.target.value)}
        >
          {tab === "similarity" && <option value="">Project overall</option>}
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title}
            </option>
          ))}
        </select>
      </label>
    ) : null;
  return (
    <>
      {selector}
      {!data ? (
        <div className="hood-skeleton" role="status" aria-busy="true">
          Loading stored {tab === "similarity" ? "similarity" : "embedding"}…
        </div>
      ) : tab !== "similarity" ? (
        <>
          {kind === "project" && tab === "roles" && !roles.length ? (
            <p>No roles have been added to this project.</p>
          ) : data.embedding ? (
            <EmbeddingExplainer
              record={data.embedding}
              regenerate={kind==='profile'?{kind:'profile'}:owner?{kind:'project',id:projectId}:undefined}
              title={
                kind === "profile"
                  ? "Working of the embeddings"
                  : tab === "roles"
                    ? "Working of this role’s embedding"
                    : "Working of this project's embedding"
              }
            />
          ) : (
            <div className="content-panel">
              <h2>No stored embedding yet</h2>
              <p>
                {kind === "profile"
                  ? "Add your skills to create your embedding."
                  : "This project or role has no saved embedding yet."}
              </p>
              <Link
                onClick={e=>{e.preventDefault();navigate(kind==="profile"?"/profile#skills-editor":`/projects/${projectId}`)}}
                href={
                  kind === "profile"
                    ? "/profile#skills-editor"
                    : `/projects/${projectId}`
                }
              >
                {kind === "profile"
                  ? "Edit your skills"
                  : "Ask the lead to save the requirements"}
              </Link>
            </div>
          )}
        </>
      ) : (
        <Similarity data={data} navigate={navigate}/>
      )}
    </>
  );
}
function Similarity({ data,navigate }: { data: SimilarityData;navigate:(href:string)=>void }) {
  if (data.mode === "owner")
    return <OwnerSimilarity applicants={data.applicants} />;
  if (!data.profile)
    return (
      <div className="content-panel">
        <h2>Add skills to explore similarity</h2>
        <p>
          Your own stored embedding is needed for a dimension-by-dimension
          comparison.
        </p>
        <Link onClick={e=>{e.preventDefault();navigate("/profile#skills-editor")}} href="/profile#skills-editor">Edit your skills</Link>
      </div>
    );
  return (
    <>
      {data.snapshot && (
        <div className="info-note" data-testid="cosine-snapshot">
          <p>
            Application snapshot cosine:{" "}
            <b>{data.snapshot.cosine?.toFixed(9) ?? "unavailable"}</b>
          </p>
          <p>
            Current cosine: <b>{data.cosine?.toFixed(9) ?? "unavailable"}</b>
          </p>
          {data.snapshot.cosine != null &&
            data.cosine != null &&
            Math.abs(data.snapshot.cosine - data.cosine) > 1e-6 && (
              <p>
                You updated your skills after applying, or the project
                requirements changed. The original snapshot is preserved.
              </p>
            )}
        </div>
      )}
      <SimilarityExplainer
        a={data.profile}
        b={data.target}
        pg={data.cosine}
        snapshot={data.snapshot?.cosine}
      />
      <PercentageExplainer roles={data.rolePercentages} selectedRoleId={data.selectedRoleId}/>
    </>
  );
}
function OwnerSimilarity({ applicants }: { applicants: ApplicantSummary[] }) {
  const [selected, setSelected] = useState("");
  const a = applicants.find((a) => a.id === selected) ?? applicants[0];
  return (
    <section className="content-panel">
      <h2>Working of the similarity</h2>
      <h3>The formula</h3>
      <code>cos(A, B) = (A · B) / (‖A‖ ‖B‖)</code>
      <p>
        Multiply corresponding coordinates, add them, and divide by both vector
        lengths. Unit-length vectors have cosine equal to their dot product.
      </p>
      <h3>Reading a cosine value</h3>
      <p>
        Cosine ranges from −1 to 1. A smaller angle means more similar
        directions; the value is not a probability or a percentage of
        capability. Providers have different typical ranges. Similarity never
        controls eligibility.
      </p>
      <p>
        Applicant vectors, token traces and per-dimension calculations remain
        private to each applicant. This view uses their stored application
        snapshots.
      </p>
      <h3>Applicant snapshots</h3>
      {a ? (
        <>
          <label>
            Applicant
            <select
              aria-label="Applicant"
              value={a.id}
              onChange={(e) => setSelected(e.target.value)}
            >
              {applicants.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.name} · {a.role} · cosine{" "}
                  {a.cosine?.toFixed(4) ?? "unavailable"}
                </option>
              ))}
            </select>
          </label>
          <p>
            Snapshot cosine: <b>{a.cosine?.toFixed(9) ?? "unavailable"}</b> ·
            Angle: {a.angle?.toFixed(2) ?? "unavailable"}°
          </p>
          <RoleMatchBadge snapshot={a.matchPercent}/>
          <p>This applicant explanation uses only their stored application snapshot.</p>
          <PercentageExplainer roles={[{roleId:a.id,title:a.role,cosine:a.cosine,matchPercent:a.matchPercent,provider:a.provider,state:'snapshot'}]} selectedRoleId={a.id}/>
          <SkillChips
            match={{
              matched_skills: a.matched_skills,
              missing_skills: a.missing_skills,
            }}
          />
        </>
      ) : (
        <p>No applications for this selection yet.</p>
      )}
    </section>
  );
}
