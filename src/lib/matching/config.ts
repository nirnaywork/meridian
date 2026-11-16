export const matchConfig = {
  dims: 384,
  strong: 70,
  moderate: 40,
  cosineWeight: 0.75,
  coverageWeight: 0.25,
  calibration: {
    hashed: { low: 0.08, high: 0.65 },
    minilm: { low: 0.2, high: 0.75 },
  },
} as const;
export type Band = "STRONG" | "MODERATE" | "WEAK";
export function band(score: number): Band {
  return score >= matchConfig.strong
    ? "STRONG"
    : score >= matchConfig.moderate
      ? "MODERATE"
      : "WEAK";
}
export function score(
  cosine: number,
  coverage: number,
  provider: "hashed" | "minilm",
  mode = "composite",
) {
  if (!Number.isFinite(cosine) || !Number.isFinite(coverage))
    throw new Error("Non-finite match input");
  const { low, high } = matchConfig.calibration[provider];
  const cosineScore =
    Math.max(0, Math.min(1, (cosine - low) / (high - low))) * 100;
  const finalScore =
    mode === "cosine_only"
      ? cosineScore
      : matchConfig.cosineWeight * cosineScore +
        matchConfig.coverageWeight * Math.max(0, Math.min(1, coverage)) * 100;
  return {
    cosine,
    coverage,
    cosine_score: cosineScore,
    final_score: finalScore,
    band: band(finalScore),
  };
}
