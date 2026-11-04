import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const SAMPLE = path.join(__dirname, "..", "fixtures", "sample.mp4");
const VTT = path.join(__dirname, "..", "fixtures", "sample.vtt");
// Next.js renders an empty role=alert route announcer; target CloudPlay's own alerts.
const alertBox = (page: Page) => page.locator('[role="alert"]:not(#__next-route-announcer__)');

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  (page as unknown as { _errors: string[] })._errors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as unknown as { _errors: string[] })._errors).toEqual([]);
});

test("home page renders branding, link input and availability", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Your Cloud Videos.");
  await expect(page.getByText("Feature availability")).toBeVisible();
  await page.getByLabel(/Paste a Diskwala/).fill("https://www.diskwala.com/app/abc123xyz");
  await expect(page.locator("#link-input-hint")).toContainText("Diskwala");
  await page.getByLabel(/Paste a Diskwala/).fill("https://example.com/page");
  await page.getByRole("button", { name: "Play Video" }).click();
  await expect(page.locator("#link-input-hint")).toContainText("isn't from Diskwala or TeraBox");
});

test("11. plays a supported local video with working controls, speed and subtitles", async ({ page }) => {
  await page.goto("/player");
  await page.getByTestId("local-file-input").setInputFiles(SAMPLE);
  const video = page.locator("video");
  await expect(page.getByText("320 × 180")).toBeVisible(); // metadata read from the actual file
  await page.getByTestId("video-player").getByRole("button", { name: "Play video" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10_000 }).toBeGreaterThan(0.5);
  // keyboard: pause, speed up, seek
  await page.keyboard.press("k");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.keyboard.press(">");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(1.25);
  await page.keyboard.press("5");
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => Math.round(v.currentTime))).toBe(4);
  // menu: speed 2x, no fake quality options for a single stream
  await page.getByRole("button", { name: "Playback settings" }).click();
  await page.getByRole("menuitemradio", { name: "2x" }).click();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.playbackRate)).toBe(2);
  await expect(page.getByText("Quality", { exact: true })).toHaveCount(0);
  // subtitles from a local .vtt file
  await page.locator('input[accept=".vtt,.srt,text/vtt"]').setInputFiles(VTT);
  await expect(page.getByRole("button", { name: /Turn subtitles off/ })).toBeVisible();
});

test("12. unplayable format shows an honest error with an open-original option", async ({ page }) => {
  await page.goto("/player?url=" + encodeURIComponent("https://cdn.example.com/movie.mkv"));
  await expect(alertBox(page)).toContainText("can't be played reliably");
  await expect(page.getByRole("link", { name: "Open original link" })).toHaveAttribute("href", "https://cdn.example.com/movie.mkv");
});

test("19. SSRF attempts are refused through the UI", async ({ page }) => {
  for (const u of ["https://127.0.0.1/a.mp4", "https://169.254.169.254/a.mp4", "https://localhost/a.m3u8"]) {
    await page.goto("/player?url=" + encodeURIComponent(u));
    await expect(alertBox(page)).toContainText(/not allowed/);
  }
});

test("TeraBox share link: no fake playback, offers Open in TeraBox and Save", async ({ page }) => {
  await page.goto("/player?url=" + encodeURIComponent("https://www.terabox.com/s/1AbCdEfGh123"));
  await expect(alertBox(page)).toContainText("In-app playback isn't available for TeraBox");
  await expect(page.getByRole("link", { name: "Open in TeraBox" })).toHaveAttribute("href", "https://www.terabox.com/s/1AbCdEfGh123");
  await expect(page.locator("video")).toHaveCount(0);
  await page.getByRole("button", { name: "Save link to library" }).click();
  await expect(page.getByRole("button", { name: "Saved to library" })).toBeVisible();
});

test("13/15. Diskwala conversion is reported unsupported; manual transfer verifies checksums and is saved", async ({ page }) => {
  await page.goto("/convert?url=" + encodeURIComponent("https://www.diskwala.com/app/abc123xyz"));
  const card = page.getByTestId("conversion-card");
  await expect(card).toContainText("Unsupported");
  await expect(card).not.toContainText("Completed Transfer complete");
  const manual = page.getByTestId("manual-transfer");
  await expect(manual).toContainText("Direct transfer is unavailable");
  const inputs = manual.locator('input[type="file"]');
  await inputs.nth(0).setInputFiles(SAMPLE);
  await expect(manual.getByTestId("sha256").first()).toHaveText(/^[a-f0-9]{64}$/);
  await inputs.nth(1).setInputFiles(SAMPLE);
  await expect(manual.getByTestId("verify-result")).toContainText("Identical");
  await manual.getByLabel("TeraBox share link").fill("https://example.com/not-terabox");
  await expect(manual).toContainText("not a TeraBox sharing link");
  await manual.getByLabel("TeraBox share link").fill("https://www.terabox.com/s/1ManualResult01");
  await manual.getByRole("button", { name: "Save to history" }).click();
  await expect(manual).toContainText("Saved as a manual transfer (checksum verified)");

  await page.goto("/history");
  const manualEntry = page.getByTestId("history-item").filter({ hasText: "Manual transfer" }).first();
  await expect(manualEntry).toContainText("https://www.terabox.com/s/1ManualResult01");
  await expect(manualEntry).toContainText("SHA-256 verified");
  await expect(page.getByTestId("history-item").filter({ hasText: "Automatic attempt" }).first()).toContainText("Unsupported");
});

test("library: save, filter, search and remove", async ({ page }) => {
  await page.goto("/library");
  await page.getByLabel("Link to save").fill("https://www.diskwala.com/app/libtest123");
  await page.getByLabel("Title").fill("Library Test Diskwala");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Library Test Diskwala")).toBeVisible();
  await page.getByRole("tab", { name: "TeraBox" }).click();
  await expect(page.getByText("Library Test Diskwala")).toHaveCount(0);
  await page.getByRole("tab", { name: "Diskwala" }).click();
  await expect(page.getByText("Library Test Diskwala")).toBeVisible();
  await page.getByRole("tab", { name: "All videos" }).click();
  await page.getByLabel("Search saved videos").fill("zzz-nothing");
  await expect(page.getByText("No matching videos")).toBeVisible();
  await page.getByLabel("Search saved videos").fill("Library Test");
  await page.getByRole("button", { name: "Remove Library Test Diskwala" }).click();
  await expect(page.getByText("Library Test Diskwala")).toHaveCount(0);
});

test("settings persist", async ({ page }) => {
  await page.goto("/settings");
  await page.getByLabel("Default playback speed").selectOption("1.5");
  await expect(page.getByText("Saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Default playback speed")).toHaveValue("1.5");
  await page.getByLabel("Default playback speed").selectOption("1");
  await expect(page.getByText("TeraBox Open Platform", { exact: true })).toBeVisible();
});
