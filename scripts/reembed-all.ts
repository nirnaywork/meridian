import { admin, must } from "./lib";
import { embeddingProvider } from "../src/lib/matching/select";
import { prepareEmbedding } from "../src/lib/matching/provider";
import {
  canonicalProfile,
  canonicalProject,
  canonicalRole,
} from "../src/lib/matching/canonical";
import { matchConfig } from "../src/lib/matching/config";
async function main() {
  const provider = await embeddingProvider();
  let count = 0;
  for (let offset = 0; ; offset += 50) {
    const profiles = must(
      await admin.database
        .from("profiles")
        .select(
          "id,display_name,headline,bio,university,interests,avatar_url,avatar_key,is_member,is_team_lead,onboarding_complete,revision,profile_skills(proficiency,skills(id,name))",
        )
        .order("id")
        .range(offset, offset + 49),
    );
    for (const p of profiles) {
      const skills = p.profile_skills.map((s: any) => ({
        ...s.skills,
        proficiency: s.proficiency,
      }));
      const old = must(
        await admin.database
          .from("profile_embeddings")
          .select("source_hash,model,version")
          .eq("profile_id", p.id)
          .limit(1),
      )[0];
      const vec = await prepareEmbedding(
        canonicalProfile({ ...p, skills }),
        provider,
        old,
      );
      if (vec) {
        must(
          await admin.database.rpc("save_profile", {
            actor: p.id,
            body: { ...p, skills },
            vec,
            expected_revision: p.revision,
          }),
        );
        count++;
      }
    }
    if (profiles.length < 50) break;
  }
  for (let offset = 0; ; offset += 25) {
    const projects = must(
      await admin.database
        .from("projects")
        .select(
          "id,owner_id,title,description,category,tags,commitment,duration,team_size,status,auto_approve_strong_matches,revision,project_roles(id,title,description,slots,project_role_skills(importance,skills(id,name)))",
        )
        .order("id")
        .range(offset, offset + 24),
    );
    for (const p of projects) {
      const roles = [];
      for (const r of p.project_roles) {
        const skills = r.project_role_skills.map((s: any) => ({
          ...s.skills,
          importance: s.importance,
        }));
        const old = must(
          await admin.database
            .from("role_embeddings")
            .select("source_hash,model,version")
            .eq("role_id", r.id)
            .limit(1),
        )[0];
        roles.push({
          ...r,
          skills,
          vector: await prepareEmbedding(
            canonicalRole({ ...r, skills }, p.title),
            provider,
            old,
          ),
        });
      }
      const old = must(
        await admin.database
          .from("project_embeddings")
          .select("source_hash,model,version")
          .eq("project_id", p.id)
          .limit(1),
      )[0];
      const vec = await prepareEmbedding(
        canonicalProject({ ...p, roles }),
        provider,
        old,
      );
      if (vec || roles.some((r) => r.vector)) {
        must(
          await admin.database.rpc("save_project", {
            actor: p.owner_id,
            body: { ...p, roles },
            vec,
            expected_revision: p.revision,
          }),
        );
        count++;
      }
    }
    if (projects.length < 25) break;
  }
  must(
    await admin.database
      .from("match_settings")
      .upsert([
        {
          id: true,
          settings: {
            ...matchConfig,
            mode: process.env.MATCH_MODE ?? "composite",
          },
        },
      ]),
  );
  console.log(
    `Updated ${count} records using ${provider.name}/${provider.version}. Identical hashes skipped.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
