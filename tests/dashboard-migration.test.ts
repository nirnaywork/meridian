import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { applyLocalMigration, localPostgres } from "./local-postgres";

it("aborts on unarchived tasks and preserves existing messages and read positions on migration", async () => {
  const db = await localPostgres({
    through: "20261118030000_task-conflict-response.sql",
  });
  const sql = readFileSync(
    "migrations/20261118040000_team-dashboard.sql",
    "utf8",
  );
  const owner = randomUUID(),
    project = randomUUID(),
    message = randomUUID();
  try {
    await db.query("INSERT INTO auth.users(id) VALUES($1)", [owner]);
    await db.query(
      "INSERT INTO public.profiles(id,display_name) VALUES($1,'Lead')",
      [owner],
    );
    await db.query(
      "INSERT INTO public.projects(id,owner_id,title,description,category,commitment,duration,team_size) VALUES($1,$2,'Migration test','Check the migration','Web','casual','1 week',4)",
      [project, owner],
    );
    await db.query(
      "INSERT INTO public.project_messages(id,project_id,author_id,body) VALUES($1,$2,$3,'Earlier message')",
      [message, project, owner],
    );
    await db.query(
      "INSERT INTO public.workspace_read_state(project_id,user_id) VALUES($1,$2)",
      [project, owner],
    );
    const saved = (
      await db.query<Record<string, unknown>>(
        "SELECT * FROM public.project_messages",
      )
    ).rows[0];
    const read = (
      await db.query<Record<string, unknown>>(
        "SELECT * FROM public.workspace_read_state",
      )
    ).rows[0];
    await db.query(
      "INSERT INTO public.project_tasks(project_id,title,created_by) VALUES($1,'Created after backup',$2)",
      [project, owner],
    );
    await expect(applyLocalMigration(db, sql)).rejects.toThrow(
      "Tasks changed since export",
    );
    expect(
      (await db.query("SELECT title FROM public.project_tasks")).rows,
    ).toEqual([{ title: "Created after backup" }]);
    await db.query("DELETE FROM public.project_tasks WHERE project_id=$1", [
      project,
    ]);
    await applyLocalMigration(db, sql);
    expect(
      (await db.query("SELECT * FROM public.project_messages")).rows[0],
    ).toEqual({ ...saved, thread: "everyone", participants: [] });
    expect(
      (await db.query("SELECT * FROM public.workspace_read_state")).rows[0],
    ).toEqual({ ...read, thread: "everyone" });
    await expect(
      db.query("UPDATE public.projects SET status='in_progress' WHERE id=$1", [
        project,
      ]),
    ).rejects.toThrow("another active member");
  } finally {
    await db.close();
  }
}, 60000);
