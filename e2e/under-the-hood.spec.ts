import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const f = JSON.parse(readFileSync(".cache/panel-qa.json", "utf8"));
import { signIn as login } from "./session";
const signIn = (page: Page, who = f.member) => login(page, who);
const heavy = (url: string) =>
  /\/api\/(embeddings\/|projects\/[^/]+\/(embedding|similarity))/.test(url);
test("missing embedding offers the skills editor and safely closes on same-page navigation", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/profile");
  await page.route("**/api/embeddings/me", (route) =>
    route.fulfill({ json: { embedding: null } }),
  );
  await page
    .getByRole("button", { name: "Under the Hood", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Under the Hood",
    exact: true,
  });
  await expect(
    dialog.getByRole("heading", { name: "No stored embedding yet" }),
  ).toBeVisible();
  await dialog.getByRole("link", { name: "Edit your skills" }).click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/profile#skills-editor$/);
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
test("normal pages have no old controls, heavy data, or explainer bundle; FAB only on permitted pages", async ({
  page,
}) => {
  const calls: string[] = [],
    scripts: Promise<string>[] = [];
  page.on("request", (r) => {
    if (heavy(r.url())) calls.push(r.url());
  });
  page.on("response", (r) => {
    if (r.url().includes("/_next/") && r.url().split("?")[0].endsWith(".js"))
      scripts.push(r.text().catch(() => ""));
  });
  await signIn(page);
  await expect(
    page.getByRole("button", { name: "Under the Hood", exact: true }),
  ).toHaveCount(0);
  for (const path of [
    "/applications",
    "/invitations",
    "/my-projects",
    "/onboarding",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Under the Hood", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Working of the similarity", { exact: true }),
    ).toHaveCount(0);
  }
  for (const path of ["/profile", "/projects/" + f.pid]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Under the Hood", exact: true }),
    ).toHaveCount(1);
    await expect(
      page.locator(
        ".embedding-explainer,.vector-scroll,.calculation-scroll,.pipeline,.token-chips",
      ),
    ).toHaveCount(0);
    await expect(
      page.getByText("How is similarity calculated?", { exact: true }),
    ).toHaveCount(0);
  }
  expect(calls).toHaveLength(0);
  expect((await Promise.all(scripts)).join("\n")).not.toContain(
    "384 dimensions available; rows are virtualized",
  );
  for (const path of [
    "/profile/under-the-hood",
    `/projects/${f.pid}/under-the-hood`,
    `/profile/${f.lead.id}`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole("button", { name: "Under the Hood", exact: true }),
    ).toHaveCount(0);
  }
});
test("panel closes with keyboard, X, backdrop and Back; traps focus and caches data", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/profile");
  const calls: string[] = [];
  page.on("request", (r) => {
    if (heavy(r.url())) calls.push(r.url());
  });
  const fab = page.getByRole("button", { name: "Under the Hood", exact: true });
  await fab.click();
  const dialog = page.getByRole("dialog", {
    name: "Under the Hood",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(fab).toBeHidden();
  await expect(
    dialog.getByRole("heading", {
      name: "Working of the embeddings",
      exact: true,
    }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe(
    "hidden",
  );
  await expect(page).toHaveURL(/panel=under-the-hood/);
  await dialog
    .getByRole("button", { name: "Expand panel", exact: true })
    .click();
  await expect
    .poll(() =>
      dialog.evaluate((el) =>
        Math.abs(el.getBoundingClientRect().width - window.innerWidth),
      ),
    )
    .toBeLessThan(2);
  await dialog
    .getByRole("button", { name: "Collapse panel", exact: true })
    .click();
  await page.keyboard.press("Control+End");
  await dialog
    .locator("a[href],button,input,select,textarea,[tabindex],summary")
    .last()
    .focus();
  await page.keyboard.press("Tab");
  expect(
    await dialog.evaluate((el) => el.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(fab).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  const count = calls.length;
  await fab.click();
  await expect(
    dialog.getByRole("region", { name: "All 384 embedding dimensions" }),
  ).toBeVisible();
  expect(calls).toHaveLength(count);
  await dialog
    .getByRole("button", { name: "Close Under the Hood", exact: true })
    .click();
  await expect(fab).toBeFocused();
  await fab.click();
  await expect(dialog).toBeVisible();
  await page.getByTestId("hood-backdrop").click({ position: { x: 8, y: 8 } });
  await expect(fab).toBeFocused();
  await fab.click();
  await expect(dialog).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/profile$/);
  await page.goto("/profile?panel=under-the-hood&tab=embedding");
  await expect(
    dialog.getByRole("heading", {
      name: "Working of the embeddings",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Close Under the Hood", exact: true })
    .click();
  await expect(fab).toBeFocused();
  await page.goto("/projects");
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
});
test("project tabs load on demand, preserve snapshots, and retain 384-dimension parity", async ({
  page,
}) => {
  await signIn(page);
  // Exercise historical-versus-current copy without regenerating any saved vector.
  await page.route('**/api/projects/'+f.pid+'/similarity?role=*',async route=>{const response=await route.fetch();const data=await response.json();if(data.snapshot&&data.cosine!=null)data.snapshot.cosine=data.cosine-.1;await route.fulfill({response,json:data})});
  await page.goto("/projects/" + f.pid);
  const paths: string[] = [];
  page.on("request", (r) => {
    if (heavy(r.url())) paths.push(r.url());
  });
  await page
    .getByRole("button", { name: "Under the Hood", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Under the Hood",
    exact: true,
  });
  await expect(
    dialog.getByRole("heading", {
      name: "Working of this project's embedding",
      exact: true,
    }),
  ).toBeVisible();
  expect(paths.length).toBe(1);
  expect(paths[0]).toContain("/embedding");
  expect(paths[0]).not.toContain("role=");
  await dialog
    .getByRole("tab", { name: "Role embeddings", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", {
      name: "Working of this role’s embedding",
      exact: true,
    }),
  ).toBeVisible();
  expect(paths.at(-1)).toContain("role=" + f.rid);
  await dialog.getByRole("tab", { name: "Similarity", exact: true }).click();
  await expect(dialog.locator(".dimension-calculation tbody tr")).toHaveCount(384);
  await expect(dialog.getByTestId("cosine-snapshot")).toContainText(
    "Application snapshot cosine:",
  );
  await expect(dialog.getByTestId("cosine-snapshot")).toContainText(
    "Current cosine:",
  );
  await expect(dialog.getByTestId("cosine-snapshot")).toContainText(
    "snapshot is preserved",
  );
  const d = await (
    await page.request.get(`/api/projects/${f.pid}/similarity?role=${f.rid}`)
  ).json();
  const parse = (v: any) => (typeof v === "string" ? JSON.parse(v) : v),
    a = parse(d.profile.embedding),
    b = parse(d.target.embedding);
  expect(a).toHaveLength(384);
  expect(b).toHaveLength(384);
  const dot = a.reduce((n: number, x: number, i: number) => n + x * b[i], 0),
    cos = dot / (Math.hypot(...a) * Math.hypot(...b));
  expect(Math.abs(cos - d.cosine)).toBeLessThan(1e-6);
  expect(Math.abs(dot - d.cosine)).toBeLessThan(1e-6);
  await expect(
    dialog.getByText("Cosine after dividing by norms:", { exact: false }),
  ).toContainText(cos.toFixed(9));
  const badge = await page
    .locator(".role-detail .role-match-badge b")
    .first()
    .textContent();
  expect(Number(badge?.match(/\d+/)?.[0])).toBe(d.rolePercentages.find((r:any)=>r.roleId===f.rid).matchPercent);
  await page.screenshot({
    path: "docs/under-the-hood-project.png",
    fullPage: false,
  });
});
test("owner similarity and profile endpoint enforce privacy", async ({
  page,
}) => {
  await signIn(page, f.lead);
  const d = await (
    await page.request.get(`/api/projects/${f.pid}/similarity`)
  ).json();
  expect(d.mode).toBe("owner");
  expect(d.applicants.length).toBeGreaterThan(0);
  const keys = new Set<string>();
  const walk = (v: any) => {
    if (v && typeof v === "object")
      Object.entries(v).forEach(([k, x]) => {
        keys.add(k);
        walk(x);
      });
  };
  walk(d);
  for (const key of [
    "embedding",
    "trace",
    "profile",
    "target",
    "canonical_text",
  ])
    expect(keys.has(key)).toBe(false);
  const own = await (
    await page.request.get(`/api/embeddings/me?user_id=${f.member.id}`)
  ).json();
  expect(own.embedding.profile_id).toBe(f.lead.id);
  await page.goto(`/projects/${f.pid}?panel=under-the-hood&tab=similarity`);
  const dialog = page.getByRole("dialog", {
    name: "Under the Hood",
    exact: true,
  });
  await expect(dialog.getByLabel("Applicant", { exact: true })).toBeVisible();
  await expect(
    dialog.locator(".vector-scroll,.dimension-calculation,.token-chips"),
  ).toHaveCount(0);
  await expect(
    dialog.getByText("Snapshot cosine:", { exact: false }),
  ).toBeVisible();
  const other = await page.request.get(
    `/api/projects/${f.pid}/embedding?role=00000000-0000-4000-8000-000000000000`,
  );
  expect(other.status()).toBe(404);
});
test("mobile panel fills viewport and respects safe layering", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await page.goto("/profile");
  const fab = page.getByRole("button", { name: "Under the Hood", exact: true });
  expect(
    await fab.evaluate((el) =>
      Math.abs(
        el.getBoundingClientRect().width - el.getBoundingClientRect().height,
      ),
    ),
  ).toBeLessThan(1);
  await fab.click();
  const dialog = page.getByRole("dialog", {
    name: "Under the Hood",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box?.width).toBe(390);
  expect(box?.height).toBe(844);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await expect(dialog.locator(".hood-mobile-toc")).toBeVisible();
  await expect(
    dialog.getByRole("heading", {
      name: "Working of the embeddings",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return (
        Number(s.getPropertyValue("--layer-dialog")) >
          Number(s.getPropertyValue("--layer-panel")) &&
        Number(s.getPropertyValue("--layer-panel")) >
          Number(s.getPropertyValue("--layer-fab"))
      );
    }),
  ).toBe(true);
  await page.screenshot({
    path: "docs/under-the-hood-mobile.png",
    fullPage: false,
  });
  await page.keyboard.press("Escape");
  await expect(fab).toBeFocused();
});
