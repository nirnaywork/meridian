import "server-only";
import { adminClient, checked, HttpError } from "./db";
import { profileSchema, projectSchema,requiredDomains } from "../validation";
import { normalizeSkill, skillKey } from "../../data/taxonomy";
import {
  canonicalProfile,
  canonicalProject,
  canonicalRole,
} from "../matching/canonical";
import { prepareEmbedding } from "../matching/provider";
import { embeddingProvider } from "../matching/select";
import type { Skill } from "../types";
async function resolveSkills(input: Skill[]) {
  const db = adminClient();
  const out = [];
  const seen = new Set<string>();
  for (const s of input) {
    const name = normalizeSkill(s.name),
      slug = skillKey(name);
    if (!slug) throw new HttpError("Skill needs letters or numbers");
    if (seen.has(slug)) continue;
    seen.add(slug);
    let rows = checked(
      await db.database
        .from("skills")
        .select("id,name")
        .eq("slug", slug)
        .limit(1),
    );
    if (!rows.length) {
      const inserted = await db.database
        .from("skills")
        .upsert(
          [
            {
              name,
              slug,
              category: "Community",
              aliases: [],
              is_verified: false,
            },
          ],
          { onConflict: "slug", ignoreDuplicates: true },
        )
        .select("id,name");
      if (inserted.error) throw inserted.error;
      rows = checked(
        await db.database
          .from("skills")
          .select("id,name")
          .eq("slug", slug)
          .limit(1),
      );
    }
    out.push({ ...s, id: rows[0].id as string, name: rows[0].name as string });
  }
  return out;
}
export async function saveProfile(actor: string, input: unknown) {
  if(process.env.EMBEDDING_WRITES_PAUSED === "true")throw new HttpError("Embedding is being updated. Please retry shortly.",503);
  const body = profileSchema.parse(input),
    db = adminClient();
  if (body.avatar_key && !body.avatar_key.startsWith(actor + "/"))
    throw new HttpError("Invalid avatar");
  if (
    body.avatar_url &&
    (!body.avatar_key ||
      !body.avatar_url.startsWith(process.env.NEXT_PUBLIC_INSFORGE_URL + "/"))
  )
    throw new HttpError("Upload your avatar using Meridian");
  if(!body.domains.length){const existing=checked(await db.database.from('profiles').select('onboarding_complete').eq('id',actor).limit(1))[0];if(!existing?.onboarding_complete)requiredDomains.parse(body.domains);}
  const provider = await embeddingProvider(),skills = await resolveSkills(body.skills);
  const old = checked(
    await db.database
      .from("profile_embeddings")
      .select("source_hash,model,version")
      .eq("profile_id", actor)
      .limit(1),
  )[0];
  const vector = await prepareEmbedding(
    canonicalProfile({ ...body, skills }),
    provider,
    old,
  );
  return checked(
    await db.database.rpc("save_profile", {
      actor,
      body: { ...body, skills },
      vec: vector,
      expected_revision: body.revision,
    }),
  );
}
export async function saveProject(actor: string, input: unknown) {
  if(process.env.EMBEDDING_WRITES_PAUSED === "true")throw new HttpError("Embedding is being updated. Please retry shortly.",503);
  const body = projectSchema.parse(input),
    db = adminClient();
  const id = body.id ?? crypto.randomUUID();
  if (body.id) {
    const existing = checked(
      await db.database
        .from("projects")
        .select("owner_id")
        .eq("id", id)
        .limit(1),
    );
    if (!existing[0] || existing[0].owner_id !== actor)
      throw new HttpError("Forbidden", 403);
  }
  const provider = await embeddingProvider();
  const existingRoles=body.id?checked(await db.database.from('project_roles').select('id').eq('project_id',id)):[];
  const roles = [];
  for (const role of body.roles) {
    if(!existingRoles.some(r=>r.id===role.id))requiredDomains.parse(role.domains.length?role.domains:body.domains);
    const rid = role.id ?? crypto.randomUUID();
    const skills = await resolveSkills(role.skills);
    const old = checked(
      await db.database
        .from("role_embeddings")
        .select("source_hash,model,version")
        .eq("role_id", rid)
        .limit(1),
    )[0];
    const vector = await prepareEmbedding(
      canonicalRole(
        {
          ...role,
          domains: role.domains.length ? role.domains : body.domains,
          skills,
        },
        body.title,
      ),
      provider,
      old,
    );
    roles.push({
      ...role,
      domains: role.domains.length ? role.domains : body.domains,
      id: rid,
      skills,
      vector,
    });
  }
  const old = checked(
    await db.database
      .from("project_embeddings")
      .select("source_hash,model,version")
      .eq("project_id", id)
      .limit(1),
  )[0];
  const vector = await prepareEmbedding(
    canonicalProject({ ...body, roles }),
    provider,
    old,
  );
  return checked(
    await db.database.rpc("save_project", {
      actor,
      body: { ...body, id, roles },
      vec: vector,
      expected_revision: body.revision,
    }),
  );
}
