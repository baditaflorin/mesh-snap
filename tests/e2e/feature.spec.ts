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

/**
 * The advertised core promise: "every phone shoots a photo on the same
 * millisecond". The shutter fire-time is a single mesh-time `fireAtMs`
 * coordinated through the shared `trigger` Y.Map. Camera capture is hardware,
 * but the *synchronized trigger* is fully testable: when peer A fires the snap,
 * peer B must converge on the SAME fire-timestamp. This assertion reads the
 * shared `fireAtMs` (surfaced as `data-fire-at` on the countdown element) on
 * BOTH peers and proves they are identical — the millisecond is shared, not
 * computed independently per phone.
 */
test("synced shutter fire-timestamp matches on both peers", async ({ browser, baseURL }) => {
  const { a, b, cleanup } = await openTwoPeers(browser, baseURL ?? "", { storagePrefix });
  try {
    await a.getByRole("button", { name: /arm camera/i }).click();
    await b.getByRole("button", { name: /arm camera/i }).click();

    // A triggers the synchronized shutter (10s gives the countdown time to be
    // observed on both peers before it fires).
    await a.getByRole("button", { name: /10s timer/i }).click();

    // Both peers must render the countdown carrying the shared fire timestamp.
    await expect(a.locator(".snap-countdown")).toHaveAttribute("data-fire-at", /^\d+$/, {
      timeout: 3000,
    });
    await expect(b.locator(".snap-countdown")).toHaveAttribute("data-fire-at", /^\d+$/, {
      timeout: 3000,
    });

    const fireAtA = await a.locator(".snap-countdown").getAttribute("data-fire-at");
    const fireAtB = await b.locator(".snap-countdown").getAttribute("data-fire-at");

    // The load-bearing cross-peer assertion: the shutter fire millisecond that
    // A published is byte-for-byte the one B reads back from the shared doc.
    expect(fireAtA).not.toBeNull();
    expect(fireAtB).toBe(fireAtA);
  } finally {
    await cleanup();
  }
});
