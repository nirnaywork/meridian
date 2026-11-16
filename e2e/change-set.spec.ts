import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const user = JSON.parse(readFileSync(".cache/change-set-qa.json", "utf8"));
import { signIn } from "./session";
test.beforeEach(async ({ page }) => signIn(page, user));

test("logo click and full reload preserve the session", async ({ page }) => {
  await page.getByRole("link", { name: "Meridian home", exact: true }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.goto("/");
  await expect(page).toHaveURL(/\/projects$/);
  await page.goto("/sign-in");
  await expect(page).toHaveURL(/\/projects$/);
});
test("Explore is neutral and offers no cosine sort", async ({ page }) => {
  await expect(
    page.getByRole("heading", { name: "Explore projects." }),
  ).toBeVisible();
  await expect(page.getByLabel("Sort", { exact: true })).toHaveValue("newest");
  await expect(
    page.getByLabel("Sort", { exact: true }).locator("option"),
  ).toHaveText(["Newest first", "Oldest first", "Most roles open"]);
  await expect(page.locator('.best-role-match').first()).toBeVisible();
});
