export type StoredEmbedding = {
  embedding: number[] | string;
  source_hash: string;
  model: string;
  version: string;
  updated_at: string;
  trace: Record<string, any> | null;
};
export type HoodRole = { id: string; title: string };
export type ApplicantSummary = {
  id: string;
  name: string;
  role: string;
  cosine: number | null;
  angle: number | null;
  matched_skills: string[];
  missing_skills: string[];
  matchPercent:number|null;
  calibrationVersion:string|null;
  provider:string|null;
};
export type RolePercentageDetail={roleId:string;title:string;cosine:number|null;matchPercent:number|null;provider:string|null;state:string};
export type SimilarityData =
  | { mode: "owner"; applicants: ApplicantSummary[] }
  | {
      mode: "member";
      profile: StoredEmbedding | null;
      target: StoredEmbedding | null;
      cosine: number | null;
      snapshot: { cosine: number | null; created_at: string } | null;
      selectedRoleId:string|null;
      rolePercentages:RolePercentageDetail[];
    };
