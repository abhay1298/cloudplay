import { expect, test } from "@playwright/test";

test("manifest and iOS home-screen metadata are served", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: "CloudPlay", display: "standalone", start_url: "/" });
  for (const icon of m.icons) expect((await request.get(icon.src)).ok()).toBe(true);
  expect((await request.get("/icons/apple-touch-icon.png")).headers()["content-type"]).toContain("image/png");

  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-touch-icon\.png/);
  await expect(page.locator('meta[name="mobile-web-app-capable"], meta[name="apple-mobile-web-app-capable"]').first()).toHaveAttribute("content", "yes");
  await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute("content", "CloudPlay");
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
});

test("service worker registers and serves the offline page when the network is down", async ({ page, context }) => {
  await page.goto("/");
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())?.active), { timeout: 15_000 }).toBe(true);
  await page.reload(); // let the SW control the page
  await context.setOffline(true);
  await page.goto("/library").catch(() => undefined);
  await expect(page.getByText("You're offline")).toBeVisible();
  await context.setOffline(false);
  // API calls and media are never served from cache
  const cached = await page.evaluate(async () => (await caches.keys()).length && (await (await caches.open((await caches.keys())[0])).keys()).map((r) => new URL(r.url).pathname));
  expect((cached as string[]).some((p) => p.startsWith("/api/"))).toBe(false);
});

test.describe("iPhone Safari", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });

  test("shows a one-time Add to Home Screen hint", async ({ page }) => {
    await page.goto("/");
    const hint = page.getByTestId("ios-install-hint");
    await expect(hint).toContainText("Add to Home Screen");
    await hint.getByRole("button", { name: "Dismiss" }).click();
    await page.reload();
    await expect(page.getByTestId("ios-install-hint")).toHaveCount(0);
  });
});

test("no install hint on desktop browsers", async ({ page }) => {
  await page.goto("/");
  await page.waitForTimeout(500);
  await expect(page.getByTestId("ios-install-hint")).toHaveCount(0);
});
