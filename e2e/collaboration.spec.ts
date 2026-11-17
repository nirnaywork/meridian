import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { admin, must, createTestUser } from "../scripts/lib";
import {
  cleanupTestRecords,
  type TestRegistry,
} from "../scripts/cleanup-test-records";
import { signIn } from "./session";
import { EMBEDDING_VERSIONS } from "../src/lib/matching/identity";

// Real Next route handlers, cookie sessions, InsForge PostgreSQL and RLS.
// No intercepted API responses or local database bridge remain.
test.describe.configure({ mode: "serial" });
let lead: Awaited<ReturnType<typeof createTestUser>>,
  member: typeof lead,
  third: typeof lead;
const pid = randomUUID(),
  rid = randomUUID(),
  registry: TestRegistry = { users: [], projects: [] };
const persist = () =>
  writeFileSync(
    ".cache/collaboration-browser-registry.json",
    JSON.stringify(registry, null, 2),
  );
test.beforeAll(async () => {
  test.setTimeout(90000);
  const stamp = randomUUID();
  lead = await createTestUser(
    "Workspace Lead",
    `workspace-lead-${stamp}@example.test`,
  );
  registry.users.push({ id: lead.id, email: lead.email });
  persist();
  member = await createTestUser(
    "Workspace Member",
    `workspace-member-${stamp}@example.test`,
  );
  registry.users.push({ id: member.id, email: member.email });
  persist();
  third = await createTestUser(
    "Dashboard Peer",
    `dashboard-peer-${stamp}@example.test`,
  );
  registry.users.push({ id: third.id, email: third.email });
  persist();
  for (const [who, isLead] of [
    [lead, true],
    [member, false],
    [third, false],
  ] as const)
    must(
      await admin.database.from("profiles").insert([
        {
          id: who.id,
          display_name: isLead
            ? "Workspace Lead"
            : who.id === third.id
              ? "Dashboard Peer"
              : "Workspace Member",
          headline: "Collaboration browser test",
          onboarding_complete: true,
          is_member: true,
          is_team_lead: isLead,
          is_demo: true,
        },
      ]),
    );
  must(
    await admin.database.from("projects").insert([
      {
        id: pid,
        owner_id: lead.id,
        title: "Collaboration browser test",
        description:
          "An isolated runtime browser fixture removed after testing.",
        category: "Testing",
        commitment: "casual",
        duration: "2 weeks",
        team_size: 4,
      },
    ]),
  );
  registry.projects.push(pid);
  persist();
  must(
    await admin.database
      .from("project_roles")
      .insert([{ id: rid, project_id: pid, title: "Builder", slots: 2 }]),
  );
  must(await admin.database.rpc("add_member", { pid, uid: member.id, rid }));
  must(
    await admin.database.rpc("notify_user", {
      recipient: lead.id,
      actor: member.id,
      pid,
      event: "test",
      heading: "Welcome to your team",
      content: "Open your workspace",
      destination: `/projects/${pid}/workspace`,
      dedupe: "browser-welcome:" + pid,
    }),
  );
});
test.afterAll(async () => {
  let cleanup: unknown;
  try {
    cleanup = await cleanupTestRecords(registry, persist);
  } catch (e) {
    cleanup = { status: "failed", error: (e as Error).message };
    throw e;
  } finally {
    persist();
    const path = "docs/dashboard-browser-cleanup.json";
    const previous = existsSync(path)
      ? JSON.parse(readFileSync(path, "utf8"))
      : [];
    writeFileSync(
      path,
      JSON.stringify(
        [
          ...previous,
          {
            user_ids: registry.users.map((u) => u.id),
            project_ids: registry.projects,
            mode: "real-api",
            cleanup,
          },
        ],
        null,
        2,
      ),
    );
  }
});
async function connect(page: Page, who: typeof lead) {
  await signIn(page, who);
}

test("notification bell reads an event and marks it read", async ({ page }) => {
  await connect(page, lead);
  await page.goto("/notifications");
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Notifications, .*unread/ }).click();
  await expect(
    page.getByRole("region", { name: "Recent notifications" }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: "Recent notifications" })
    .getByRole("button", { name: /Welcome to your team/ })
    .click();
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}/workspace`));
  expect(
    must(
      await admin.database
        .from("notifications")
        .select("read_at")
        .eq("event_key", "browser-welcome:" + pid)
        .single(),
    ).read_at,
  ).toBeTruthy();
});
test("lead can browse all applicants, switch talent roles, and see the active team", async ({
  page,
  browser,
}) => {
  const emptyRole = randomUUID();
  must(
    await admin.database.from("project_roles").insert([
      { id: emptyRole, project_id: pid, title: "Designer", slots: 1 },
    ]),
  );
  const embedding = {
    embedding: JSON.stringify([1, ...Array(383).fill(0)]),
    source_hash: "test-lead-tabs",
    model: "minilm",
    version: EMBEDDING_VERSIONS.minilm,
  };
  must(
    await admin.database
      .from("profile_embeddings")
      .insert([{ ...embedding, profile_id: third.id }]),
  );
  must(
    await admin.database
      .from("role_embeddings")
      .insert([{ ...embedding, role_id: rid }]),
  );

  const applicant = await browser.newPage();
  try {
    await connect(applicant, third);
    for (const role_id of [rid, null]) {
      const response = await applicant.request.post("/api/actions", {
        headers: { Origin: new URL(applicant.url()).origin },
        data: { action: "apply", project_id: pid, role_id },
      });
      expect(response.ok(), await response.text()).toBe(true);
    }
  } finally {
    await applicant.close();
  }

  await connect(page, lead);
  await page.goto(`/projects/${pid}`);
  const panel = page.locator(".lead-workspace");
  const applicants = panel.getByRole("combobox", { name: "Role", exact: true });
  const applicationCards = panel.locator(".record-card");
  await expect(applicants).toHaveValue("");
  await expect(applicationCards).toHaveCount(2);
  await expect(applicationCards.filter({ hasText: "Whole project" })).toBeVisible();
  await applicants.selectOption(rid);
  await expect(applicationCards).toHaveCount(1);
  await expect(applicationCards.first()).toContainText("Builder");
  await applicants.selectOption(emptyRole);
  await expect(panel.getByText("No applications for this role yet.")).toBeVisible();
  await applicants.selectOption("");
  await expect(applicationCards).toHaveCount(2);

  const talentResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/data/talent",
  );
  await panel.getByRole("button", { name: "Find talent" }).click();
  const response = await talentResponse;
  expect(response.ok(), await response.text()).toBe(true);
  expect(new URL(response.url()).searchParams.get("role")).toBe(rid);
  const talentRole = panel.getByRole("combobox", { name: "Find people for" });
  await expect(talentRole).toHaveValue(rid);
  await expect(panel.getByRole("link", { name: "Dashboard Peer" })).toBeVisible();
  await talentRole.selectOption(emptyRole);
  await expect(panel.getByText("Your people are on their way.")).toBeVisible();
  await panel.getByRole("button", { name: "Applicants" }).click();
  await expect(applicants).toHaveValue("");
  await expect(applicationCards).toHaveCount(2);
  await panel.getByRole("button", { name: "Find talent" }).click();
  await expect(talentRole).toHaveValue(emptyRole);
  await expect(panel.getByText("Your people are on their way.")).toBeVisible();

  await panel.getByRole("button", { name: "Your team" }).click();
  await expect(panel.getByRole("link", { name: "Workspace Lead" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Workspace Member" })).toBeVisible();
  await expect(panel.getByRole("link", { name: "Dashboard Peer" })).toHaveCount(0);
  await expect(panel.locator(".capacity").filter({ hasText: "Builder" })).toContainText("1/2");
});
test("publishing opens Overview and a lone lead cannot start; approval opens dashboard access", async ({
  page,
  browser,
}) => {
  await connect(page, lead);
  await page.goto("/projects/new");
  await page.getByLabel("Project name").fill("Dashboard browser verification");
  await page
    .getByLabel("What are you building?")
    .fill(
      "A temporary verified student collaboration project for the dashboard workflow.",
    );
  await page
    .getByRole("checkbox", { name: "Web Development", exact: true })
    .check();
  await page.getByRole("button", { name: "Build your team" }).click();
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/data/project") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Publish project" }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  const project = (await response.json()).id;
  registry.projects.push(project);
  persist();
  await expect(page).toHaveURL(new RegExp(project + "/workspace"));
  await expect(
    page.getByRole("button", { name: "Start project" }),
  ).toBeDisabled();
  const applicant = await browser.newPage();
  await connect(applicant, member);
  const post = async (p: Page, body: unknown) => {
    const res = await p.request.post("/api/actions", {
      data: body,
      headers: { Origin: new URL(p.url()).origin },
    });
    expect(res.ok(), await res.text()).toBe(true);
    return res.json();
  };
  const app = await post(applicant, {
    action: "apply",
    project_id: project,
    role_id: null,
  });
  await post(page, {
    action: "respond",
    kind: "application",
    id: app.id,
    decision: "approved",
  });
  await applicant.goto("/applications");
  await applicant
    .locator("article")
    .filter({ hasText: "Dashboard browser verification" })
    .getByRole("link", { name: "Team Dashboard" })
    .click();
  await expect(applicant).toHaveURL(new RegExp(project + "/workspace"));
  await applicant.close();
  await page.goto(`/projects/${project}`);
  const panel = page.locator(".lead-workspace");
  await panel.getByRole("button", { name: "Your team" }).click();
  await expect(panel.getByRole("link", { name: "Workspace Member", exact: true })).toBeVisible();
  await page.goto(`/projects/${project}/workspace`);
  await page.getByRole("button", { name: "Start project" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm" })
    .click();
  await expect(page.getByText(/Team: 2 of 4.*Started/)).toBeVisible();
});
test("chat sends plain text, preserves session, and edits a message", async ({
  page,
}) => {
  await connect(page, member);
  await page.goto(`/projects/${pid}/workspace?tab=chat`);
  await page
    .getByLabel("Message your team")
    .fill("Hello team <b>plain text</b>");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page
      .getByRole("log")
      .getByText("Hello team <b>plain text</b>", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Ready to build");
  await page.getByRole("button", { name: "Save message" }).click();
  await expect(
    page.getByRole("log").getByText("Ready to build", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("log").getByText("Ready to build", { exact: true }),
  ).toBeVisible();
});
test("private and group threads, work updates and tickets", async ({
  page,
  browser,
}) => {
  must(
    await admin.database.rpc("add_member", { pid, uid: third.id, rid: null }),
  );
  await connect(page, member);
  await page.goto(`/projects/${pid}/workspace?tab=chat`);
  await page.getByLabel("Recipients").selectOption([third.id]);
  await page.getByLabel("Message your team").fill("Private progress");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("log").getByText("Private progress"),
  ).toBeVisible();
  await page.getByLabel("Recipients").selectOption([lead.id, third.id]);
  await page.getByLabel("Message your team").fill("Group progress");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const other = await browser.newPage();
  await connect(other, lead);
  await other.goto(`/projects/${pid}/workspace?tab=chat`);
  await other
    .getByRole("navigation", { name: "Conversations" })
    .getByRole("button", { name: /Dashboard Peer/ })
    .click();
  await expect(
    other.getByRole("log").getByText("Group progress"),
  ).toBeVisible();
  await expect(
    other.getByRole("log").getByText("Private progress"),
  ).toHaveCount(0);
  await other.close();
  await page.getByRole("tab", { name: "Updates" }).click();
  await page.getByLabel("Completed work").fill("Wrote tests");
  await page.getByRole("button", { name: "Post update" }).click();
  await expect(page.getByText("Wrote tests", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Tickets" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Improve tests");
  await page.getByLabel("Description").fill("Cover the new workflow");
  await page.getByRole("button", { name: "Raise ticket" }).click();
  await page.getByLabel("Status of Improve tests").selectOption("in_progress");
  await expect(page.getByLabel("Status of Improve tests")).toHaveValue(
    "in_progress",
  );
  must(
    await admin.database.rpc("collaboration_action", {
      actor: third.id,
      pid,
      p_action: { action: "leave" },
    }),
  );
});
test("links start empty, save separately and appear on the signed-in public profile", async ({
  page,
  browser,
}) => {
  await connect(page, member);
  await page.goto("/profile");
  const section = page.locator("#profile-links");
  await expect(section.getByLabel("GitHub", { exact: true })).toHaveValue("");
  await section
    .getByLabel("GitHub", { exact: true })
    .fill("github.com/meridian-browser-test");
  await section.getByLabel("Profile visibility").selectOption("public");
  await section
    .getByRole("button", { name: "Save links & visibility" })
    .click();
  await expect(
    page.getByRole("status").getByText("Links and visibility saved"),
  ).toBeVisible();
  const other = await browser.newPage();
  await connect(other, lead);
  await other.goto(`/u/${member.id}`);
  await expect(other.getByRole("link", { name: /GitHub/ })).toHaveAttribute(
    "href",
    "https://github.com/meridian-browser-test",
  );
  await expect(
    other.getByRole("button", { name: "Under the Hood", exact: true }),
  ).toHaveCount(0);
  await other.close();
});
test("member leaves, loses access, can rejoin, and lead removal frees the slot", async ({
  page,
}) => {
  await connect(page, member);
  await page.goto(`/projects/${pid}/workspace`);
  await page.getByRole("button", { name: "Leave team", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByLabel("Optional note")
    .fill("Taking a break");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/projects/${pid}$`));
  await page.goto(`/projects/${pid}/workspace`);
  await expect(
    page.getByText(
      "Only the lead and active team members can enter this workspace.",
      { exact: true },
    ),
  ).toBeVisible();
  must(await admin.database.rpc("add_member", { pid, uid: member.id, rid }));
  await connect(page, lead);
  await page.goto(`/projects/${pid}/workspace`);
  await page
    .locator(".team-member-row")
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page
      .locator(".team-member-row")
      .getByRole("button", { name: "Remove", exact: true }),
  ).toHaveCount(0);
  expect(
    must(
      await admin.database
        .from("project_roles")
        .select("filled_count")
        .eq("id", rid)
        .single(),
    ).filled_count,
  ).toBe(0);
});
test("completion preserves history and makes chat and tickets read-only", async ({
  page,
}) => {
  await connect(page, lead);
  await page.goto(`/projects/${pid}/workspace`);
  await page.getByLabel("Project status").selectOption("completed");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await page.getByRole("tab", { name: /Chat/ }).click();
  await expect(page.getByLabel("Message your team")).toBeDisabled();
  await expect(
    page.getByRole("log").getByText("Ready to build", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Tickets", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Raise ticket" }),
  ).toBeDisabled();
});
