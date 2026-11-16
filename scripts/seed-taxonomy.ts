import { taxonomyFiles } from "../src/data/taxonomy";
import { validateSeed } from "./validate-seed";
import { admin, must } from "./lib";
validateSeed();
for (const f of taxonomyFiles) {
  const field = must(
    await admin.database
      .from("fields")
      .upsert([f.field], { onConflict: "slug" })
      .select("id"),
  )[0];
  const domains = must(
    await admin.database
      .from("domains")
      .upsert(
        f.domains.map((d) => ({ ...d, field_id: field.id })),
        { onConflict: "slug" },
      )
      .select("id,name"),
  );
  for (let i = 0; i < f.skills.length; i += 100) {
    const batch = f.skills.slice(i, i + 100);
    const skills = must(
      await admin.database
        .from("skills")
        .upsert(
          batch.map(({ field: _, domains: __, ...s }) => ({
            ...s,
            field_id: field.id,
          })),
          { onConflict: "slug" },
        )
        .select("id,slug"),
    );
    must(
      await admin.database.from("skill_domains").upsert(
        skills.flatMap((s) =>
          batch
            .find((x) => x.slug === s.slug)!
            .domains.map((d) => ({
              skill_id: s.id,
              domain_id: domains.find((x) => x.name === d)!.id,
            })),
        ),
        { onConflict: "skill_id,domain_id" },
      ),
    );
  }
  must(
    await admin.database.from("role_templates").upsert(
      f.role_templates.map(({ domain, ...t }) => ({
        ...t,
        domain_id: domains.find((d) => d.name === domain)!.id,
      })),
      { onConflict: "slug" },
    ),
  );
  console.log(f.field.name, f.skills.length);
}
