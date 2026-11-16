import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { signIn } from "./session";
const fixture = JSON.parse(readFileSync(".cache/panel-qa.json", "utf8"));
test("SHOW_MATCH_PERCENT=false hides badges without disabling the panel", async ({
  page,
}) => {
  test.skip(
    !process.env.TEST_FLAG_URL,
    "Start a second server with SHOW_MATCH_PERCENT=false and set TEST_FLAG_URL",
  );
  const base = process.env.TEST_FLAG_URL!;
  await signIn(page, fixture.member, base);
  await page.goto(base + "/projects/" + fixture.pid);
  await expect(
    page.getByRole("heading", { name: "Change set QA FPGA", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".role-match-badge,.best-role-match")).toHaveCount(0);
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
  await dialog.getByRole("tab", { name: "Similarity", exact: true }).click();
  await expect(dialog.locator(".dimension-calculation tbody tr")).toHaveCount(384);
  await expect(dialog.locator(".percentage-explainer")).toHaveCount(0);
});
