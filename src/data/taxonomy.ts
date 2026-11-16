import f0 from "../../seed/cs-related.json";
import f1 from "../../seed/ece-related.json";
import f2 from "../../seed/eee-related.json";
import f3 from "../../seed/mechanical-related.json";
import f4 from "../../seed/civil-related.json";
import f5 from "../../seed/chemical-and-biotech.json";
import f6 from "../../seed/design-and-creative.json";
import f7 from "../../seed/business-management-and-marketing.json";
import f8 from "../../seed/math-science-and-research.json";
import f9 from "../../seed/communication-and-soft-skills.json";
export const taxonomyFiles = [f0, f1, f2, f3, f4, f5, f6, f7, f8, f9];
export const taxonomy = taxonomyFiles.flatMap((f) => f.skills);
export function skillKey(s: string) {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/\+/g, " plus ")
    .replace(/#/g, " sharp ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, "-");
}
const lookup = new Map(
  taxonomy.flatMap((s) =>
    [s.name, ...s.aliases].map((a) => [skillKey(a), s.name] as const),
  ),
);
export function normalizeSkill(s: string) {
  return (
    lookup.get(skillKey(s)) ?? s.normalize("NFKC").trim().replace(/\s+/g, " ")
  );
}
