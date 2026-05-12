import { expect, test } from "@playwright/test";
import { openTwoPeers } from "@baditaflorin/mesh-common/testing";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  name: string;
};
const storagePrefix = pkg.name;

/**
 * Camera-permission UI can't be granted from Playwright without the right
 * browser flags, so we test the arm screen and trigger plumbing — not the
 * actual shutter fire.
 */
test("arm screen appears and the arm button is visible", async ({ page, baseURL }) => {
  await page.goto(baseURL ?? "");
  await expect(page.getByRole("button", { name: /arm camera/i })).toBeVisible();
});

test("trigger published by A is visible on B (countdown text)", async ({ browser, baseURL }) => {
  // Both peers need to be on the arm screen for the trigger to land in the doc.
  // We don't try to grant camera permission; the trigger itself syncs through
  // the Y.Map regardless of arming.
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    // Both peers arm — even without camera, the UI advances to show controls.
    await a.getByRole("button", { name: /arm camera/i }).click();
    await b.getByRole("button", { name: /arm camera/i }).click();
    // A starts a 10s countdown
    await a.getByRole("button", { name: /10s timer/i }).click();
    // B's UI should reflect the countdown
    await expect(b.locator(".snap-countdown")).toBeVisible({ timeout: 3000 });
  } finally {
    await cleanup();
  }
});
