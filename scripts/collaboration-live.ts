import assert from "node:assert/strict";
import { request, type APIRequestContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync } from "node:fs";
import { admin, must, createTestUser, login } from "./lib";
import { cleanupTestRecords, type TestRegistry } from "./cleanup-test-records";

const origin = process.env.TEST_APP_URL ?? "http://localhost:3000",
  run = randomUUID(),
  registry: TestRegistry = { users: [], projects: [] };
const report: {
  run: string;
  checks: { name: string; status: string; error?: string }[];
  ids: Record<string, unknown>;
  cleanup?: unknown;
  error?: string;
} = { run, checks: [], ids: {} };
const clients: APIRequestContext[] = [];
function persist() {
  writeFileSync(
    ".cache/collaboration-live-registry.json",
    JSON.stringify(registry, null, 2),
  );
  writeFileSync(
    "docs/dashboard-live-api.json",
    JSON.stringify(report, null, 2),
  );
}
async function check<T>(name: string, fn: () => Promise<T>) {
  try {
    const value = await fn();
    report.checks.push({ name, status: "passed" });
    console.log("PASS " + name);
    persist();
    return value;
  } catch (e) {
    report.checks.push({
      name,
      status: "failed",
      error: (e as Error).message.slice(0, 1500),
    });
    persist();
    throw e;
  }
}
async function call(
  client: APIRequestContext,
  path: string,
  body?: unknown,
  expected = 200,
) {
  const r =
    body === undefined
      ? await client.get(path)
      : await client.post(path, { data: body });
  const text = await r.text();
  assert.equal(
    r.status(),
    expected,
    `${path}: HTTP ${r.status()}: ${text.slice(0, 700)}`,
  );
  return text ? JSON.parse(text) : null;
}
async function blocked(
  client: APIRequestContext,
  path: string,
  body?: unknown,
  status?: number,
) {
  const r =
    body === undefined
      ? await client.get(path)
      : await client.post(path, { data: body });
  assert(r.status() >= 400, `Unexpected permission success: ${path}`);
  if (status) assert.equal(r.status(), status);
  return r.json();
}
mkdirSync(".cache", { recursive: true });
let fatal: unknown;
try {
  const people = [];
  for (const label of ["lead", "member", "invitee", "pending", "outside"]) {
    const who = await createTestUser(
      "Collaboration live " + label,
      `collab-${run}-${label}@example.test`,
    );
    registry.users.push({ id: who.id, email: who.email });
    persist();
    const client = await request.newContext({
      baseURL: origin,
      extraHTTPHeaders: { Origin: origin },
    });
    clients.push(client);
    await call(client, "/api/auth/sign-in", {
      email: who.email,
      password: who.password,
    });
    await call(client, "/api/data/profile", {
      display_name: "Collaboration live " + label,
      headline: "Frontend developer with React and TypeScript",
      domains: ["Frontend Development"],
      bio: "Temporary live integration fixture; removed after verification.",
      is_member: true,
      is_team_lead: label === "lead" || label === "member",
      onboarding_complete: true,
      revision: 0,
      skills: [
        { name: "React", proficiency: "advanced" },
        { name: "TypeScript", proficiency: "advanced" },
      ],
    });
    people.push({ ...who, client });
  }
  const [lead, member, invitee, pending, outside] = people;
  report.ids.users = people.map(({ id }) => id);
  const created = await call(lead.client, "/api/data/project", {
    title: "Collaboration live verification " + run.slice(0, 8),
    description:
      "Temporary project for real collaboration API authorization and lifecycle verification.",
    category: "Web",
    domains: ["Web Development"],
    tags: ["collaboration-qa"],
    commitment: "casual",
    duration: "1 week",
    team_size: 3,
    roles: [
      {
        title: "Frontend Developer",
        description: "Build React interfaces.",
        slots: 1,
        domains: ["Frontend Development"],
        skills: [{ name: "React", importance: "required" }],
      },
      {
        title: "QA Engineer",
        description: "Test TypeScript interfaces.",
        slots: 1,
        domains: ["QA and Testing"],
        skills: [{ name: "TypeScript", importance: "required" }],
      },
    ],
  });
  registry.projects.push(created.id);
  report.ids.project = created.id;
  persist();
  const pid = created.id,
    w = `/api/projects/${pid}/workspace`;
  const project = await call(member.client, "/api/data/project?id=" + pid),
    r1 = project.roles.find((r: any) => r.title === "Frontend Developer").id,
    r2 = project.roles.find((r: any) => r.title === "QA Engineer").id;
  report.ids.roles = [r1, r2];
  const act = (c: APIRequestContext, body: unknown) =>
    call(c, "/api/actions", body);
  const ws = (c: APIRequestContext, body: unknown) => call(c, w, body);
  const notify = async (c: APIRequestContext, type: string) => {
    const data = await call(c, "/api/notifications?limit=30");
    assert(
      data.data.some((n: any) => n.type === type),
      "Missing notification " + type,
    );
    return data.data.find((n: any) => n.type === type);
  };
  await check(
    "private profiles and talent are hidden from unrelated users",
    async () => {
      await blocked(
        outside.client,
        "/api/profiles/" + member.id,
        undefined,
        403,
      );
      assert(
        !(await call(lead.client, "/api/data/talent?role=" + r1)).some(
          (p: any) => p.id === member.id,
        ),
      );
    },
  );
  await check(
    "links/public visibility save without changing the embedding or trace",
    async () => {
      const before = must(
        await admin.database
          .from("profile_embeddings")
          .select("*")
          .eq("profile_id", member.id)
          .single(),
      );
      await call(member.client, "/api/profile-metadata", {
        github: "github.com/meridian-verification",
        linkedin: "",
        website: "",
        custom: [],
        visibility: "public",
      });
      const after = must(
        await admin.database
          .from("profile_embeddings")
          .select("*")
          .eq("profile_id", member.id)
          .single(),
      );
      assert.deepEqual(after, before);
      const p = await call(outside.client, "/api/profiles/" + member.id);
      assert.equal(p.links.github, "https://github.com/meridian-verification");
      assert(!("email" in p) && !("embedding" in p) && !("trace" in p));
      assert(
        (await call(lead.client, "/api/data/talent?role=" + r1)).some(
          (p: any) => p.id === member.id,
        ),
      );
    },
  );
  await check(
    "Explore, project role percentages and stored Under the Hood endpoints work",
    async () => {
      const page = await call(
        member.client,
        "/api/projects?search=" + encodeURIComponent(project.title),
      );
      assert(page.data.some((p: any) => p.id === pid));
      assert(Number.isInteger(project.roles[0].match.matchPercent));
      assert(!JSON.stringify(project).match(/"cosine"|"embedding"/));
      const own = await call(member.client, "/api/embeddings/me");
      assert(own.embedding);
      const embedding = Array.isArray(own.embedding.embedding)
        ? own.embedding.embedding
        : JSON.parse(own.embedding.embedding);
      assert.equal(embedding.length, 384);
      const target = await call(
        member.client,
        `/api/projects/${pid}/embedding?role=${r1}`,
      );
      assert(target.embedding ?? target);
      const similarity = await call(
        member.client,
        `/api/projects/${pid}/similarity?role=${r1}`,
      );
      assert.equal(similarity.mode, "member");
      assert.equal(typeof similarity.cosine, "number");
    },
  );
  const application = await check(
    "apply stays pending, notifies lead, and pending/nonmembers lack workspace access",
    async () => {
      const a = await act(member.client, {
        action: "apply",
        project_id: pid,
        role_id: r1,
        message: "Live apply",
      });
      assert.equal(a.status, "pending");
      await notify(lead.client, "applications.pending");
      await blocked(member.client, w, undefined, 403);
      await blocked(outside.client, w + "?resource=messages", undefined, 403);
      await blocked(outside.client, w + "?resource=tickets", undefined, 403);
      await blocked(lead.client, "/api/actions", {
        action: "apply",
        project_id: pid,
        role_id: r1,
      });
      await blocked(member.client, "/api/actions", {
        action: "apply",
        project_id: pid,
        role_id: r1,
      });
      return a;
    },
  );
  report.ids.application = application.id;
  await check(
    "approval notifies applicant and grants active workspace access",
    async () => {
      await act(lead.client, {
        action: "respond",
        id: application.id,
        kind: "application",
        decision: "approved",
      });
      await notify(member.client, "applications.approved");
      assert.equal((await call(member.client, w)).project.id, pid);
      assert(
        (await call(member.client, "/api/data/applications")).some(
          (a: any) =>
            a.id === application.id && Number.isInteger(a.matchPercent),
        ),
      );
    },
  );
  await check(
    "rejection and withdrawal notify the correct recipients",
    async () => {
      const a = await act(outside.client, {
        action: "apply",
        project_id: pid,
        role_id: r1,
      });
      await act(lead.client, {
        action: "respond",
        id: a.id,
        kind: "application",
        decision: "rejected",
      });
      await notify(outside.client, "applications.rejected");
      const b = await act(outside.client, {
        action: "apply",
        project_id: pid,
        role_id: r2,
      });
      await act(outside.client, {
        action: "respond",
        id: b.id,
        kind: "application",
        decision: "withdrawn",
      });
      await notify(lead.client, "applications.withdrawn");
    },
  );
  const racePending = await act(pending.client, {
    action: "apply",
    project_id: pid,
    role_id: r2,
  });
  const invitation = await act(lead.client, {
    action: "invite",
    project_id: pid,
    role_id: r2,
    target: invitee.id,
  });
  await check(
    "closed/in_progress preserve pending records and block new recruiting",
    async () => {
      await notify(invitee.client, "invitations.pending");
      await blocked(invitee.client, w, undefined, 403);
      for (const status of ["in_progress", "closed"]) {
        await ws(lead.client, { action: "status", status });
        assert.equal(
          must(
            await admin.database
              .from("applications")
              .select("status")
              .eq("id", racePending.id)
              .single(),
          ).status,
          "pending",
        );
        assert.equal(
          must(
            await admin.database
              .from("invitations")
              .select("status")
              .eq("id", invitation.id)
              .single(),
          ).status,
          "pending",
        );
      }
      await blocked(outside.client, "/api/actions", {
        action: "apply",
        project_id: pid,
        role_id: null,
      });
      await blocked(lead.client, "/api/actions", {
        action: "invite",
        project_id: pid,
        role_id: r1,
        target: outside.id,
      });
      await ws(lead.client, { action: "status", status: "open" });
    },
  );
  await check(
    "invitation acceptance/decline/cancel notify correctly and acceptance adds membership",
    async () => {
      await act(invitee.client, {
        action: "respond",
        id: invitation.id,
        kind: "invitation",
        decision: "accepted",
      });
      await notify(lead.client, "invitations.accepted");
      await call(invitee.client, w);
      const declined = await act(lead.client, {
        action: "invite",
        project_id: pid,
        role_id: r1,
        target: pending.id,
      });
      await act(pending.client, {
        action: "respond",
        id: declined.id,
        kind: "invitation",
        decision: "declined",
      });
      await notify(lead.client, "invitations.declined");
      const cancelled = await act(lead.client, {
        action: "invite",
        project_id: pid,
        role_id: r1,
        target: outside.id,
      });
      await act(lead.client, {
        action: "respond",
        id: cancelled.id,
        kind: "invitation",
        decision: "cancelled",
      });
      await notify(outside.client, "invitations.cancelled");
    },
  );
  await check(
    "recipient-only inboxes, mark-read and direct RLS/privileged RPC denial",
    async () => {
      const n = await notify(lead.client, "applications.pending");
      await call(outside.client, "/api/notifications", { id: n.id });
      assert.equal(
        must(
          await admin.database
            .from("notifications")
            .select("read_at")
            .eq("id", n.id)
            .single(),
        ).read_at,
        null,
      );
      await call(lead.client, "/api/notifications", { id: n.id });
      assert(
        must(
          await admin.database
            .from("notifications")
            .select("read_at")
            .eq("id", n.id)
            .single(),
        ).read_at,
      );
      const { client } = await login(outside.email, outside.password);
      assert.equal(
        must(
          await client.database
            .from("project_messages")
            .select("id")
            .eq("project_id", pid),
        ).length,
        0,
      );
      assert.equal(
        must(
          await client.database
            .from("project_tickets")
            .select("id")
            .eq("project_id", pid),
        ).length,
        0,
      );
      assert.equal(
        must(
          await client.database
            .from("notifications")
            .select("id")
            .eq("recipient_id", lead.id),
        ).length,
        0,
      );
      const denied = await client.database.rpc("match_breakdown", {
        p_user: member.id,
        p_project: pid,
        p_role: r1,
      });
      assert(denied.error);
    },
  );
  const messageId = randomUUID();
  await check(
    "team chat persists, edits, soft-deletes and rejects unauthorized edits",
    async () => {
      await ws(member.client, {
        action: "message",
        id: messageId,
        body: "<b>plain text</b>",
      });
      await ws(member.client, {
        action: "message",
        id: messageId,
        body: "<b>plain text</b>",
      });
      const messages = await call(invitee.client, w + "?resource=messages");
      assert.equal(
        messages.data.filter((m: any) => m.id === messageId).length,
        1,
      );
      await blocked(invitee.client, w, {
        action: "edit_message",
        id: messageId,
        body: "not mine",
      });
      await ws(member.client, {
        action: "edit_message",
        id: messageId,
        body: "Edited safely",
      });
      await ws(member.client, { action: "delete_message", id: messageId });
      assert(
        (await call(member.client, w + "?resource=messages")).data.find(
          (m: any) => m.id === messageId,
        ).deleted_at,
      );
      await ws(member.client, {
        action: "read_chat",
        seen_at: messages.data.find((m: any) => m.id === messageId).created_at,
      });
    },
  );
  const ticketId = randomUUID();
  await check(
    "private messages exclude the lead; updates and tickets notify participants",
    async () => {
      const id = randomUUID(),
        thread = [member.id, invitee.id].sort().join(",");
      await ws(member.client, {
        action: "message",
        id,
        body: "Private",
        recipients: [invitee.id],
      });
      for (const [viewer, expected] of [
        [lead, false],
        [member, true],
        [invitee, true],
      ] as const) {
        const result = await call(
          viewer.client,
          w + "?resource=messages&thread=" + thread,
        );
        assert.equal(
          result.data.some((m: any) => m.id === id),
          expected,
        );
        const { client } = await login(viewer.email, viewer.password);
        assert.equal(
          must(
            await client.database
              .from("project_messages")
              .select("id")
              .eq("id", id),
          ).length,
          expected ? 1 : 0,
        );
      }
      const update = {
        action: "post_update",
        id: randomUUID(),
        body: "Verification complete",
      };
      await ws(member.client, update);
      await ws(member.client, update);
      await notify(invitee.client, "update.posted");
      await ws(member.client, {
        action: "ticket",
        id: ticketId,
        type: "Issue",
        title: "Review",
        description: "Review the work",
        assignee_id: invitee.id,
        priority: "high",
      });
      await notify(lead.client, "ticket.created");
      await notify(invitee.client, "ticket.created");
      await ws(lead.client, {
        action: "ticket_status",
        id: ticketId,
        status: "in_progress",
      });
      await notify(member.client, "ticket.status");
    },
  );
  await check(
    "removal revokes access, preserves chat, unassigns tickets and frees role slots",
    async () => {
      await ws(lead.client, {
        action: "remove",
        user_id: invitee.id,
        note: "Live remove verification",
      });
      await notify(invitee.client, "member.remove");
      await blocked(invitee.client, w, undefined, 403);
      const tickets = await call(member.client, w + "?resource=tickets");
      assert.equal(
        tickets.data.find((t: any) => t.id === ticketId).assignee_id,
        null,
      );
      assert(
        (await call(member.client, w + "?resource=messages")).data.some(
          (m: any) => m.id === messageId,
        ),
      );
      assert.equal(
        must(
          await admin.database
            .from("project_roles")
            .select("filled_count")
            .eq("id", r2)
            .single(),
        ).filled_count,
        0,
      );
      const { client } = await login(invitee.email, invitee.password);
      assert.equal(
        must(
          await client.database
            .from("project_messages")
            .select("id")
            .eq("project_id", pid),
        ).length,
        0,
      );
    },
  );
  await check(
    "role reassignment and concurrent approvals cannot overfill slots",
    async () => {
      await ws(lead.client, {
        action: "reassign",
        user_id: member.id,
        role_id: r2,
      });
      await ws(lead.client, {
        action: "reassign",
        user_id: member.id,
        role_id: r1,
      });
      const reapply = await act(invitee.client, {
        action: "apply",
        project_id: pid,
        role_id: r2,
      });
      const outcomes = await Promise.all(
        [racePending.id, reapply.id].map((id) =>
          lead.client.post("/api/actions", {
            data: {
              action: "respond",
              id,
              kind: "application",
              decision: "approved",
            },
          }),
        ),
      );
      assert.equal(outcomes.filter((r) => r.status() === 200).length, 1);
      assert.equal(
        must(
          await admin.database
            .from("project_roles")
            .select("filled_count")
            .eq("id", r2)
            .single(),
        ).filled_count,
        1,
      );
      const winner = outcomes[0].status() === 200 ? pending : invitee;
      await ws(winner.client, {
        action: "leave",
        note: "Live leave verification",
      });
      await notify(lead.client, "member.leave");
      await blocked(winner.client, w, undefined, 403);
      assert.equal(
        must(
          await admin.database
            .from("project_roles")
            .select("filled_count")
            .eq("id", r2)
            .single(),
        ).filled_count,
        0,
      );
    },
  );
  await check(
    "owner Under the Hood exposes snapshots without applicant raw vectors",
    async () => {
      const data = await call(
        lead.client,
        `/api/projects/${pid}/similarity?role=${r1}`,
      );
      assert.equal(data.mode, "owner");
      assert(!("profile" in data) && !("target" in data));
      assert(data.applicants.some((a: any) => a.id === application.id));
    },
  );
  await check(
    "ownership transfer requires recipient consent and changes permissions",
    async () => {
      const transfer = await ws(lead.client, {
        action: "transfer",
        user_id: member.id,
      });
      report.ids.transfer = transfer.id;
      assert.equal((await call(lead.client, w)).project.owner_id, lead.id);
      await blocked(
        outside.client,
        w,
        { action: "transfer_reply", id: transfer.id, accept: true },
        403,
      );
      await ws(member.client, {
        action: "transfer_reply",
        id: transfer.id,
        accept: true,
      });
      assert.equal((await call(member.client, w)).project.owner_id, member.id);
      await blocked(lead.client, w, { action: "status", status: "completed" });
    },
  );
  await check(
    "completion resolves pending records and makes workspace read-only",
    async () => {
      await ws(member.client, { action: "status", status: "completed" });
      assert.equal(
        must(
          await admin.database
            .from("applications")
            .select("id")
            .eq("project_id", pid)
            .eq("status", "pending"),
        ).length,
        0,
      );
      await blocked(lead.client, w, {
        action: "message",
        id: randomUUID(),
        body: "read only",
      });
      await blocked(member.client, w, {
        action: "post_update",
        id: randomUUID(),
        body: "closed",
      });
      await call(lead.client, w + "?resource=messages");
      await blocked(member.client, w, { action: "status", status: "open" });
      await ws(member.client, { action: "status", status: "archived" });
    },
  );
} catch (e) {
  fatal = e;
  report.error = (e as Error).message.slice(0, 1500);
  console.error("Live API verification stopped: " + report.error);
} finally {
  for (const client of clients) await client.dispose();
  try {
    report.cleanup = await cleanupTestRecords(registry, persist);
    console.log(
      "PASS exact-ID foreign-key-order cleanup, including auth accounts",
    );
  } catch (e) {
    report.cleanup = { status: "failed", error: (e as Error).message };
    fatal ??= e;
    console.error("CLEANUP FAILED: " + (e as Error).message);
  }
  persist();
}
if (fatal) process.exitCode = 1;
console.log(
  `${report.checks.filter((c) => c.status === "passed").length} real API check groups passed; ${report.checks.filter((c) => c.status === "failed").length} failed.`,
);
