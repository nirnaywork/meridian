import { normalizeSkill } from "../../data/taxonomy";
export type SkillInput = {
  name: string;
  proficiency?: string;
  importance?: string;
};
const clean = (s: string | undefined, n = 600) =>
  (s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, n);
const names = (s: SkillInput[]) =>
  [...new Set(s.map((x) => normalizeSkill(x.name)))]
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .join(", ");
export function canonicalProfile(p: {
  headline?: string;
  bio?: string;
  interests?: string;
  skills: SkillInput[];
}) {
  return (
    ["advanced", "intermediate", "beginner"]
      .map(
        (level) =>
          `Skills (${level}): ${names(p.skills.filter((s) => s.proficiency === level))}.`,
      )
      .join(" ") +
    ` ${clean(p.headline, 140)}. Interests: ${clean(p.interests, 200)}.` +
    (p.bio ? ` Bio: ${clean(p.bio, 240)}` : "")
  );
}
export function canonicalRole(
  r: { title: string; description: string; skills: SkillInput[] },
  projectTitle: string,
) {
  return `${clean(r.title, 100)}. Required skills: ${names(r.skills.filter((s) => s.importance === "required"))}. Preferred skills: ${names(r.skills.filter((s) => s.importance === "preferred"))}. ${clean(r.description)}. Project: ${clean(projectTitle, 120)}`;
}
export function canonicalProject(p: {
  title: string;
  category: string;
  description: string;
  roles: { title: string; description: string; skills: SkillInput[] }[];
}) {
  return `${clean(p.title, 120)}. ${clean(p.category, 80)}. Required skills: ${names(p.roles.flatMap((r) => r.skills.filter((s) => s.importance === "required")))}. Summary: ${clean(p.description)}. Roles: ${p.roles
    .map((r) => canonicalRole(r, p.title))
    .sort()
    .join(" | ")}`;
}
