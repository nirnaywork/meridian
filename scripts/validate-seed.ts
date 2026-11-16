import { taxonomyFiles, skillKey } from "../src/data/taxonomy";
export function validateSeed(files = taxonomyFiles) {
  const minimums = [500, 250, 120, 120, 80, 80, 100, 100, 80, 50];
  const slugs = new Set<string>(),
    aliases = new Map<string, string>();
  for (const [i, f] of files.entries()) {
    if (f.skills.length < minimums[i])
      throw new Error(`Too few skills: ${f.field.name}`);
    for (const s of f.skills) {
      if (slugs.has(s.slug)) throw new Error(`Duplicate slug ${s.slug}`);
      slugs.add(s.slug);
      if (
        !s.domains.length ||
        s.domains.some((d) => !f.domains.some((x) => x.name === d))
      )
        throw new Error(`Missing domain: ${s.name}`);
      for (const a of [s.name, ...s.aliases]) {
        const key = skillKey(a),
          existing = aliases.get(key);
        if (existing && existing !== s.slug)
          throw new Error(`Alias collision: ${a}`);
        aliases.set(key, s.slug);
      }
    }
  }
  if (slugs.size < 1500 || files.reduce((n, f) => n + f.domains.length, 0) < 60)
    throw new Error("Taxonomy too small");
  return files.map((f) => ({
    field: f.field.name,
    skills: f.skills.length,
    domains: f.domains.map((d) => ({
      name: d.name,
      count: f.skills.filter((s) => s.domains.includes(d.name)).length,
    })),
  }));
}
if (process.argv[1]?.includes("validate-seed"))
  console.log(JSON.stringify(validateSeed(), null, 2));
