import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { admin, must, createTestUser } from "../scripts/lib";
import {
  cleanupTestRecords,
  type TestRegistry,
} from "../scripts/cleanup-test-records";
import { signIn } from "./session";
test.describe.configure({ mode: "serial" });
const registry: TestRegistry = { users: [], projects: [] };
let lead: Awaited<ReturnType<typeof createTestUser>>,
  member: typeof lead,
  peer: typeof lead;
const pid = randomUUID(),
  message = randomUUID(),
  privateMessage = randomUUID();
const persist = () =>
  writeFileSync(
    ".cache/personal-browser-registry.json",
    JSON.stringify(registry, null, 2),
  );
test.beforeAll(async () => {
  test.setTimeout(90000);
  const stamp = randomUUID();
  for (const name of ["Lead", "Member", "Peer"]) {
    const person = await createTestUser(
      "Personal " + name,
      "personal-" + name.toLowerCase() + "-" + stamp + "@example.test",
    );
    registry.users.push({ id: person.id, email: person.email });
    persist();
    if (name === "Lead") lead = person;
    else if (name === "Member") member = person;
    else peer = person;
    must(
      await admin.database
        .from("profiles")
        .insert([
          {
            id: person.id,
            display_name: "Personal " + name,
            onboarding_complete: true,
            is_member: true,
            is_team_lead: name === "Lead",
            is_demo: true,
          },
        ]),
    );
  }
  must(
    await admin.database
      .from("projects")
      .insert([
        {
          id: pid,
          owner_id: lead.id,
          title: "Personal dashboard browser project",
          description: "Temporary dashboard verification",
          category: "Web",
          commitment: "casual",
          duration: "1 week",
          team_size: 4,
        },
      ]),
  );
  registry.projects.push(pid);
  persist();
  for (const uid of [member.id, peer.id])
    must(await admin.database.rpc("add_member", { pid, uid, rid: null }));
  must(
    await admin.database.rpc("collaboration_action", {
      actor: lead.id,
      pid,
      p_action: {
        action: "message",
        id: message,
        body: "A team message for your day",
      },
    }),
  );
  must(
    await admin.database.rpc("collaboration_action", {
      actor: member.id,
      pid,
      p_action: {
        action: "message",
        id: privateMessage,
        body: "A private dashboard message",
        recipients: [peer.id],
      },
    }),
  );
  must(await admin.database.rpc('collaboration_action',{actor:lead.id,pid,p_action:{action:'post_update',id:randomUUID(),body:'A work update for notification verification'}}));
});
test.afterAll(async () => {
  try {
    const cleanup = await cleanupTestRecords(registry, persist);
    const stats = JSON.parse(
      readFileSync("docs/personal-browser-cleanup.json", "utf8") || "[]",
    );
    stats.push({
      users: registry.users.map((u) => u.id),
      projects: registry.projects,
      cleanup,
    });
    writeFileSync(
      "docs/personal-browser-cleanup.json",
      JSON.stringify(stats, null, 2),
    );
  } finally {
    persist();
  }
});
async function post(page: Page, path: string, input: unknown) {
  const r = await page.request.post(path, {
    data: input,
    headers: { Origin: new URL(page.url()).origin },
  });
  expect(r.ok(), await r.text()).toBe(true);
  return r.json();
}
test("personal dashboard, exact private conversation links and DND survive refresh", async ({
  page,
  browser,
}) => {
  await signIn(page, member);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /Good .*Personal/ }),
  ).toBeVisible();
  const feed = page.getByRole("region", { name: "Recent messages" });
  await expect(feed.getByText("A private dashboard message")).toBeVisible();
  await expect(page.getByRole('region',{name:'Focus timer'})).toBeVisible();
  await page.screenshot({path:'.cache/personal-desktop.png',fullPage:true});
  await feed
    .getByRole("link")
    .filter({ hasText: "A private dashboard message" })
    .click();
  await expect(page).toHaveURL(/thread=/);
  await expect(page.locator("#chat-message-" + privateMessage)).toBeVisible();
  await page.goto("/dashboard");
  await expect(
    page.getByRole("button", { name: /Notifications, .*unread/ }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Do not disturb" }).click();
  await expect(
    page.getByRole("heading", { name: "Do not disturb is on" }),
  ).toBeVisible();
  await expect(feed).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Notifications, Do not disturb is on" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Do not disturb" }),
  ).toHaveAttribute("aria-checked", "true");
  const second = await browser.newPage();
  await signIn(second, member);
  await second.goto("/dashboard");
  await expect(
    second.getByRole("heading", { name: "Do not disturb is on" }),
  ).toBeVisible();
  await second.close();
  await page.getByRole("switch", { name: "Do not disturb" }).click();
  await expect(feed.getByText("A private dashboard message")).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await page.getByRole('button',{name:'Use dark theme'}).click();
  await page.getByRole('button',{name:'Toggle navigation'}).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await expect.poll(()=>page.locator('.sidebar').evaluate(e=>e.getBoundingClientRect().right)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'.cache/personal-mobile-dark.png',fullPage:true});
});
test("daily notes carry forward, can be checked and remain owner-private", async ({
  page,
  browser,
}) => {
  await signIn(page, member);
  await page.goto("/dashboard");
  const notes = page.getByRole("region", { name: "Daily notes" });
  await notes.getByLabel("Note text").fill("Remember <b>plain text</b>");
  await notes.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    notes.getByText("Remember <b>plain text</b>", { exact: true }),
  ).toBeVisible();
  await notes
    .getByRole("checkbox", {
      name: "Complete note: Remember <b>plain text</b>",
    })
    .check();
  await expect(notes.getByRole("checkbox")).toBeChecked();
  await expect(notes.getByRole('button',{name:'Add note',exact:true})).toBeEnabled();
  await page.reload();
  await expect(notes.getByRole("checkbox")).toBeChecked();
  const today = new Date(),
    yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const day = [
    yesterday.getFullYear(),
    String(yesterday.getMonth() + 1).padStart(2, "0"),
    String(yesterday.getDate()).padStart(2, "0"),
  ].join("-");
  await post(page, "/api/dashboard", {
    action: "note",
    id: randomUUID(),
    day,
    body: "Carry me forward",
  });
  await page.reload();
  await expect(
    notes.getByText("Carry me forward", { exact: true }),
  ).toBeVisible();
  const other=await browser.newPage();
  await signIn(other, lead);
  await other.goto("/dashboard");
  await expect(other.getByText("Carry me forward", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    other.getByText("A private dashboard message", { exact: true }),
  ).toHaveCount(0);
  await other.close();
});
test("Pomodoro uses persisted timestamps and records one completion", async ({
  page,
}) => {
  await signIn(page, member);
  await page.goto("/dashboard");
  await page.getByText("Timer settings", { exact: true }).click();
  await page.getByLabel("focus minutes", { exact: true }).fill("1");
  await page.getByRole("button", { name: "Save durations" }).click();
  await expect(page.getByRole('status').filter({hasText:'Timer settings saved'})).toBeVisible();
  await expect
    .poll(async () => {
      const r = await page.request.get("/api/dashboard/preferences");
      return (await r.json()).settings.focus;
    })
    .toBe(1);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page.getByLabel("Time remaining")).toHaveText("01:00");
  await page.clock.install({ time: new Date() });
  await page.getByRole("button", { name: "Start timer" }).click();
  await expect(page).toHaveTitle(/01:00.*focus/);
  await page.clock.fastForward(30000);
  await page.getByRole("button", { name: "Pause timer" }).click();
  await expect(page.getByLabel("Time remaining")).toHaveText(/00:(2[5-9]|30)/);
  const paused=await page.getByLabel('Time remaining').textContent();
  await page.reload();
  await expect(page.getByLabel("Time remaining")).toHaveText(paused!);
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.clock.fastForward(31000);
  await expect(page.getByText(/Short break · 1/)).toBeVisible();
  await expect
    .poll(
      async () =>
        must(
          await admin.database
            .from("focus_sessions")
            .select("id")
            .eq("user_id", member.id),
        ).length,
    )
    .toBe(1);
  await page.reload();
  expect(
    must(
      await admin.database
        .from("focus_sessions")
        .select("id")
        .eq("user_id", member.id),
    ),
  ).toHaveLength(1);
});
test("a project chat reply appears in personal feed and removed members lose it", async ({
  page,
  browser,
}) => {
  await signIn(page, lead);
  await page.goto("/projects/" + pid + "/workspace?tab=chat");
  await page
    .getByLabel("Message your team")
    .fill("Latest message for the personal feed");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.getByRole("log").getByText("Latest message for the personal feed"),
  ).toBeVisible();
  const recipient = await browser.newPage();
  await signIn(recipient, peer);
  await recipient.goto("/dashboard");
  await expect(
    recipient
      .getByRole("region", { name: "Recent messages" })
      .getByText("Latest message for the personal feed"),
  ).toBeVisible();
  await post(page, "/api/projects/" + pid + "/workspace", {
    action: "remove",
    user_id: peer.id,
    note: "Verification",
  });
  await recipient.reload();
  await expect(
    recipient.getByText("Latest message for the personal feed", {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    recipient.getByText("A private dashboard message", { exact: true }),
  ).toHaveCount(0);
  await recipient.close();
});
