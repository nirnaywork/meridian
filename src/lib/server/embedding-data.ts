import "server-only";
import { session, checked, HttpError } from "./db";
import { z } from "zod";
export async function projectEmbeddingContext(id: string, request: Request) {
  const projectId = z.string().uuid().parse(id);
  const role = z
    .string()
    .uuid()
    .nullable()
    .parse(new URL(request.url).searchParams.get("role") || null);
  const { db, user } = await session(false);
  const project = checked(
    await db.database
      .from("projects")
      .select("id,owner_id,title")
      .eq("id", projectId)
      .limit(1),
  )[0];
  if (!project) throw new HttpError("Project not found", 404);
  if (role) {
    const row = checked(
      await db.database
        .from("project_roles")
        .select("id")
        .eq("project_id", projectId)
        .eq("id", role)
        .limit(1),
    )[0];
    if (!row) throw new HttpError("Role not found in this project", 404);
  }
  return { db, user, project, role };
}
export async function targetEmbedding(
  db: Awaited<ReturnType<typeof session>>["db"],
  project: string,
  role: string | null,
) {
  return (
    checked(
      await db.database
        .from(role ? "role_embeddings" : "project_embeddings")
        .select("*")
        .eq(role ? "role_id" : "project_id", role ?? project)
        .limit(1),
    )[0] ?? null
  );
}
