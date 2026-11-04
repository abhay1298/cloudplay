import path from "node:path";
import { expect, test } from "@playwright/test";

const SAMPLE = path.join(__dirname, "..", "fixtures", "sample.mp4");

test("20. pages fit a phone viewport without horizontal scrolling", async ({ page }) => {
  for (const p of ["/", "/player", "/convert", "/library", "/history", "/settings", "/convert?url=" + encodeURIComponent("https://www.diskwala.com/app/abc123xyz")]) {
    await page.goto(p);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on ${p}`).toBeLessThanOrEqual(0);
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  }
});

test("20. mobile touch controls: tap shows controls, double-tap right seeks forward", async ({ page }) => {
  await page.goto("/player");
  await page.getByTestId("local-file-input").setInputFiles(SAMPLE);
  const video = page.locator("video");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  const player = page.getByTestId("video-player");
  const box = (await player.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height / 2);
  await page.waitForTimeout(80);
  await page.touchscreen.tap(box.x + box.width * 0.85, box.y + box.height / 2);
  // seekBy(+10) clamps to the 8 s duration
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThanOrEqual(7);
  // double-tap must not also trigger fullscreen (synthetic dblclick from touch)
  expect(await page.evaluate(() => !!document.fullscreenElement)).toBe(false);
  await expect(page.getByRole("button", { name: "Fullscreen (f)" })).toBeVisible();
  await page.screenshot({ path: "test-results/mobile-player.png" });
});
