import { admin, must } from "./lib";
import { createHash } from "node:crypto";
export type TestRegistry = {
  users: { id: string; email: string }[];
  projects: string[];
  entities?: Record<string, unknown[]>;
};
export async function cleanupTestRecords(
  registry: TestRegistry,
  onProgress?: () => void,
) {
  const users = registry.users.map((u) => u.id),
    projects = registry.projects;
  if (
    [...users, ...projects].some(
      (id) => !/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id),
    )
  )
    throw new Error("Invalid recorded cleanup id");
  const ids: Record<string, unknown[]> = registry.entities ?? {};
  registry.entities = ids;
  const deleted: Record<string, number> = {};
  if (projects.length) {
    const owned = must(
      await admin.database
        .from("projects")
        .select("id,owner_id")
        .in("id", projects),
    );
    if (owned.some((p) => !users.includes(p.owner_id)))
      throw new Error(
        "Cleanup stopped: project owner is outside recorded fixture users",
      );
    for (const [table, columns] of [
      ["project_members", ["user_id"]],
      ["applications", ["applicant_id"]],
      ["invitations", ["inviter_id", "invitee_id"]],
      ["project_messages", ["author_id"]],
      ["project_updates", ["author_id"]],
      ["project_tickets", ["created_by", "assignee_id"]],
    ] as const) {
      const rows = must(
        await admin.database
          .from(table)
          .select(columns.join(","))
          .in("project_id", projects),
      ) as any[];
      if (
        rows.some((row) =>
          columns.some((column) => row[column] && !users.includes(row[column])),
        )
      )
        throw new Error("Cleanup stopped: foreign participant in " + table);
    }
  }
  async function remove(table: string, column: string, values: string[]) {
    if (!values.length) return;
    const rows = must(
      await admin.database.from(table).select("*").in(column, values),
    ) as any[];
    ids[table] = [
      ...(ids[table] ?? []),
      ...rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).filter(
            ([k]) => k === "id" || k === "key" || k.endsWith("_id"),
          ),
        ),
      ),
    ];
    onProgress?.();
    if (rows.length) {
      const removed = must(
        await admin.database
          .from(table)
          .delete()
          .in(column, values)
          .select(column),
      );
      deleted[table] = (deleted[table] ?? 0) + removed.length;
    }
  }
  // Delete only recorded project/user scopes, with dependent rows before parents.
  await remove("notifications", "project_id", projects);
  await remove("notifications", "recipient_id", users);
  for (const table of [
    "project_messages",
    "project_updates",
    "project_tickets",
    "workspace_read_state",
    "ownership_transfers",
    "project_members",
    "applications",
    "invitations",
  ])
    await remove(table, "project_id", projects);
  const roles = projects.length
    ? must(
        await admin.database
          .from("project_roles")
          .select("id")
          .in("project_id", projects),
      ).map((r) => r.id)
    : [];
  await remove("role_embeddings", "role_id", roles);
  await remove("project_role_skills", "role_id", roles);
  await remove("role_domains", "role_id", roles);
  await remove("project_embeddings", "project_id", projects);
  await remove("project_domains", "project_id", projects);
  await remove("project_roles", "project_id", projects);
  // Recheck after child deletion: do not assume no delayed request completed.
  const pendingTickets = projects.length
    ? must(
        await admin.database
          .from("project_tickets")
          .select("id")
          .in("project_id", projects),
      )
    : [];
  if (pendingTickets.length)
    throw new Error(
      "Cleanup stopped: a ticket appeared during cleanup; reconcile recorded fixture before deleting parents",
    );
  await remove("notifications", "project_id", projects);
  await remove("projects", "id", projects);
  await remove("profile_embeddings", "profile_id", users);
  await remove("profile_skills", "profile_id", users);
  await remove("profile_domains", "profile_id", users);
  for(const table of ["daily_notes","focus_sessions","dashboard_preferences"]) await remove(table,"user_id",users);
  await remove("profiles", "id", users);
  const keys = registry.users.flatMap((u) => [
    `actions:${u.id}`,
    `embed:${u.id}`,
    `profile-metadata:${u.id}`,
    `workspace:action:${u.id}`,
    `workspace:update:${u.id}`,
    `workspace:message:${u.id}`,
    `notifications:${u.id}`,
    `personal-dashboard:${u.id}`,
    `auth:sign-in:${createHash("sha256").update(u.email.toLowerCase()).digest("hex")}`,
  ]);
  await remove("rate_limits", "key", keys);
  if (users.length) {
    // Verified in InsForge's admin auth route: DELETE /api/auth/users {userIds}.
    const response = await fetch(
      process.env.NEXT_PUBLIC_INSFORGE_URL + "/api/auth/users",
      {
        method: "DELETE",
        headers: {
          Authorization: "Bearer " + process.env.INSFORGE_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userIds: users }),
      },
    );
    if (!response.ok)
      throw new Error("Auth cleanup failed: HTTP " + response.status);
    for (const id of users) {
      const exists = await fetch(
        process.env.NEXT_PUBLIC_INSFORGE_URL + "/api/auth/users/" + id,
        {
          headers: { Authorization: "Bearer " + process.env.INSFORGE_API_KEY },
        },
      );
      if (exists.status !== 404)
        throw new Error("Auth account cleanup verification failed for " + id);
    }
    deleted.auth_users = users.length;
    ids.auth_users = users;
  }
  registry.entities = ids;
  onProgress?.();
  return { status: "passed", deleted, recorded_ids: ids };
}
