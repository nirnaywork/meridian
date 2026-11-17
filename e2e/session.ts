import { expect, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
export async function signIn(
  page: Page,
  who: { id: string; email: string; password: string },
  base = process.env.TEST_APP_URL ?? "http://localhost:3000",
) {
  const path = `.cache/panel-session-${who.id}-${Buffer.from(base).toString("hex")}.json`;
  if (existsSync(path)) {
    await page
      .context()
      .addCookies(JSON.parse(readFileSync(path, "utf8")).cookies);
    // The protected page refreshes expired access cookies via the route proxy.
    // /api/session is deliberately read-only and does not refresh them itself.
    await page.goto(base + "/projects");
    const restored = await page.request.get(base + "/api/session");
    if (restored.ok() && (await restored.json()).signedIn) {
      return;
    }
  }
  await page.goto(base + "/sign-in");
  await page.getByLabel("Email address", { exact: true }).fill(who.email);
  await page.locator('input[type="password"]').fill(who.password);
  const response = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/auth/sign-in") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const auth = await response;
  expect(auth.status()).toBe(200);
  await page.waitForURL("**/dashboard");
  await page.goto(base+"/projects");
  await page.context().storageState({ path });
}
