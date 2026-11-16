import { admin, must } from "./lib";
import { prepareEmbedding, hashedProvider } from "../src/lib/matching/provider";
import {
  canonicalProfile,
  canonicalProject,
  canonicalRole,
} from "../src/lib/matching/canonical";
import { miniLMProvider } from "../src/lib/matching/minilm";
// Run reembed-all first for legacy versions. Never replace a vector in a trace backfill.
for (const [table, key] of [
  ["profile_embeddings", "profile_id"],
  ["project_embeddings", "project_id"],
  ["role_embeddings", "role_id"],
]) {
  let count = 0;
  for (let offset = 0; ; offset += 100) {
    const rows = must(
      await admin.database
        .from(table)
        .select("*")
        .order(key)
        .range(offset, offset + 99),
    );
    for (const row of rows) {
      if (row.trace) continue;
      const provider = row.model === "hashed" ? hashedProvider : miniLMProvider;
      if (row.version !== provider.version)
        throw new Error(
          `Run reembed-all for legacy ${table}/${row[key]} before backfilling`,
        );
      // A canonical text must be supplied by the version-migration save. Missing legacy traces cannot be guessed safely.
      let text: string;
      if (table === "profile_embeddings") {
        const p = must(
          await admin.database
            .from("profiles")
            .select("*,profile_skills(proficiency,skills(name))")
            .eq("id", row[key])
            .single(),
        );
        text = canonicalProfile({
          ...p,
          skills: p.profile_skills.map((s: any) => ({
            ...s.skills,
            proficiency: s.proficiency,
          })),
        });
      } else {
        const rid =
          table === "role_embeddings"
            ? must(
                await admin.database
                  .from("project_roles")
                  .select("project_id")
                  .eq("id", row[key])
                  .single(),
              ).project_id
            : row[key];
        const p = must(
          await admin.database
            .from("projects")
            .select(
              "*,project_roles(*,project_role_skills(importance,skills(name)))",
            )
            .eq("id", rid)
            .single(),
        );
        const roles = p.project_roles.map((r: any) => ({
          ...r,
          skills: r.project_role_skills.map((s: any) => ({
            ...s.skills,
            importance: s.importance,
          })),
        }));
        text =
          table === "role_embeddings"
            ? canonicalRole(
                roles.find((r: any) => r.id === row[key]),
                p.title,
              )
            : canonicalProject({ ...p, roles });
      }
      const generated = await prepareEmbedding(text, provider);
      const stored =
        typeof row.embedding === "string"
          ? JSON.parse(row.embedding)
          : row.embedding;
      const delta = Math.max(
        ...stored.map((x: number, i: number) =>
          Math.abs(x - generated!.embedding[i]),
        ),
      );
      if (delta > 1e-6 || row.source_hash !== generated!.source_hash)
        throw new Error("Trace backfill reproducibility mismatch");
      must(
        await admin.database
          .from(table)
          .update({ trace: generated!.trace })
          .eq(key, row[key])
          .is("trace", null),
      );
      count++;
    }
    if (rows.length < 100) break;
  }
  console.log(table, count, "traces verified and backfilled");
}
