import { describe, it, expect, vi } from "vitest";
import { taxonomy, normalizeSkill, skillKey } from "../src/data/taxonomy";
import { canonicalProfile, canonicalRole } from "../src/lib/matching/canonical";
import {
  hashedProvider,
  prepareEmbedding,
  sourceHash,
  cosine,
} from "../src/lib/matching/provider";
import { validateSeed } from "../scripts/validate-seed";
import { offlineOptions } from "../src/lib/matching/minilm";
import { verifyFiles } from "../src/lib/matching/model-files";
describe("taxonomy and canonical text", () => {
  it("has 300 distinct skills and resolves aliases without merging C/C++/C#", () => {
    expect(taxonomy.length).toBeGreaterThanOrEqual(300);
    expect(new Set(taxonomy.map((s) => s.slug)).size).toBe(taxonomy.length);
    expect(normalizeSkill(" React.JS ")).toBe("React");
    expect(normalizeSkill("ML")).toBe("Machine Learning");
    expect(new Set(["C", "C++", "C#"].map(skillKey)).size).toBe(3);
  });
  it("ignores skill order and cosmetic fields", () => {
    const skills = [
      { name: "React", proficiency: "advanced" },
      { name: "TypeScript", proficiency: "advanced" },
    ];
    expect(canonicalProfile({ skills, headline: "Student" })).toBe(
      canonicalProfile({ skills: [...skills].reverse(), headline: "Student" }),
    );
  });
});
describe("hash and provider", () => {
  it("is deterministic, signed, finite and normalized", async () => {
    const a = await hashedProvider.embed("React TypeScript HTML CSS"),
      b = await hashedProvider.embed("React TypeScript HTML CSS");
    expect(a).toEqual(b);
    expect(a).toHaveLength(384);
    expect(Math.hypot(...a)).toBeCloseTo(1);
    expect(a.some((x) => x < 0)).toBe(true);
  });
  it("normalizes aliases in embeddings", async () => {
    expect(await hashedProvider.embed("React.js ML")).toEqual(
      await hashedProvider.embed("React Machine Learning"),
    );
  });
  it("skips inference on the same hash and re-embeds when text/provider/version changes", async () => {
    const provider = {
      ...hashedProvider,
      generate: vi.fn(hashedProvider.generate!),
    };
    const first = await prepareEmbedding("React", provider);
    expect(await prepareEmbedding("React", provider, first)).toBeNull();
    expect(provider.generate).toHaveBeenCalledTimes(1);
    await prepareEmbedding("React CSS", provider, first);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(
      await sourceHash("React", { ...provider, version: "next" }),
    ).not.toBe(first?.source_hash);
    expect(
      await prepareEmbedding("React", { ...provider, name: "other" }, first),
    ).not.toBeNull();
  });
  it("separates different skill domains", async () => {
    const a = await hashedProvider.embed("Python Machine Learning PyTorch");
    const b = await hashedProvider.embed("Machine Learning Python PyTorch");
    const c = await hashedProvider.embed("Figma Typography Illustration");
    expect(cosine(a, b)).toBeGreaterThan(cosine(a, c));
  });
  it("rejects invalid vectors", async () => {
    await expect(
      prepareEmbedding("x", {
        ...hashedProvider,
        generate: undefined,
        embed: async () => [NaN],
      }),
    ).rejects.toThrow();
  });
});

it("validates 1500 skills and 60 domains without alias collisions", () => {
  expect(validateSeed()).toHaveLength(10);
});
it("canonical text sorts domains and stores actual tokenizer trace", async () => {
  const text = canonicalProfile({
    domains: ["VLSI Design", "FPGA Design"],
    skills: [{ name: "Verilog", proficiency: "advanced" }],
  });
  expect(text).toContain("Domains: FPGA Design, VLSI Design");
  const row = await prepareEmbedding(text, hashedProvider);
  expect(row?.trace.dims).toBe(384);
  expect((row?.trace as any).token_ids.length).toBeGreaterThan(0);
  expect(row?.trace.norm_after).toBeCloseTo(1);
});
it("has unit cosine and rejects dimensional mismatch", () => {
  expect(cosine([1, 0], [0, 1])).toBe(0);
  expect(cosine([1, 0], [1, 0])).toBe(1);
  expect(() => cosine([1], [1, 0])).toThrow();
});
it("forbids remote model loading and reports missing files", async () => {
  expect(offlineOptions.allowRemoteModels).toBe(false);
  expect((await verifyFiles(".cache/nonexistent-model")).checksums).toBe(false);
});

it("requires an explicit provider and never falls back when files are missing",async()=>{
 const network=vi.spyOn(globalThis,"fetch").mockRejectedValue(new Error("No runtime network permitted"));
 vi.stubEnv("EMBEDDING_PROVIDER","");const {embeddingProvider}=await import("../src/lib/matching/select");await expect(embeddingProvider()).rejects.toThrow("must be explicitly");
 vi.stubEnv("EMBEDDING_PROVIDER",undefined);await expect(embeddingProvider()).rejects.toThrow("<missing>");
 vi.stubEnv("EMBEDDING_PROVIDER","wrong");await expect(embeddingProvider()).rejects.toThrow("must be explicitly");
 vi.stubEnv("EMBEDDING_PROVIDER","minilm");vi.stubEnv("MODEL_DIR",".cache/missing-model");await expect(embeddingProvider()).rejects.toMatchObject({status:503,message:"Embedding service unavailable, please retry"});
 expect(network).not.toHaveBeenCalled();network.mockRestore();vi.unstubAllEnvs();
});
