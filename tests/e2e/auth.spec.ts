import { expect, test } from "@playwright/test";

test("unauthenticated visitors see the Fly Mail styled calendar sign-in page", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("cal · sign in");
  await expect(page.getByRole("heading", { name: "Sign in to cal" })).toBeVisible();
  await expect(page.locator('img[src="/logo.png"]')).toHaveJSProperty("complete", true);
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test("calendar logo and favicon aliases serve image assets", async ({ request }) => {
  const logo = await request.get("/logo.png");
  expect(logo.ok()).toBe(true);
  expect(logo.headers()["content-type"]).toContain("image/png");

  const favicon = await request.get("/favicon-32x32.png");
  expect(favicon.ok()).toBe(true);
  expect(favicon.headers()["content-type"]).toContain("image/png");
});
