import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { admin, must, createTestUser, login } from "./lib";
import { hashedProvider, prepareEmbedding } from "../src/lib/matching/provider";
import { canonicalProfile } from "../src/lib/matching/canonical";
const origin = process.env.TEST_APP_URL ?? "http://localhost:3000";
const run = Date.now().toString(36);
const results: string[] = [];
const ok = (s: string) => {
  results.push(s);
  console.log("PASS " + s);
};
const vec = (cos: number) => [
  cos,
  Math.sqrt(1 - cos * cos),
  ...Array(382).fill(0),
];
async function main() {
  const users = [];
  for (const name of ["Lead", "Strong", "Moderate", "Weak", "Racer"])
    users.push(
      await createTestUser(
        "QA " + name,
        `qa-${run}-${name.toLowerCase()}@meridian.example`,
      ),
    );
  const [lead, strong, moderate, weak, racer] = users;
  const skills = must(
    await admin.database
      .from("skills")
      .select("id,name")
      .in("name", ["React", "TypeScript", "CSS", "Figma"]),
  );
  const ids = (names: string[]) =>
    names.map((name) => ({
      ...skills.find((s) => s.name === name)!,
      proficiency: "advanced",
    }));
  const body = (name: string, names: string[]) => ({
    display_name: name,
    headline: "Student building projects",
    bio: "Integration fixture",
    university: "QA",
    interests: "Web",
    avatar_url: null,
    avatar_key: null,
    is_member: true,
    is_team_lead: true,
    skills: ids(names),
  });
  for (const u of users) {
    const b = body(
      u.email,
      u === weak ? ["Figma"] : ["React", "TypeScript", "CSS"],
    );
    const v = await prepareEmbedding(canonicalProfile(b), hashedProvider);
    must(
      await admin.database.rpc("save_profile", {
        actor: u.id,
        body: b,
        vec: v,
        expected_revision: 0,
      }),
    );
  }
  const sign = await fetch(origin + "/api/auth/sign-in", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify({ email: strong.email, password: strong.password }),
  });
  assert.equal(sign.status, 200, await sign.clone().text());
  const cookie = sign.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  assert.match(cookie, /insforge_access_token/);
  assert.ok(
    sign.headers
      .getSetCookie()
      .some(
        (s) => s.startsWith("insforge_refresh_token=") && /httponly/i.test(s),
      ),
  );
  ok("Email/password sign-in sets access and httpOnly refresh cookies");
  const me = await fetch(origin + "/api/data/profile", {
    headers: { Cookie: cookie },
  });
  assert.equal(me.status, 200, await me.clone().text());
  const profile = await me.json();
  assert.equal(profile.id, strong.id);
  ok("Protected profile API resolves the signed-in user");
  const before = must(
    await admin.database
      .from("profile_embeddings")
      .select("source_hash,updated_at")
      .eq("profile_id", strong.id)
      .single(),
  );
  const save = await fetch(origin + "/api/data/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie,
    },
    body: JSON.stringify({ ...profile, display_name: "QA renamed" }),
  });
  assert.equal(save.status, 200, await save.clone().text());
  const after = must(
    await admin.database
      .from("profile_embeddings")
      .select("source_hash,updated_at")
      .eq("profile_id", strong.id)
      .single(),
  );
  assert.deepEqual(after, before);
  ok("Cosmetic profile save preserves hash and embedding timestamp");
  const cross = await fetch(origin + "/api/data/profile", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://attacker.example",
      Cookie: cookie,
    },
    body: JSON.stringify(profile),
  });
  assert.equal(cross.status, 403);
  ok("Cross-origin mutation rejected");
  const appPost = async (
    path: string,
    value: unknown,
    sessionCookie = cookie,
  ) =>
    fetch(origin + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: sessionCookie,
      },
      body: JSON.stringify(value),
    });
  let current = await (
    await fetch(origin + "/api/data/profile", { headers: { Cookie: cookie } })
  ).json();
  let draft = await appPost("/api/data/profile", {
    ...current,
    onboarding_complete: false,
  });
  assert.equal(draft.status, 200, await draft.clone().text());
  assert.equal(
    (await fetch(origin + "/api/data/feed", { headers: { Cookie: cookie } }))
      .status,
    428,
  );
  current = await (
    await fetch(origin + "/api/data/profile", { headers: { Cookie: cookie } })
  ).json();
  draft = await appPost("/api/data/profile", {
    ...current,
    onboarding_complete: true,
  });
  assert.equal(draft.status, 200);
  assert.equal(
    (await fetch(origin + "/api/data/feed", { headers: { Cookie: cookie } }))
      .status,
    200,
  );
  ok(
    "Incomplete intent step cannot reach feed; completing onboarding unlocks it",
  );
  const leadSign = await appPost(
    "/api/auth/sign-in",
    { email: lead.email, password: lead.password },
    "",
  );
  assert.equal(leadSign.status, 200);
  const leadCookie = leadSign.headers
    .getSetCookie()
    .map((s) => s.split(";")[0])
    .join("; ");
  const httpProject = {
    title: "QA HTTP project " + run,
    description:
      "Build an accessible student website with React, CSS and TypeScript.",
    category: "Web",
    tags: [],
    commitment: "casual",
    duration: "4 weeks",
    team_size: 2,
    status: "open",
    auto_approve_strong_matches: false,
    revision: 0,
    roles: [
      {
        title: "Web Developer",
        description: "Build the frontend",
        slots: 1,
        skills: ids(["React", "TypeScript", "CSS"]).map((s) => ({
          ...s,
          importance: "required",
        })),
      },
    ],
  };
  const createProject = await appPost(
    "/api/data/project",
    httpProject,
    leadCookie,
  );
  assert.equal(createProject.status, 200, await createProject.clone().text());
  const httpPid = (await createProject.json()).id;
  const detail = await (
    await fetch(origin + "/api/data/project?id=" + httpPid, {
      headers: { Cookie: leadCookie },
    })
  ).json();
  assert.equal(detail.roles.length, 1);
  const oldVector = must(
    await admin.database
      .from("project_embeddings")
      .select("source_hash,updated_at")
      .eq("project_id", httpPid)
      .single(),
  );
  const cosmetic = await appPost(
    "/api/data/project",
    { ...detail, status: "closed" },
    leadCookie,
  );
  assert.equal(cosmetic.status, 200, await cosmetic.clone().text());
  assert.deepEqual(
    must(
      await admin.database
        .from("project_embeddings")
        .select("source_hash,updated_at")
        .eq("project_id", httpPid)
        .single(),
    ),
    oldVector,
  );
  ok(
    "Project HTTP create/edit works and status changes do not regenerate embeddings",
  );
  const forgedProject = await appPost("/api/data/project", {
    ...detail,
    status: "open",
  });
  assert.equal(forgedProject.status, 403);
  ok("Project server endpoint rejects non-owner edits");
  const pid = crypto.randomUUID(),
    rid = crypto.randomUUID();
  const role = {
    id: rid,
    title: "Frontend Developer",
    description: "Build the UI",
    slots: 1,
    skills: ids(["React", "TypeScript", "CSS"]).map((s) => ({
      ...s,
      importance: "required",
    })),
    vector: {
      embedding: vec(1),
      source_hash: "fixture-role",
      model: hashedProvider.name,
      version: hashedProvider.version,
    },
  };
  const project = {
    id: pid,
    title: "QA transaction fixture " + run,
    description:
      "A temporary project for integration checks, closed after verification.",
    category: "Web",
    tags: [],
    commitment: "casual",
    duration: "1 week",
    team_size: 3,
    status: "open",
    auto_approve_strong_matches: true,
    roles: [role],
  };
  must(
    await admin.database.rpc("save_project", {
      actor: lead.id,
      body: project,
      vec: {
        embedding: vec(1),
        source_hash: "fixture-project",
        model: hashedProvider.name,
        version: hashedProvider.version,
      },
      expected_revision: 0,
    }),
  );
  for (const [u, c] of [
    [strong, 1],
    [moderate, 0.35],
    [weak, 0],
    [racer, 1],
  ] as const)
    must(
      await admin.database
        .from("profile_embeddings")
        .update({ embedding: vec(c) })
        .eq("profile_id", u.id),
    );
  const weakResult = must(
    await admin.database.rpc("submit_match", {
      actor: weak.id,
      pid,
      rid,
      kind: "apply",
      target: null,
      note: "",
    }),
  );
  assert.equal(weakResult.blocked, true);
  assert.equal(
    must(
      await admin.database
        .from("applications")
        .select("id")
        .eq("project_id", pid),
    ).length,
    0,
  );
  ok("Weak application blocked without inserting a pending record");
  const mod = must(
    await admin.database.rpc("submit_match", {
      actor: moderate.id,
      pid,
      rid,
      kind: "apply",
      target: null,
      note: "Hello",
    }),
  );
  assert.equal(mod.status, "pending");
  assert.equal(mod.breakdown.band, "MODERATE");
  ok("Moderate application saved pending with server breakdown");
  const race = await Promise.all(
    [strong, racer].map((u) =>
      admin.database.rpc("submit_match", {
        actor: u.id,
        pid,
        rid,
        kind: "apply",
        target: null,
        note: "",
      }),
    ),
  );
  race.forEach(must);
  assert.deepEqual(race.map((x) => x.data.status).sort(), [
    "approved",
    "pending",
  ]);
  assert.equal(
    must(
      await admin.database
        .from("project_members")
        .select("user_id")
        .eq("project_id", pid),
    ).length,
    1,
  );
  assert.equal(
    must(
      await admin.database
        .from("project_roles")
        .select("filled_count")
        .eq("id", rid)
        .single(),
    ).filled_count,
    1,
  );
  ok("Concurrent strong applications cannot overfill a one-slot role");
  const approve = await admin.database.rpc("respond_match", {
    actor: lead.id,
    record_id: mod.id,
    kind: "application",
    decision: "approved",
  });
  assert.ok(approve.error);
  ok("Manual approval also enforces role capacity");
  const duplicate = await admin.database.rpc("submit_match", {
    actor: moderate.id,
    pid,
    rid,
    kind: "apply",
    target: null,
    note: "",
  });
  assert.ok(duplicate.error);
  ok("Duplicate pending application rejected");
  const other = await admin.database.rpc("respond_match", {
    actor: weak.id,
    record_id: mod.id,
    kind: "application",
    decision: "rejected",
  });
  assert.ok(other.error);
  ok("Other members cannot decide applications");
  const auth = await login(moderate.email, moderate.password);
  const forged = await auth.client.database.rpc("submit_match", {
    actor: lead.id,
    pid,
    rid,
    kind: "apply",
    target: null,
    note: "",
  });
  assert.ok(forged.error);
  const vectorWrite = await auth.client.database
    .from("profile_embeddings")
    .update({ model: "forged" })
    .eq("profile_id", moderate.id);
  assert.ok(vectorWrite.error);
  const directApplication = await auth.client.database
    .from("applications")
    .update({ status: "approved" })
    .eq("id", mod.id);
  assert.ok(directApplication.error);
  ok(
    "User credentials cannot invoke service RPCs, write vectors, or forge approvals",
  );
  const unrelated = await login(weak.email, weak.password);
  assert.equal(
    must(
      await unrelated.client.database
        .from("applications")
        .select("id")
        .eq("project_id", pid),
    ).length,
    0,
  );
  ok("RLS hides other members’ applications");
  const invite = must(
    await admin.database.rpc("submit_match", {
      actor: lead.id,
      pid,
      rid,
      kind: "invite",
      target: moderate.id,
      note: "Join us",
    }),
  );
  assert.equal(invite.status, "pending");
  assert.equal(
    must(
      await admin.database
        .from("project_members")
        .select("user_id")
        .eq("user_id", moderate.id),
    ).length,
    0,
  );
  const acceptFull = await admin.database.rpc("respond_match", {
    actor: moderate.id,
    record_id: invite.id,
    kind: "invitation",
    decision: "accepted",
  });
  assert.ok(acceptFull.error);
  ok("Invitations never force membership; acceptance enforces capacity");
  must(
    await admin.database
      .from("project_roles")
      .update({ slots: 2 })
      .eq("id", rid),
  );
  const accept = must(
    await admin.database.rpc("respond_match", {
      actor: moderate.id,
      record_id: invite.id,
      kind: "invitation",
      decision: "accepted",
    }),
  );
  assert.equal(accept.status, "accepted");
  assert.equal(
    must(
      await admin.database
        .from("project_members")
        .select("user_id")
        .eq("project_id", pid),
    ).length,
    2,
  );
  ok("Member acceptance adds exactly one team membership");
  const memberAgain = await admin.database.rpc("respond_match", {
    actor: moderate.id,
    record_id: invite.id,
    kind: "invitation",
    decision: "accepted",
  });
  assert.ok(memberAgain.error);
  ok("Repeated acceptance rejected");
  const feed = must(
    await auth.client.database.rpc("match_projects_for_user", {
      p_user: moderate.id,
      p_limit: 4,
    }),
  );
  assert.equal(feed.length, 4);
  const last = feed.at(-1);
  const next = must(
    await auth.client.database.rpc("match_projects_for_user", {
      p_user: moderate.id,
      p_limit: 4,
      p_cursor: { id: last.id, score: last.breakdown.final_score },
    }),
  );
  assert.ok(next.every((p: any) => !feed.some((f: any) => f.id === p.id)));
  ok("Ranked feed uses stable score/ID cursor pagination");
  const mismatched = await auth.client.database.rpc("match_projects_for_user", {
    p_user: weak.id,
    p_limit: 2,
  });
  assert.ok(mismatched.error);
  must(
    await admin.database
      .from("profile_embeddings")
      .update({ version: "incompatible" })
      .eq("profile_id", weak.id),
  );
  assert.equal(
    must(
      await admin.database.rpc("match_breakdown", {
        p_user: weak.id,
        p_project: pid,
        p_role: rid,
      }),
    ),
    null,
  );
  ok("Identity spoofing and cross-version vector comparisons rejected");
  const rolelessId = crypto.randomUUID();
  must(
    await admin.database.rpc("save_project", {
      actor: lead.id,
      body: {
        ...project,
        id: rolelessId,
        title: "QA role-less " + run,
        team_size: 2,
        roles: [],
        auto_approve_strong_matches: false,
      },
      vec: {
        embedding: vec(1),
        source_hash: "roleless",
        model: hashedProvider.name,
        version: hashedProvider.version,
      },
      expected_revision: 0,
    }),
  );
  const noRole = must(
    await admin.database.rpc("submit_match", {
      actor: strong.id,
      pid: rolelessId,
      rid: null,
      kind: "apply",
      target: null,
      note: "",
    }),
  );
  assert.equal(noRole.status, "pending");
  assert.equal(noRole.breakdown.band, "STRONG");
  const noRoleDuplicate = await admin.database.rpc("submit_match", {
    actor: strong.id,
    pid: rolelessId,
    rid: null,
    kind: "apply",
    target: null,
    note: "",
  });
  assert.ok(noRoleDuplicate.error);
  must(
    await admin.database.rpc("respond_match", {
      actor: lead.id,
      record_id: noRole.id,
      kind: "application",
      decision: "approved",
    }),
  );
  const noRoleRacer = must(
    await admin.database.rpc("submit_match", {
      actor: racer.id,
      pid: rolelessId,
      rid: null,
      kind: "apply",
      target: null,
      note: "",
    }),
  );
  assert.ok(
    (
      await admin.database.rpc("respond_match", {
        actor: lead.id,
        record_id: noRoleRacer.id,
        kind: "application",
        decision: "approved",
      })
    ).error,
  );
  ok(
    "Whole-project applications honor auto-approve off, null uniqueness, and overall team capacity",
  );
  const withdrawal = must(
    await admin.database.rpc("respond_match", {
      actor: racer.id,
      record_id: noRoleRacer.id,
      kind: "application",
      decision: "withdrawn",
    }),
  );
  assert.equal(withdrawal.status, "withdrawn");
  ok("Applicants can withdraw their pending applications");
  const unauthorized = await fetch(origin + "/api/data/feed");
  assert.equal(unauthorized.status, 401);
  ok("Unauthenticated API access denied");
  const logout = await fetch(origin + "/api/auth/sign-out", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: cookie,
    },
    body: "{}",
  });
  assert.equal(logout.status, 200);
  assert.ok(
    logout.headers
      .getSetCookie()
      .some((s) => /Max-Age=0|expires=Thu, 01 Jan 1970/i.test(s)),
  );
  ok("Sign-out clears session cookies");
  // Close fixtures and remove them from talent discovery. Keep records for auditing.
  must(
    await admin.database
      .from("projects")
      .update({ status: "closed", is_demo: true })
      .in("id", [pid, httpPid, rolelessId]),
  );
  for (const u of users)
    must(
      await admin.database
        .from("profiles")
        .update({ is_member: false, is_demo: true })
        .eq("id", u.id),
    );
  mkdirSync("docs", { recursive: true });
  writeFileSync(
    "docs/integration-results.json",
    JSON.stringify({ run, checks: results }, null, 2),
  );
  mkdirSync(".cache", { recursive: true });
  writeFileSync(
    ".cache/qa-login.json",
    JSON.stringify({ ...strong, name: "QA renamed" }),
  );
  console.log(
    `${results.length} integration checks passed. Test project closed; test members hidden from talent.`,
  );
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
