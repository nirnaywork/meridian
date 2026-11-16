import { describe, it, expect, vi } from "vitest";
import { taxonomy, normalizeSkill, skillKey } from "../src/data/taxonomy";
import { canonicalProfile, canonicalRole } from "../src/lib/matching/canonical";
import {
  hashedProvider,
  prepareEmbedding,
  sourceHash,
  cosine,
} from "../src/lib/matching/provider";
import { band, score } from "../src/lib/matching/config";
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
    const provider = { ...hashedProvider, embed: vi.fn(hashedProvider.embed) };
    const first = await prepareEmbedding("React", provider);
    expect(await prepareEmbedding("React", provider, first)).toBeNull();
    expect(provider.embed).toHaveBeenCalledTimes(1);
    await prepareEmbedding("React CSS", provider, first);
    expect(provider.embed).toHaveBeenCalledTimes(2);
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
      prepareEmbedding("x", { ...hashedProvider, embed: async () => [NaN] }),
    ).rejects.toThrow();
  });
});
describe("calibration and banding", () => {
  it("clamps mapping and weights coverage correctly", () => {
    expect(score(-1, 0, "minilm").final_score).toBe(0);
    expect(score(1, 1, "minilm").final_score).toBe(100);
    expect(score(0.75, 0, "minilm").final_score).toBe(75);
    expect(score(0.2, 1, "minilm").final_score).toBe(25);
    expect(score(0.75, 0, "minilm", "cosine_only").final_score).toBe(100);
  });
  it("uses exact thresholds, not rounded display percentages", () => {
    expect(band(39.999)).toBe("WEAK");
    expect(band(40)).toBe("MODERATE");
    expect(band(69.999)).toBe("MODERATE");
    expect(band(70)).toBe("STRONG");
  });
  it("rejects non-finite scores", () =>
    expect(() => score(NaN, 1, "hashed")).toThrow());
});
