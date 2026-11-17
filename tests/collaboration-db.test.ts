import { beforeAll, afterAll, expect, it } from "vitest";
import { applyLocalMigration, localPostgres } from "./local-postgres";
import type { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
let db: PGlite;
const lead = randomUUID(),
  member = randomUUID(),
  outsider = randomUUID(),
  pending = randomUUID(),
  project = randomUUID(),
  role = randomUUID(),
  second = randomUUID();
async function action(actor: string, input: unknown) {
  return (
    await db.query<{ result: any }>(
      "SELECT public.collaboration_action($1,$2,$3::jsonb) result",
      [actor, project, JSON.stringify(input)],
    )
  ).rows[0].result;
}
async function asUser(user: string, sql: string, params: unknown[] = []) {
  return db.transaction(async (tx) => {
    await tx.query("SELECT set_config('test.user_id',$1,true)", [user]);
    await tx.exec("SET LOCAL ROLE authenticated");
    return tx.query(sql, params);
  });
}
beforeAll(async () => {
  db = await localPostgres();
  for (const [id, name, isLead] of [
    [lead, "Lead", true],
    [member, "Member", true],
    [outsider, "Outsider", false],
    [pending, "Pending", false],
  ] as const) {
    await db.query("INSERT INTO auth.users(id) VALUES($1)", [id]);
    await db.query(
      "INSERT INTO public.profiles(id,display_name,is_team_lead,onboarding_complete) VALUES($1,$2,$3,true)",
      [id, name, isLead],
    );
  }
  await db.query(
    "INSERT INTO public.projects(id,owner_id,title,description,category,commitment,duration,team_size) VALUES($1,$2,'Local collaboration test','A safe isolated test project','Testing','casual','2 weeks',3)",
    [project, lead],
  );
  await db.query(
    "INSERT INTO public.project_roles(id,project_id,title,slots) VALUES($1,$2,'Builder',1),($3,$2,'Reviewer',1)",
    [role, project, second],
  );
  await db.query("SELECT public.add_member($1,$2,$3)", [project, member, role]);
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("blocks outsiders and pending applicants from workspace reads and writes", async () => {
  await db.query("SELECT public.submit_match($1,$2,$3,'apply')", [
    pending,
    project,
    second,
  ]);
  for (const user of [outsider, pending]) {
    expect(
      (await asUser(user, "SELECT * FROM public.project_messages")).rows,
    ).toHaveLength(0);
    expect(
      (await asUser(user, "SELECT * FROM public.project_tickets")).rows,
    ).toHaveLength(0);
    await expect(
      asUser(user, "SELECT public.workspace_data($1)", [project]),
    ).rejects.toThrow("Workspace access denied");
    await expect(
      action(user, { action: "message", id: randomUUID(), body: "forbidden" }),
    ).rejects.toThrow("Workspace access denied");
  }
});
it("creates participation notifications atomically and isolates inboxes", async () => {
  const rows = (await asUser(lead, "SELECT * FROM public.notifications"))
    .rows as any[];
  expect(rows.some((n) => n.type === "applications.pending")).toBe(true);
  expect(
    (await asUser(outsider, "SELECT * FROM public.notifications")).rows,
  ).toHaveLength(0);
  await expect(
    asUser(
      member,
      "INSERT INTO public.notifications(recipient_id,type,title,link) VALUES($1,'fake','fake','/')",
      [lead],
    ),
  ).rejects.toThrow();
});
it("stores safe messages idempotently and enforces author-only deletion", async () => {
  const id = randomUUID();
  await action(member, {
    action: "message",
    id,
    body: "<script>safe plain text</script>",
  });
  await action(member, {
    action: "message",
    id,
    body: "<script>safe plain text</script>",
  });
  expect(
    (
      await asUser(
        member,
        "SELECT * FROM public.project_messages WHERE id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    action(lead, { action: "edit_message", id, body: "not mine" }),
  ).rejects.toThrow("permission");
  await expect(action(lead, { action: "delete_message", id })).rejects.toThrow(
    "permission",
  );
  await action(member, { action: "delete_message", id });
  expect(
    (
      await db.query<any>(
        "SELECT body,deleted_at FROM public.project_messages WHERE id=$1",
        [id],
      )
    ).rows[0].body,
  ).toBe("Message removed");
});
it("isolates private conversations from the lead in direct reads, RPCs and counts", async () => {
  await db.query("SELECT public.add_member($1,$2,$3)", [
    project,
    outsider,
    second,
  ]);
  const id = randomUUID(),
    thread = [member, outsider].sort().join(",");
  await action(member, {
    action: "message",
    id,
    body: "Private note",
    recipients: [outsider],
  });
  for (const [viewer, visible] of [
    [lead, false],
    [member, true],
    [outsider, true],
    [pending, false],
  ] as const) {
    const direct = await asUser(
      viewer,
      "SELECT id FROM public.project_messages WHERE id=$1",
      [id],
    );
    expect(direct.rows.length).toBe(visible ? 1 : 0);
    if (viewer !== pending) {
      const read = async (kind: string) =>
        (
          await asUser(viewer, "SELECT public.workspace_data($1,$2) result", [
            project,
            kind,
          ])
        ).rows[0] as any;
      expect((await read("messages:" + thread)).result.data.length).toBe(
        visible ? 1 : 0,
      );
      expect(
        (await read("conversations")).result.data.some(
          (r: any) => r.thread === thread,
        ),
      ).toBe(visible);
    }
  }
  await action(outsider, { action: "leave" });
  await expect(
    asUser(outsider, "SELECT public.workspace_data($1,$2)", [
      project,
      "messages:" + thread,
    ]),
  ).rejects.toThrow("access denied");
  expect(
    (
      await asUser(
        outsider,
        "SELECT id FROM public.project_messages WHERE id=$1",
        [id],
      )
    ).rows,
  ).toHaveLength(0);
});
it("starts partially staffed projects and enforces ticket lifecycle and update ownership", async () => {
  await action(lead, { action: "status", status: "in_progress" });
  expect(
    (
      await db.query("SELECT started_by FROM public.projects WHERE id=$1", [
        project,
      ])
    ).rows[0],
  ).toEqual({ started_by: lead });
  await action(lead, { action: "status", status: "open" });
  const id = randomUUID();
  await action(member, {
    action: "ticket",
    id,
    title: "Build",
    description: "Fix layout",
    type: "Issue",
    priority: "high",
    assignee_id: member,
  });
  await expect(
    action(lead, { action: "ticket_status", id, status: "closed" }),
  ).rejects.toThrow("Invalid ticket transition");
  for (const status of ["in_progress", "resolved", "closed", "open"])
    await action(lead, { action: "ticket_status", id, status });
  const update = { action: "post_update", id: randomUUID(), body: "Completed" };
  await action(member, update);
  await action(member, update);
  expect(
    (
      await asUser(
        lead,
        "SELECT * FROM public.notifications WHERE type='update.posted'",
      )
    ).rows,
  ).toHaveLength(1);
  await expect(
    action(lead, { action: "delete_update", id: update.id }),
  ).rejects.toThrow("permission");
});
it("protects private profiles, links metadata and vectors under RLS", async () => {
  expect(
    (
      await asUser(outsider, "SELECT id FROM public.profiles WHERE id=$1", [
        member,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (await asUser(lead, "SELECT id FROM public.profiles WHERE id=$1", [member]))
      .rows,
  ).toHaveLength(1);
  await db.query(
    "UPDATE public.profiles SET visibility='public',links=$2 WHERE id=$1",
    [
      member,
      JSON.stringify({ github: "https://github.com/member", custom: [] }),
    ],
  );
  expect(
    (
      await asUser(outsider, "SELECT id FROM public.profiles WHERE id=$1", [
        member,
      ])
    ).rows,
  ).toHaveLength(1);
  expect(
    (await asUser(outsider, "SELECT * FROM public.profile_embeddings")).rows,
  ).toHaveLength(0);
});
it("locks capacity and rejects competing approvals without overfilling", async () => {
  await db.query("SELECT public.submit_match($1,$2,$3,'apply')", [
    outsider,
    project,
    second,
  ]);
  const applications = (
    await db.query<any>(
      "SELECT id FROM public.applications WHERE project_id=$1 AND role_id=$2 AND status='pending'",
      [project, second],
    )
  ).rows;
  const outcomes = await Promise.allSettled(
    applications.map((a) =>
      db.query("SELECT public.respond_match($1,$2,'application','approved')", [
        lead,
        a.id,
      ]),
    ),
  );
  expect(outcomes.filter((o) => o.status === "fulfilled")).toHaveLength(1);
  expect(
    (
      await db.query<any>(
        "SELECT filled_count FROM public.project_roles WHERE id=$1",
        [second],
      )
    ).rows[0].filled_count,
  ).toBe(1);
});
it("preserves leave history, unassigns tickets, revokes access and allows a new pending application", async () => {
  await action(member, { action: "leave", note: "Schedule changed" });
  expect(
    (
      await db.query<any>(
        "SELECT left_at FROM public.project_members WHERE project_id=$1 AND user_id=$2",
        [project, member],
      )
    ).rows[0].left_at,
  ).toBeTruthy();
  expect(
    (
      await db.query<any>(
        "SELECT assignee_id FROM public.project_tickets WHERE project_id=$1",
        [project],
      )
    ).rows[0].assignee_id,
  ).toBeNull();
  expect(
    (
      await db.query<any>(
        "SELECT filled_count FROM public.project_roles WHERE id=$1",
        [role],
      )
    ).rows[0].filled_count,
  ).toBe(0);
  await expect(
    action(member, { action: "message", id: randomUUID(), body: "no access" }),
  ).rejects.toThrow("access denied");
  await db.query("SELECT public.submit_match($1,$2,$3,'apply')", [
    member,
    project,
    role,
  ]);
});
it("paginates message changes without skipping older edits or deleted rows", async () => {
  for (let i = 0; i < 55; i++)
    await action(lead, {
      action: "message",
      id: randomUUID(),
      body: "Batch message " + i,
    });
  const page1 = (
    await asUser(
      lead,
      "SELECT public.workspace_data($1,'messages',NULL,NULL,0) result",
      [project],
    )
  ).rows[0] as any;
  expect(page1.result.data).toHaveLength(50);
  const page2 = (
    await asUser(
      lead,
      "SELECT public.workspace_data($1,'messages',NULL,NULL,$2) result",
      [project, page1.result.sequence],
    )
  ).rows[0] as any;
  expect(page2.result.data.length).toBeGreaterThan(0);
  expect(page2.result.sequence).toBeGreaterThan(page1.result.sequence);
  const first = page1.result.data.find(
    (m: any) => m.author_id === lead && !m.deleted_at,
  );
  await action(lead, {
    action: "edit_message",
    id: first.id,
    body: "Edited an old message",
  });
  const changes = (
    await asUser(
      lead,
      "SELECT public.workspace_data($1,'messages',NULL,NULL,$2) result",
      [project, page2.result.sequence],
    )
  ).rows[0] as any;
  expect(changes.result.data).toHaveLength(1);
  expect(changes.result.data[0].body).toBe("Edited an old message");
});
it("completes the project, rejects pending applications, and makes the workspace read-only", async () => {
  await action(lead, { action: "status", status: "completed" });
  expect(
    (
      await db.query(
        "SELECT id FROM public.applications WHERE project_id=$1 AND status='pending'",
        [project],
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    action(lead, { action: "message", id: randomUUID(), body: "closed" }),
  ).rejects.toThrow("read-only");
  await expect(
    action(lead, { action: "status", status: "open" }),
  ).rejects.toThrow("Invalid project status");
  await action(lead, { action: "status", status: "archived" });
});
it("transfers ownership only after recipient acceptance, preserves capacity and supports removal", async () => {
  const pid = randomUUID(),
    rid = randomUUID(),
    otherRole = randomUUID();
  await db.query(
    "INSERT INTO public.projects(id,owner_id,title,description,category,commitment,duration,team_size) VALUES($1,$2,'Ownership test','Isolated lifecycle fixture','Testing','casual','2 weeks',3)",
    [pid, lead],
  );
  await db.query(
    "INSERT INTO public.project_roles(id,project_id,title,slots) VALUES($1,$2,'Builder',1),($3,$2,'Reviewer',1)",
    [rid, pid, otherRole],
  );
  await db.query("SELECT public.add_member($1,$2,$3)", [pid, member, rid]);
  await db.query("SELECT public.add_member($1,$2,$3)", [
    pid,
    outsider,
    otherRole,
  ]);
  const run = async (actor: string, input: unknown) =>
    (
      await db.query<any>(
        "SELECT public.collaboration_action($1,$2,$3) result",
        [actor, pid, JSON.stringify(input)],
      )
    ).rows[0].result;
  await expect(
    run(lead, { action: "reassign", user_id: member, role_id: otherRole }),
  ).rejects.toThrow("full or invalid");
  const transfer = await run(lead, { action: "transfer", user_id: member });
  expect(
    (
      await db.query<any>("SELECT owner_id FROM public.projects WHERE id=$1", [
        pid,
      ])
    ).rows[0].owner_id,
  ).toBe(lead);
  await expect(
    run(outsider, { action: "transfer_reply", id: transfer.id, accept: true }),
  ).rejects.toThrow("no longer valid");
  await run(member, {
    action: "transfer_reply",
    id: transfer.id,
    accept: true,
  });
  expect(
    (
      await db.query<any>("SELECT owner_id FROM public.projects WHERE id=$1", [
        pid,
      ])
    ).rows[0].owner_id,
  ).toBe(member);
  expect(
    (
      await db.query<any>(
        "SELECT count(*)::int n FROM public.project_members WHERE project_id=$1 AND left_at IS NULL",
        [pid],
      )
    ).rows[0].n,
  ).toBe(2);
  await expect(
    run(lead, { action: "status", status: "completed" }),
  ).rejects.toThrow("Only the lead");
  await run(member, {
    action: "remove",
    user_id: outsider,
    note: "Team change",
  });
  expect(
    (
      await asUser(
        outsider,
        "SELECT * FROM public.project_messages WHERE project_id=$1",
        [pid],
      )
    ).rows,
  ).toHaveLength(0);
  await expect(
    run(outsider, {
      action: "post_update",
      id: randomUUID(),
      body: "no access",
    }),
  ).rejects.toThrow("access denied");
  expect(
    (
      await db.query<any>(
        "SELECT filled_count FROM public.project_roles WHERE id=$1",
        [otherRole],
      )
    ).rows[0].filled_count,
  ).toBe(0);
  const notification = (
    await asUser(
      outsider,
      "SELECT * FROM public.notifications WHERE type='member.remove'",
    )
  ).rows as any[];
  expect(notification).toHaveLength(1);
  expect(notification[0].actor_id).toBe(member);
});
it("metadata writes leave canonical hashes, vectors and application snapshots byte-for-byte unchanged", async () => {
  const vector = JSON.stringify([1, ...Array(383).fill(0)]);
  await db.query(
    "INSERT INTO public.profile_embeddings(profile_id,embedding,source_hash,model,version,trace) VALUES($1,$2::vector,'unchanged-hash','test-model','test-version','{\"canonical_text\":\"unchanged\"}')",
    [member, vector],
  );
  const before = (
    await db.query(
      "SELECT embedding::text,source_hash,model,version,trace,updated_at FROM public.profile_embeddings WHERE profile_id=$1",
      [member],
    )
  ).rows;
  const snapshots = (
    await db.query(
      "SELECT id,cosine,match_percent,calibration_version,breakdown FROM public.applications ORDER BY id",
    )
  ).rows;
  await db.query(
    "UPDATE public.profiles SET links=$2,visibility='private' WHERE id=$1",
    [
      member,
      JSON.stringify({
        github: "https://github.com/member",
        linkedin: "",
        website: "",
        custom: [],
      }),
    ],
  );
  expect(
    (
      await db.query(
        "SELECT embedding::text,source_hash,model,version,trace,updated_at FROM public.profile_embeddings WHERE profile_id=$1",
        [member],
      )
    ).rows,
  ).toEqual(before);
  expect(
    (
      await db.query(
        "SELECT id,cosine,match_percent,calibration_version,breakdown FROM public.applications ORDER BY id",
      )
    ).rows,
  ).toEqual(snapshots);
  expect(
    (
      await asUser(
        outsider,
        "SELECT * FROM public.profile_embeddings WHERE profile_id=$1",
        [member],
      )
    ).rows,
  ).toHaveLength(0);
});
