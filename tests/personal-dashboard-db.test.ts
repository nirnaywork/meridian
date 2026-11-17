import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { localPostgres } from "./local-postgres";
let db: PGlite;
const lead = randomUUID(),
  alice = randomUUID(),
  bob = randomUUID(),
  outside = randomUUID(),
  project = randomUUID(),
  privateId = randomUUID();
async function asUser(id: string, sql: string, args: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT set_config('test.user_id',$1,true)", [id]);
    await tx.exec("SET LOCAL ROLE authenticated");
    return tx.query<any>(sql, args);
  });
}
async function action(id: string, input: unknown) {
  return db.query("SELECT public.personal_dashboard_action($1,$2::jsonb)", [
    id,
    JSON.stringify(input),
  ]);
}
async function dashboard(id: string, day = "2026-11-17") {
  return (
    await asUser(id, "SELECT public.personal_dashboard('UTC',$1::date) data", [
      day,
    ])
  ).rows[0].data;
}
beforeAll(async () => {
  db = await localPostgres();
  for (const id of [lead, alice, bob, outside]) {
    await db.query("INSERT INTO auth.users(id) VALUES($1)", [id]);
    await db.query(
      "INSERT INTO public.profiles(id,display_name,onboarding_complete) VALUES($1,'Private dashboard owner',true)",
      [id],
    );
  }
  await db.query(
    "INSERT INTO public.projects(id,owner_id,title,description,category,commitment,duration,team_size) VALUES($1,$2,'Private dashboard test','Authorisation checks','Web','casual','1 week',4)",
    [project, lead],
  );
  for (const uid of [alice, bob])
    await db.query("SELECT public.add_member($1,$2,NULL)", [project, uid]);
  await db.query("SELECT public.collaboration_action($1,$2,$3::jsonb)", [
    alice,
    project,
    JSON.stringify({
      action: "message",
      id: privateId,
      body: "Private text",
      recipients: [bob],
    }),
  ]);
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("never exposes private messages to a lead, outsider or signed-out caller", async () => {
  for (const id of [lead, outside])
    expect((await dashboard(id)).messages).toHaveLength(0);
  for (const id of [alice, bob]) {
    const result = await dashboard(id);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].id).toBe(privateId);
    expect(result.messages[0].link).toContain(
      "thread=" + [alice, bob].sort().join(","),
    );
  }
  await expect(
    asUser("", "SELECT public.personal_dashboard()"),
  ).rejects.toThrow("Sign in required");
});
it("isolates notes and preferences with RLS and actor-scoped writes", async () => {
  const id = randomUUID();
  await action(alice, {
    action: "note",
    id,
    body: "Remember the review",
    day: "2026-11-16",
  });
  await action(alice, {
    action: "preferences",
    dnd_enabled: true,
    dnd_until: null,
  });
  expect(
    (await asUser(bob, "SELECT * FROM public.daily_notes")).rows,
  ).toHaveLength(0);
  expect(
    (await asUser(bob, "SELECT * FROM public.dashboard_preferences")).rows,
  ).toHaveLength(0);
  await expect(action(bob, { action: "note_delete", id })).rejects.toThrow(
    "Note not found",
  );
  await expect(
    asUser(bob, "UPDATE public.daily_notes SET done=true WHERE id=$1", [id]),
  ).rejects.toThrow();
  expect((await dashboard(alice)).notes[0].day).toBe("2026-11-16");
  expect((await dashboard(alice)).messages).toHaveLength(0);
  await action(alice, {
    action: "preferences",
    dnd_until: "2020-01-01T00:00:00Z",
  });
  expect((await dashboard(alice)).messages).toHaveLength(1);
  await action(alice, { action: "note_done", id, done: true });
  expect((await dashboard(alice)).notes[0].done).toBe(true);
  expect((await dashboard(alice, "2026-11-18")).notes).toHaveLength(0);
});
it("deduplicates focus completions and restricts their history to the owner", async () => {
  const input = {
    action: "focus_complete",
    id: randomUUID(),
    kind: "focus",
    seconds: 60,
  };
  await action(alice, input);
  await action(alice, input);
  expect(
    (await asUser(alice, "SELECT * FROM public.focus_sessions")).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(bob, "SELECT * FROM public.focus_sessions")).rows,
  ).toHaveLength(0);
});
it("revokes both feed and activity access on removal", async () => {
  await db.query("SELECT public.collaboration_action($1,$2,$3::jsonb)", [
    lead,
    project,
    JSON.stringify({ action: "remove", user_id: bob }),
  ]);
  expect((await dashboard(bob)).messages).toHaveLength(0);
  expect((await dashboard(bob)).projects).toHaveLength(0);
  expect(
    (await asUser(bob, "SELECT * FROM public.project_messages")).rows,
  ).toHaveLength(0);
});
it("caps notes under a serialised owner lock", async () => {
  await db.query(
    "INSERT INTO public.daily_notes(id,user_id,day,body) SELECT gen_random_uuid(),$1,'2026-11-18','Note' FROM generate_series(1,50)",
    [alice],
  );
  await expect(
    action(alice, {
      action: "note",
      id: randomUUID(),
      day: "2026-11-18",
      body: "One too many",
    }),
  ).rejects.toThrow("50 notes per day");
});
