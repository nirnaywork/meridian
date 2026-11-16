"use client";
import { useState,useEffect } from "react";
import {api} from './ui';
import { cosine } from "@/lib/matching/provider";
import type { StoredEmbedding as Stored } from "@/lib/embedding-types";
const vector = (r: Stored) =>
  typeof r.embedding === "string"
    ? (JSON.parse(r.embedding) as number[])
    : r.embedding;
type LiveProvider={provider:string;version:string;selectionReason:string;lastLoadError?:string|null};
let healthRequest:{at:number;promise:Promise<LiveProvider>}|undefined;
export function ProviderNotice({record,regenerate}:{record:Stored;regenerate?:{kind:'profile'|'project';id?:string}}){
 const [health,setHealth]=useState<LiveProvider|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;if(!healthRequest||Date.now()-healthRequest.at>60000)healthRequest={at:Date.now(),promise:fetch('/api/health/embedding',{cache:'no-store'}).then(r=>r.json())};healthRequest.promise.then(h=>{if(live)setHealth(h)}).catch(()=>{if(live)setError('Live provider health is unavailable.')});return()=>{live=false}},[]);
 const mismatch=health&&(record.model!==health.provider||record.version!==health.version);
 return <aside className="info-note provider-notice"><strong className="chip matched">This vector: {record.model==='minilm'?'MiniLM (semantic)':'Hashed TF-IDF (keyword fallback)'}</strong><p>New embeddings are generated with: {health?`${health.provider} · ${health.version}`:'checking live health…'}</p>{health?.selectionReason==='error'&&<p role="alert">Embedding service unavailable, please retry. {health.lastLoadError}</p>}{mismatch&&<p role="alert">This vector was made with {record.model} / {record.version}; new saves use {health.provider} / {health.version}. Cosine comparisons are unavailable until it is regenerated.</p>}{mismatch&&(regenerate?<button className="btn secondary small" type="button" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await api('/api/embeddings/regenerate',regenerate);window.location.reload()}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{busy?'Regenerating…':'Regenerate embedding'}</button>:<p>Ask the project lead to regenerate this vector.</p>)}{error&&<p role="alert">{error}</p>}</aside>;
}
function copy(s: string) {
  navigator.clipboard.writeText(s);
}
function download(data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "meridian-embedding.json";
  a.click();
  URL.revokeObjectURL(url);
}
export function TokenChips({ trace }: { trace: Record<string, any> }) {
  return (
    <>
      <p>
        {trace.token_count} tokens. Special tokens:{" "}
        {trace.special_tokens?.join(", ") || "None (hashed fallback)"}. Maximum
        length: {trace.max_sequence_length ?? "unlimited"}.
      </p>
      {trace.truncated && (
        <p role="alert">
          The input was truncated to the model’s sequence limit.
        </p>
      )}
      <div className="token-chips">
        {trace.tokens?.map((t: string, i: number) => (
          <span className="chip" key={i}>
            {t} <small>#{trace.token_ids[i]}</small>
          </span>
        ))}
      </div>
    </>
  );
}
export function PipelineDiagram({ hashed }: { hashed: boolean }) {
  return (
    <ol className="pipeline">
      {(hashed
        ? [
            "Canonical text",
            "Alias-normalized tokens",
            "Unigrams and bigrams",
            "Signed hash buckets × sublinear TF × frozen IDF + exact skill boost",
            "L2 normalization",
            "384-number vector",
          ]
        : [
            "Word pieces + token IDs",
            "Six transformer layers",
            "384 values per token",
            "Mean pooling across tokens",
            "L2 normalization",
            "384-number vector",
          ]
      ).map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
  );
}
export function VectorViewer({ values }: { values: number[] }) {
  const [top, setTop] = useState(0);
  const row = 32,
    start = Math.max(0, Math.floor(top / row) - 2),
    end = Math.min(values.length, start + 14),min=Math.min(...values),max=Math.max(...values);
  return (
    <>
      <p>
        Each dimension is a learned or hashed coordinate, with no independent
        human-readable meaning.
      </p>
      <div className="vector-heatmap" aria-label="Embedding heatmap">
        {values.map((v, i) => (
          <span
            key={i}
            title={`${i}: ${v}`}
            style={{
              background:
                v >= 0
                  ? `rgba(35,115,85,${0.15+0.85*v/(max||1)})`
                  : `rgba(190,80,70,${0.15+0.85*v/(min||-1)})`,
            }}
          />
        ))}
      </div>
      <button
        type="button"
        className="btn secondary small"
        onClick={() => copy(JSON.stringify(values))}
      >
        Copy 384 numbers
      </button>{" "}
      <button
        type="button"
        className="btn secondary small"
        onClick={() => download(values)}
      >
        Download JSON
      </button>
      <div
        className="vector-scroll"
        onScroll={(e) => setTop(e.currentTarget.scrollTop)}
        role="region"
        aria-label="All 384 embedding dimensions"
        tabIndex={0}
      >
        <div style={{ height: values.length * row, position: "relative" }}>
          {values.slice(start, end).map((v, j) => (
            <div
              className="vector-row"
              style={{
                position: "absolute",
                top: (start + j) * row,
                height: row,
                width: "100%",
              }}
              key={start + j}
            >
              <span>Dimension {start + j}</span>
              <code>{v.toFixed(9)}</code>
            </div>
          ))}
        </div>
      </div>
      <p>384 dimensions available; rows are virtualized while scrolling.</p>
    </>
  );
}
export function EmbeddingExplainer({
  record,
  title,
  regenerate,
}: {
  record: Stored | null;
  title: string;
  regenerate?:{kind:'profile'|'project';id?:string};
}) {
  if (!record)
    return (
      <section className="content-panel">
        <h2>{title}</h2>
        <p>
          No stored embedding yet. Save skills or requirements to generate one.
        </p>
      </section>
    );
  const t = record.trace,
    v = vector(record),
    hashed = record.model === "hashed";
  return (
    <section className="content-panel embedding-explainer">
      <ProviderNotice record={record} regenerate={regenerate}/>
      <h2>{title}</h2>
      {!t ? (
        <p>
          Trace is awaiting a verified backfill. No model runs when viewing this
          page.
        </p>
      ) : (
        <>
          <h3>1. Your inputs</h3>
          <p>
            Skills with proficiency, domains, headline, interests and a short
            bio excerpt shape a profile. Titles, domains, requirements,
            descriptions and roles shape projects. Display name, university and
            avatar do not regenerate vectors.
          </p>
          <h3>2. The exact text that was embedded</h3>
          <p>
            A fixed format and sorted skills/domains keep identical inputs
            reproducible.
          </p>
          <pre>{t.canonical_text}</pre>
          <button
            type="button"
            className="text-btn"
            onClick={() => copy(t.canonical_text)}
          >
            Copy canonical text
          </button>
          <h3>3. The hash</h3>
          <code className="break-word">{record.source_hash}</code>
          <p>
            SHA-256 fingerprints the canonical text, provider and version. A
            save regenerates only when this hash changes.
          </p>
          <p>
            Last generated at: {t.generated_at}. Unchanged since:{" "}
            {record.updated_at}.
          </p>
          <h3>4. Tokenization</h3>
          <p>
            {hashed
              ? "The fallback normalizes aliases, removes stop words, and creates word and adjacent-word features. IDs below are deterministic hash IDs, not transformer vocabulary IDs."
              : "Word pieces map text to a fixed vocabulary. CLS marks the start and SEP marks the end."}
          </p>
          <TokenChips trace={t} />
          <h3>5. The model and pipeline</h3>
          <p>
            Model that produced this vector: <b>{record.model}</b> · {record.version}.{" "}
            {hashed
              ? "This is the deterministic TF-IDF fallback. Words and adjacent pairs accumulate signed weights in 384 buckets. Exact skill hits receive a small boost."
              : "MiniLM uses attention across six transformer layers to give each token a contextual vector. Mean pooling averages token vectors. L2 normalization divides by vector length so the final length is one."}
          </p>
          <PipelineDiagram hashed={hashed} />
          {!hashed && (
            <p>
              <a href="https://huggingface.co/Xenova/all-MiniLM-L6-v2">
                Xenova/all-MiniLM-L6-v2
              </a>{" "}
              · Apache 2.0. All inference uses verified local files.
            </p>
          )}
          <details>
            <summary>Technical details: generation trace</summary>
            <pre>{JSON.stringify(t, null, 2)}</pre>
          </details>
          <h3>6. The actual embedding</h3>
          {!hashed&&<p>MiniLM produces a dense vector: every dimension carries a small value, and zeros are not expected.</p>}
          <p>
            Norm before: {t.norm_before?.toFixed(6)}; after:{" "}
            {t.norm_after?.toFixed(6)}. Min: {t.min?.toFixed(6)}; max:{" "}
            {t.max?.toFixed(6)}; mean: {t.mean?.toFixed(6)}; standard deviation:{" "}
            {t.std?.toFixed(6)}. Generation took {t.timing_ms?.toFixed(2)} ms.
          </p>
          <VectorViewer values={v} />
          <h3>7. Storage and use</h3>
          <p>
            Stored in{" "}
            {record.model && title.includes("role")
              ? "role_embeddings"
              : title.includes("project")
                ? "project_embeddings"
                : "profile_embeddings"}
            .embedding, a pgvector vector(384) column with an HNSW
            vector_cosine_ops index. Viewing and matching read stored vectors.
            Your profile vector and trace are private to you.
          </p>
        </>
      )}
    </section>
  );
}
export function SimilarityExplainer({
  a,
  b,
  pg,
  snapshot,
}: {
  a: Stored | null;
  b: Stored | null;
  pg: number | null;
  snapshot?: number | null;
}) {
  if (!a || !b || a.model !== b.model || a.version !== b.version)
    return (
      <p className="info-note">
        Embedding is being updated. Similarity details need two stored vectors
        from the same provider and version. Save your profile to retry.
      </p>
    );
  const A = vector(a),
    B = vector(b),
    na = Math.hypot(...A),
    nb = Math.hypot(...B),
    app = cosine(A, B);
  let sum = 0;
  const rows = A.map((x, i) => ({
    i,
    a: x,
    b: B[i],
    product: x * B[i],
    sum: (sum += x * B[i]),
  }));
  const ranked = [...rows].sort((x, y) => y.product - x.product),
    angle = (Math.acos(Math.max(-1, Math.min(1, app))) * 180) / Math.PI,
    rad = (angle * Math.PI) / 180;
  return (
    <section className="content-panel">
      <h2>Working of the similarity</h2>
      <h3>1. Comparing directions</h3>
      <code>cos(A, B) = (A · B) / (‖A‖ ‖B‖)</code>
      <p>
        Multiply corresponding coordinates, add them, then divide by both
        lengths. A length: {na.toFixed(8)}. B length: {nb.toFixed(8)}.
        Unit-length vectors have cosine equal to their dot product.
      </p>
      <h3>2. The calculation, step by step</h3>
      <div className="calculation-scroll dimension-calculation" tabIndex={0}>
        <table>
          <thead>
            <tr>
              {["i", "a_i", "b_i", "a_i × b_i", "Running sum"].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.i}>
                <td>{r.i}</td>
                <td>{r.a.toFixed(7)}</td>
                <td>{r.b.toFixed(7)}</td>
                <td>{r.product.toFixed(9)}</td>
                <td>{r.sum.toFixed(9)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        Final dot product: {sum.toFixed(9)}. Cosine after dividing by norms:{" "}
        <b>{app.toFixed(9)}</b>.
      </p>
      <h3>3. App and database verification</h3>
      <p>
        App: {app.toFixed(9)} · pgvector: {pg?.toFixed(9) ?? "unavailable"} ·
        absolute difference:{" "}
        {pg == null ? "unavailable" : Math.abs(app - pg).toExponential(3)}.
        {snapshot != null &&
          ` Application snapshot: ${snapshot.toFixed(9)} (may differ from current vectors).`}
      </p>
      <h3>4. Which coordinates contributed most?</h3>
      <p>
        Positive:{" "}
        {ranked
          .filter((r) => r.product > 0)
          .slice(0, 5)
          .map((r) => `${r.i}: ${r.product.toFixed(5)}`)
          .join("; ")}
        . Negative:{" "}
        {ranked
          .filter((r) => r.product < 0)
          .slice(-5)
          .reverse()
          .map((r) => `${r.i}: ${r.product.toFixed(5)}`)
          .join("; ")}
        .
      </p>
      <div
        className="contribution-chart"
        aria-label="Contributions by dimension"
      >
        {rows.map((r) => (
          <span
            title={`Dimension ${r.i}: ${r.product}`}
            key={r.i}
            style={{
              height: Math.max(1, Math.abs(r.product) * 1200),
              background: r.product >= 0 ? "#27765c" : "#ba6157",
              alignSelf: r.product >= 0 ? "end" : "start",
            }}
          />
        ))}
      </div>
      <h3>5. The angle</h3>
      <svg
        viewBox="0 0 240 140"
        width="240"
        role="img"
        aria-label={`Two vectors at ${angle.toFixed(2)} degrees`}
      >
        <line
          x1="120"
          y1="110"
          x2="220"
          y2="110"
          stroke="currentColor"
          strokeWidth="3"
        />
        <line
          x1="120"
          y1="110"
          x2={120 + 100 * Math.cos(rad)}
          y2={110 - 100 * Math.sin(rad)}
          stroke="#4e9874"
          strokeWidth="3"
        />
      </svg>
      <p>
        {angle.toFixed(2)}° apart. A smaller angle means the embeddings point in
        more similar directions.
      </p>
      <h3>6. Reading the number</h3>
      <p>
        Cosine ranges from −1 to 1. It is a similarity measure, not a
        probability or percentage of capability. Hashed vectors often sit near
        zero for unrelated text; MiniLM can give unrelated student descriptions
        positive similarity. Exact wording, context and provider affect the
        value. It cannot establish expertise, reliability, or eligibility. All
        applications are reviewed manually.
      </p>
      <h3>7. The human-readable side</h3>
      <p>
        Skill chips describe exact overlap separately. They do not produce the
        embedding cosine.
      </p>
      <div className="canonical-pair">
        <pre>{a.trace?.canonical_text}</pre>
        <pre>{b.trace?.canonical_text}</pre>
      </div>
    </section>
  );
}
