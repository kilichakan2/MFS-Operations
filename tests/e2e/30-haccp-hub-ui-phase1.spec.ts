/**
 * tests/e2e/30-haccp-hub-ui-phase1.spec.ts
 *
 * @critical
 *
 * NET-NEW exhaustive E2E for the HACCP kiosk hub UI Phase 1 rebuild
 * (ADR-0014 Tier A). HACCP is a safety-critical surface, so per project
 * policy ([[anvil-full-browser-taps]]) the hub gets full browser-tap depth:
 * the F3 login front door, the 16-tile board + every route, the five locked
 * deltas, the responsive side-panel/strip swap, and the alarm/push state.
 *
 * The rebuild re-skinned app/haccp/page.tsx onto components/ui/* and migrated
 * the login door from the bespoke full-screen AuthKeypad to the kit PinKeypad
 * inside a centred Modal (F3 = IN SCOPE → a real login E2E is REQUIRED). The
 * auth LOGIC is byte-identical: staff fetched from /api/auth/haccp-team, a
 * 4-digit PIN POSTed to /api/auth/login (body {name, credential}), success
 * sets the session cookies + mfs_haccp_session and lands on /haccp home.
 *
 * Door selectors (app/haccp/page.tsx, read 2026-06-30):
 *   - staff card  → button aria-label "Select <name>"
 *   - PIN modal   → kit PinKeypad, digit buttons aria-label "Digit N"
 *   - tile        → StatusTile inner button (click the label text)
 *   - tile help   → button aria-label "Help for <label>"
 *
 * The kiosk door only lists butcher + warehouse staff (no admin), so admin
 * reaches /haccp via the main-app admin login then a direct goto — that path
 * exposes the admin-only "Admin panel" button + "Audit" tile.
 *
 * Prereqs: npm run db:up + db:reset; .env.e2e.local with the warehouse +
 * admin creds. Runs under --project=chromium (npm run test:e2e:ui maps to
 * --project=ui; the existing numbered specs run under chromium).
 */

import { test, expect, type Page } from "@playwright/test";
import { loginAsAdmin } from "./_auth";

const WAREHOUSE_NAME = process.env.E2E_USER_WAREHOUSE ?? "";
const WAREHOUSE_PIN = process.env.E2E_PIN_WAREHOUSE ?? "";
const ADMIN_USER = process.env.E2E_USER_ADMIN ?? "";
const ADMIN_PASSWORD = process.env.E2E_PASSWORD_ADMIN ?? "";

// Every digit shifted +1 (mod 10) → guaranteed different from the real PIN,
// same length, so we never accidentally use the real PIN as the "wrong" one.
function wrongPinFrom(pin: string): string {
  return pin
    .split("")
    .map((d) => String((Number(d) + 1) % 10))
    .join("");
}

async function tapPin(page: Page, pin: string): Promise<void> {
  for (const digit of pin) {
    await page.getByRole("button", { name: `Digit ${digit}`, exact: true }).click();
  }
}

/**
 * Drive the real kiosk door: door → staff card → PIN modal → home.
 * Asserts the home tile board is reached (Cold Storage tile visible).
 */
async function kioskLogin(page: Page, name: string, pin: string): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/haccp");
  await expect(page.getByText("Tap your name to sign in")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: `Select ${name}` }).click();
  // Centred PIN modal — the kit keypad group renders.
  await expect(page.getByRole("button", { name: "Digit 1", exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await tapPin(page, pin);
  // Success → hard nav to /haccp home; the tile board mounts. Exact match +
  // first(): "Cold Storage" the tile label is distinct from the overdue-list
  // rows ("Cold Storage AM/PM") and the alarm banner that appear when seeded
  // data is overdue at a wide viewport.
  await expect(page.getByText("Cold Storage", { exact: true }).first()).toBeVisible({
    timeout: 10_000,
  });
}

test.beforeAll(() => {
  if (!WAREHOUSE_NAME || !WAREHOUSE_PIN) {
    throw new Error(
      "Missing E2E_USER_WAREHOUSE / E2E_PIN_WAREHOUSE in .env.e2e.local — " +
        "required to drive the HACCP kiosk login door.",
    );
  }
});

// ─── F3 — login front door (REQUIRED by Gate 2) ──────────────────────────────

test.describe("@critical HACCP hub — F3 kiosk login door", () => {
  test("door shows staff cards + the two footer routes; wrong PIN errors and stays on the door; correct PIN lands on home", async ({
    page,
  }) => {
    await page.context().clearCookies();
    await page.goto("/haccp");

    // Door chrome (F5 copy refresh) + the preserved footer buttons.
    await expect(page.getByText("Tap your name to sign in")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("A 4-digit PIN keeps every record signed to you"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /visitor sign-?in/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /back to main app/i })).toBeVisible();

    // The seeded warehouse staff card is present and opens the centred PIN modal.
    await page.getByRole("button", { name: `Select ${WAREHOUSE_NAME}` }).click();
    await expect(page.getByRole("button", { name: "Digit 1", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    // WRONG PIN → an error is shown and we stay on the door (no home tiles).
    await tapPin(page, wrongPinFrom(WAREHOUSE_PIN));
    await expect(page.getByText(/incorrect|wrong|try again|invalid/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Daily checks")).toHaveCount(0);

    // CORRECT PIN → POST /api/auth/login → home tile board.
    await tapPin(page, WAREHOUSE_PIN);
    await expect(page.getByText("Cold Storage", { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText("Daily checks")).toBeVisible();
  });

  test("Visitor sign-in routes to the visitor kiosk", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/haccp");
    await expect(page.getByText("Tap your name to sign in")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /visitor sign-?in/i }).click();
    await expect(page).toHaveURL(/\/haccp\/visitor$/, { timeout: 10_000 });
  });

  test("Back to main app routes to /", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/haccp");
    await expect(page.getByText("Tap your name to sign in")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /back to main app/i }).click();
    // Unauthenticated → main app root redirects to the login page.
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 10_000 });
  });
});

// ─── Home tile board + routing (+ admin gating) ──────────────────────────────

// label → expected destination. Order matches the on-screen grid.
const WAREHOUSE_TILES: { label: string; path: RegExp }[] = [
  { label: "Cold Storage", path: /\/haccp\/cold-storage$/ },
  { label: "Process Room", path: /\/haccp\/process-room$/ },
  { label: "Goods In", path: /\/haccp\/delivery$/ }, // delta #5 rename, route unchanged
  { label: "Mince / Prep", path: /\/haccp\/mince$/ },
  { label: "Product Return", path: /\/haccp\/product-return$/ },
  { label: "Cleaning", path: /\/haccp\/cleaning$/ },
  { label: "Calibration", path: /\/haccp\/calibration$/ },
  { label: "Reviews", path: /\/haccp\/reviews$/ },
  { label: "People", path: /\/haccp\/people$/ },
  { label: "Training", path: /\/haccp\/training$/ },
  { label: "Allergens", path: /\/haccp\/allergens$/ },
  { label: "Recall Contacts", path: /\/haccp\/recall$/ },
  { label: "Product Specs", path: /\/haccp\/product-specs$/ },
  { label: "Food Fraud", path: /\/haccp\/food-fraud$/ },
  { label: "Food Defence", path: /\/haccp\/food-defence$/ },
];

test.describe("@critical HACCP hub — tile board + routing", () => {
  test("warehouse sees all 15 tiles, NOT the Audit tile or Admin panel button", async ({
    page,
  }) => {
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);

    for (const tile of WAREHOUSE_TILES) {
      await expect(page.getByText(tile.label, { exact: true }).first()).toBeVisible();
    }
    // Admin-only affordances must NOT render for a warehouse session.
    await expect(page.getByText("Audit", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /admin panel/i })).toHaveCount(0);
  });

  test("every warehouse tile navigates to its route (incl. Goods In → /haccp/delivery)", async ({
    page,
  }) => {
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);

    for (const tile of WAREHOUSE_TILES) {
      // Hard navigation re-mounts the home screen each time (session cookie persists).
      await page.goto("/haccp");
      await expect(page.getByText(tile.label, { exact: true }).first()).toBeVisible({
        timeout: 10_000,
      });
      await page.getByText(tile.label, { exact: true }).first().click();
      await expect(page, `tile "${tile.label}"`).toHaveURL(tile.path, { timeout: 10_000 });
    }
  });

  test("admin session shows the Admin panel button + Audit tile, and Audit routes", async ({
    page,
  }) => {
    test.skip(!ADMIN_USER || !ADMIN_PASSWORD, "admin creds not set in .env.e2e.local");
    await page.context().clearCookies();
    await loginAsAdmin(page, ADMIN_USER, ADMIN_PASSWORD);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/haccp");
    await expect(page.getByText("Cold Storage", { exact: true }).first()).toBeVisible({
      timeout: 10_000,
    });

    // F1 — admin entry is now a header button (admin-gated), and the Audit tile shows.
    await expect(page.getByRole("button", { name: /admin panel/i })).toBeVisible();
    await expect(page.getByText("Audit", { exact: true })).toBeVisible();

    await page.getByText("Audit", { exact: true }).click();
    await expect(page).toHaveURL(/\/haccp\/audit$/, { timeout: 10_000 });
  });
});

// ─── The five locked deltas (visible behaviour) ──────────────────────────────

test.describe("@critical HACCP hub — locked deltas visible", () => {
  test("honest 'X of 8' progress + 'Mandatory set · 8' checklist (8 rows) on the wide viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);

    // Side panel (iPad/wide) — honest denominator is 8 (delta #3). Scope to the
    // aside; the phone strip carries the same "of 8" text but is hidden at md+.
    await expect(page.locator("aside").getByText(/\bof 8\b/)).toBeVisible({ timeout: 10_000 });

    // F4 — the mandatory-set checklist header + all 8 enumerated items.
    await expect(page.getByText("Mandatory set · 8")).toBeVisible();
    for (const item of [
      "Cold store — AM",
      "Cold store — PM",
      "Process room — AM",
      "Process room — PM",
      "Diary — Opening",
      "Diary — Operational", // delta #4 mid-day check, surfaced visually
      "Diary — Closing",
      "Cleaning sign-off",
    ]) {
      await expect(page.getByText(item, { exact: true })).toBeVisible();
    }
  });

  test("delta #2 — the static 'Online' dot is gone", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);
    await expect(page.getByText("Online", { exact: false })).toHaveCount(0);
  });

  test("delta #1 — each tile's help '?' opens its OWN SOP (People → People; an unauthored compliance tile → neutral placeholder)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);

    // People → its own authored SOP (Health Monitoring), NOT a default.
    await page.getByRole("button", { name: "Help for People" }).click();
    await expect(page.getByText(/Health Monitoring/i)).toBeVisible({ timeout: 10_000 });
    // Close the sheet (Escape closes the kit Modal).
    await page.keyboard.press("Escape");
    await expect(page.getByText(/Health Monitoring/i)).toHaveCount(0);

    // Food Fraud has no authored SOP → neutral placeholder, NOT the People text.
    await page.getByRole("button", { name: "Help for Food Fraud" }).click();
    await expect(
      page.getByText(/Guidance coming soon|being added/i).first(),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Health Monitoring/i)).toHaveCount(0);
  });
});

// ─── Responsive — side panel (wide) vs collapsible strip (narrow) ────────────

test.describe("@critical HACCP hub — responsive layout", () => {
  test("wide/iPad viewport shows the fixed side-panel checklist", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);
    await expect(page.getByText("Mandatory set · 8")).toBeVisible({ timeout: 10_000 });
  });

  test("narrow/phone viewport hides the side panel and shows the collapsible status strip that expands on tap", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);

    // Side panel checklist is hidden on phone.
    await expect(page.getByText("Mandatory set · 8")).toBeHidden();

    // The collapsible strip header is visible; tapping it expands the overdue section.
    const strip = page.getByRole("button", { name: /Today.?s checks/i });
    await expect(strip).toBeVisible({ timeout: 10_000 });
    await strip.click();
    // The expanded section lives inside <main>; the aside carries the same label
    // but is hidden at this viewport — scope to main to avoid the strict collision.
    await expect(page.getByRole("main").getByText(/Overdue now ·/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

// ─── Alarm / push presence (structural — audio not assertable) ───────────────

test.describe("@critical HACCP hub — alarm & push structure", () => {
  test("header renders; if overdue the alarm banner is a tappable button, else the calm state holds", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await kioskLogin(page, WAREHOUSE_NAME, WAREHOUSE_PIN);

    // The kiosk header is always present.
    await expect(page.getByText("Food Safety")).toBeVisible();

    // The alarm state is seed/time dependent — assert whichever holds, honestly.
    const alarmBanner = page.getByRole("button", { name: /tap to sound alarm/i });
    if ((await alarmBanner.count()) > 0) {
      // Overdue: the whole banner must be a tappable button (iOS audio gesture).
      await expect(alarmBanner.first()).toBeVisible();
      await expect(page.getByText(/OVERDUE/).first()).toBeVisible();
    } else {
      // Calm: no alarm banner and no OVERDUE header pill.
      await expect(page.getByText(/OVERDUE/)).toHaveCount(0);
    }
  });
});
