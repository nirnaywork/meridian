import { taxonomy, normalizeSkill } from "../../data/taxonomy";
export interface EmbeddingProvider {
  name: string;
  version: string;
  dims: number;
  embed(text: string): Promise<number[]>;
}
const stop = new Set(
  "a an the and or of to for with in on is are as by skills advanced intermediate beginner required preferred summary roles project bio interests".split(
    " ",
  ),
);
const aliasEntries = taxonomy
  .flatMap((s) =>
    [s.name, ...s.aliases].map(
      (a) =>
        [
          a.toLowerCase(),
          s.name.toLowerCase().replace(/\+/g, "plus").replace(/#/g, "sharp"),
        ] as const,
    ),
  )
  .sort((a, b) => b[0].length - a[0].length);
const aliasLookup = new Map(aliasEntries);
const aliasPattern = new RegExp(
  `(?<![a-z0-9])(?:${aliasEntries.map(([a]) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![a-z0-9])`,
  "g",
);
function tokens(text: string) {
  const t = text
    .normalize("NFKC")
    .toLowerCase()
    .replace(aliasPattern, (match) => aliasLookup.get(match)!);
  return (t.match(/[\p{L}\p{N}]+/gu) ?? []).filter((x) => !stop.has(x));
}
function features(words: string[]) {
  return [...words, ...words.slice(1).map((w, i) => words[i] + "_" + w)];
}
function hash(s: string, seed = 2166136261) {
  let h = seed;
  for (let i = 0; i < s.length; i++)
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
let corpus: Map<string, number> | undefined;
function idfMap() {
  if (!corpus) {
    corpus = new Map();
    for (const s of taxonomy) {
      for (const t of new Set(features(tokens(`${s.name} ${s.category}`))))
        corpus.set(t, (corpus.get(t) ?? 0) + 1);
    }
  }
  return corpus;
}
export const hashedProvider: EmbeddingProvider = {
  name: "hashed",
  version: "taxonomy-tfidf-v2",
  dims: 384,
  async embed(text) {
    const counts = new Map<string, number>();
    for (const t of features(tokens(text)))
      counts.set(t, (counts.get(t) ?? 0) + 1);
    const idf = idfMap(),
      v = Array<number>(384).fill(0);
    for (const [t, n] of counts) {
      const weight =
        (1 + Math.log(n)) *
        (Math.log((1 + taxonomy.length) / (1 + (idf.get(t) ?? 0))) + 1);
      v[hash(t) % 384] += (hash(t, 374761393) >>> 31 ? 1 : -1) * weight;
    }
    const normalizedText = ` ${tokens(text).join(" ")} `;
    for (const s of taxonomy) {
      const phrase = tokens(s.name).join(" ");
      if (phrase && normalizedText.includes(` ${phrase} `)) {
        const key = `skill:${s.slug}`;
        v[hash(key) % 384] += (hash(key, 374761393) >>> 31 ? 1 : -1) * 5;
      }
    }
    const norm = Math.hypot(...v);
    return norm ? v.map((x) => x / norm) : v;
  },
};
export async function sourceHash(text: string, p: EmbeddingProvider) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text + p.name + p.version),
  );
  return Array.from(new Uint8Array(bytes), (x) =>
    x.toString(16).padStart(2, "0"),
  ).join("");
}
export async function prepareEmbedding(
  text: string,
  p: EmbeddingProvider,
  old?: { source_hash: string; model: string; version: string } | null,
) {
  const source_hash = await sourceHash(text, p);
  if (
    old?.source_hash === source_hash &&
    old.model === p.name &&
    old.version === p.version
  )
    return null;
  const embedding = await p.embed(text);
  if (
    embedding.length !== p.dims ||
    embedding.some((x) => !Number.isFinite(x)) ||
    Math.hypot(...embedding) < 0.99
  )
    throw new Error("Embedding failed validation. Add skills and retry.");
  return { embedding, source_hash, model: p.name, version: p.version };
}
export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length) throw new Error("Dimension mismatch");
  const n = Math.hypot(...a) * Math.hypot(...b);
  return n ? a.reduce((s, x, i) => s + x * b[i], 0) / n : 0;
}
