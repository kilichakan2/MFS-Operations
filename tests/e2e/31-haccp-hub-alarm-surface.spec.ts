/**
 * tests/e2e/31-haccp-hub-alarm-surface.spec.ts
 *
 * @critical
 *
 * Forced-alarm proof for the colour-pairing Unit 2 hub repaint (spec §5.10):
 * the hub header IS the food-safety panic light. This spec drives the REAL
 * `useHACCPAlarm` hook through its REAL input — a route-intercepted
 * `/api/haccp/today-status` payload — with ZERO alarm-code modification, and
 * asserts the *rendered pixels*, not class names:
 *
 *   FORCED ALARM (cold storage AM overdue):
 *     - the header carries the `data-surface="alarm"` context
 *     - computed background-color === rgb(214,42,0)  (brand red-600 fill)
 *     - computed colour of the "Food Safety" title === rgb(255,255,255)
 *     - measured white-on-red contrast ≥ 4.5 (body-text legal at every size)
 *     - the OVERDUE pulse pill is visible
 *
 *   CALM (all clear):
 *     - the header carries `data-surface="bold-navy"`
 *     - computed background-color === rgb(22,32,91)  (navy-700)
 *     - white title, no OVERDUE pill
 *
 * Audio stays silent (no user gesture unlocks the AudioContext in the test) —
 * the assertion is visual by design. Login reuses the kiosk-door pattern from
 * 30-haccp-hub-ui-phase1.spec.ts. Runs under --project=chromium.
 */

import { test, expect, type Page } from "@playwright/test";
import { contrastRatio, type RGB } from "./_theme";

const WAREHOUSE_NAME = process.env.E2E_USER_WAREHOUSE ?? "";
const WAREHOUSE_PIN = process.env.E2E_PIN_WAREHOUSE ?? "";

// Brand values the alarm surface must resolve to (tokens.css ground truth).
const RED_600: RGB = { r: 214, g: 42, b: 0 }; // --status-error-fill
const NAVY_700: RGB = { r: 22, g: 32, b: 91 }; // --surface-inverse
const WHITE: RGB = { r: 255, g: 255, b: 255 };

/** Full TodayStatus shape (app/haccp/hubModel.ts) — everything green. */
function allClearStatus() {
  return {
    cold_storage: { am_done: true, pm_done: true, am_overdue: false, pm_overdue: false },
    processing_room: { am_done: true, pm_done: true, am_overdue: false, pm_overdue: false },
    daily_diary: {
      opening: true,
      operational: true,
      closing: true,
      opening_overdue: false,
      operational_overdue: false,
      closing_overdue: false,
    },
    cleaning: { count_today: 1, has_issues_today: false, overdue: false, last_logged_at: null },
    deliveries: { count_today: 0, deviations: 0 },
    mince_runs: { count_today: 0, has_deviations: false },
    product_returns: { count_today: 0, has_safety_returns: false },
    calibration_due: false,
    calibration_done: true,
    calibration_pass: true,
    weekly_review_due: false,
    weekly_review_overdue: false,
    monthly_review_due: false,
    monthly_review_overdue: false,
    training_overdue: 0,
    training_due_soon: 0,
    total_checks: 8,
    completed_checks: 8,
  };
}

/** Same shape with cold storage AM overdue → getOverdueItems ≥ 1 → isAlarming. */
function forcedAlarmStatus() {
  const s = allClearStatus();
  s.cold_storage = { am_done: false, pm_done: false, am_overdue: true, pm_overdue: false };
  s.completed_checks = 7;
  return s;
}

/** Intercept the status API BEFORE any navigation so the REAL hook receives it. */
async function interceptTodayStatus(page: Page, payload: unknown): Promise<void> {
  await page.route("**/api/haccp/today-status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    }),
  );
}

/** Kiosk-door login (pattern from 30-haccp-hub-ui-phase1.spec.ts). */
async function kioskLogin(page: Page, name: string, pin: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/haccp");
  await expect(page.getByText("Tap your name to sign in")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: `Select ${name}` }).click();
  await expect(page.getByRole("button", { name: "Digit 1", exact: true })).toBeVisible({
    timeout: 10_000,
  });
  for (const digit of pin) {
    await page.getByRole("button", { name: `Digit ${digit}`, exact: true }).click();
  }
  await expect(page.getByText("Cold Storage", { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
}

function parseRgb(css: string): RGB {
  const m = css.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
  return { r: m[0], g: m[1], b: m[2] };
}

test.beforeAll(() => {
  if (!WAREHOUSE_NAME || !WAREHOUSE_PIN) {
    throw new Error(
      "Missing E2E_USER_WAREHOUSE / E2E_PIN_WAREHOUSE in .env.e2e.local — " +
        "required to drive the HACCP kiosk login door.",
    );
  }
});

test.describe("@critical HACCP hub — alarm surface flip (computed styles)", () => {
  test("forced alarm: header context flips to alarm — real red-600 fill, real white title, ≥4.5 contrast, OVERDUE pill", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await interceptTodayStatus(page, forcedAlarmStatus());
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);

    // The alarm surface context is present on the hub header.
    const header = page.locator('[data-surface="alarm"]');
    await expect(header).toBeVisible({ timeout: 10_000 });

    // COMPUTED background — the brand alarm fill (red-600), not a class name.
    const bg = parseRgb(
      await header.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    expect(bg).toEqual(RED_600);

    // COMPUTED title colour — white through the surface context.
    const title = header.getByText("Food Safety", { exact: true });
    await expect(title).toBeVisible();
    const fg = parseRgb(await title.evaluate((el) => getComputedStyle(el).color));
    expect(fg).toEqual(WHITE);

    // Measured legibility of the panic light: white on red-600 ≥ 4.5.
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);

    // The escalation pill is visible and carries the overdue count.
    await expect(header.getByText(/1 OVERDUE/)).toBeVisible();
  });

  test("calm: header context is bold-navy — real navy-700 fill, white title, no OVERDUE pill", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await interceptTodayStatus(page, allClearStatus());
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);

    const header = page.locator('[data-surface="bold-navy"]');
    await expect(header).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-surface="alarm"]')).toHaveCount(0);

    const bg = parseRgb(
      await header.evaluate((el) => getComputedStyle(el).backgroundColor),
    );
    expect(bg).toEqual(NAVY_700);

    const title = header.getByText("Food Safety", { exact: true });
    await expect(title).toBeVisible();
    const fg = parseRgb(await title.evaluate((el) => getComputedStyle(el).color));
    expect(fg).toEqual(WHITE);
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);

    // Calm state: no OVERDUE pill anywhere on the hub.
    await expect(page.getByText(/OVERDUE/)).toHaveCount(0);
  });
});
