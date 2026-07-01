/**
 * tests/unit/design/contrast-pairings.test.ts
 *
 * The KEYSTONE of the global colour-pairing system (2026-07-01 Unit 2,
 * spec §4/§6/§9.1): the brand pairing matrix as executable law.
 *
 * Two layers:
 *   1. TOKEN-MAPPING — reads the real `app/tokens.css` and pins the `:root`
 *      semantic declarations the pairing system depends on (link, focus ring,
 *      load-bearing borders, per-action label colours, heading voice) and the
 *      RETIREMENT of the blanket `--text-on-action` from the light `:root`.
 *   2. MATHS — recomputes the WCAG contrast ratio of every approved pairing
 *      from raw hex and asserts (a) it clears its role threshold and (b) it
 *      matches the number documented in the spec (±0.2 — keeps the spec's
 *      claims honest). NEGATIVE fixtures prove the banned pairings really do
 *      fail their bar — so the maths has teeth and the bans stay pinned.
 *
 * The WCAG relative-luminance formulas are duplicated from
 * `tests/e2e/_theme.ts` (~15 pure lines) rather than imported — the unit and
 * e2e trees stay uncoupled by design.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

// ── WCAG maths (same formulas as tests/e2e/_theme.ts) ───────────────────────
type RGB = { r: number; g: number; b: number };

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const full =
    h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}
function lin(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminance({ r, g, b }: RGB): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrastRatio(a: string, b: string): number {
  const l1 = luminance(hexToRgb(a));
  const l2 = luminance(hexToRgb(b));
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// ── Tier-1 primitives (hex ground truth, mirrors app/tokens.css) ────────────
const CREAM = "#EDEAE1"; // --mfs-soft-200 (canvas)
const WHITE = "#ffffff";
const INK_900 = "#1E1E1E";
const INK_600 = "#4a4a4a";
const INK_400 = "#7c786e";
const NAVY_700 = "#16205B";
const NAVY_300 = "#5566a8";
const NAVY_50 = "#eaecf4";
const MAROON_500 = "#590129";
const ORANGE_700 = "#a8440c";
const ORANGE_600 = "#c4500f";
const ORANGE_500 = "#EB6619";
const RED_700 = "#a8210a";
const RED_600 = "#d62a00";
const RED_500 = "#FF3300";
const RED_100 = "#ffe0d6";
const SAND_600 = "#a27854";
const SAND_500 = "#C0946F";
const GREEN_700 = "#1b5e3a";
const GREEN_100 = "#e3f0e8";
const AMBER_700 = "#8a5e08";
const AMBER_100 = "#f7ead0";
const NEUTRAL_SOFT = "#efece4"; // --status-neutral-soft
const BORDER_STRONG = "#b9b2a0";

// ── Layer 1 · token-mapping pins ─────────────────────────────────────────────
const tokensCss = readFileSync(join(process.cwd(), "app", "tokens.css"), "utf8");
// The light `:root` block only — everything before the dark-theme override
// (the dark block legitimately keeps retired names for the KDS kiosk).
// Matched at line start: a :root COMMENT also mentions the dark selector.
const darkBlockStart = tokensCss.search(/^\[data-theme="dark"\]/m);
const lightRoot = tokensCss.slice(0, darkBlockStart);

/** Assert `--name:value;` is declared in the light :root (whitespace-tolerant). */
function expectRootDeclaration(name: string, value: string): void {
  const re = new RegExp(`${name}\\s*:\\s*${value.replace(/[()[\]{}*+?.\\^$|]/g, "\\$&")}\\s*[;}]`);
  expect(
    re.test(lightRoot),
    `expected \`${name}:${value}\` in the light :root of app/tokens.css`,
  ).toBe(true);
}

describe("contrast-pairings · layer 1 — token mapping (spec §6)", () => {
  it("links read orange-700 (5.0 on cream — body-text legal)", () => {
    expectRootDeclaration("--text-link", "var(--mfs-orange-700)");
  });

  it("focus ring is orange-600 (3.9 on cream ≥ 3:1) with a matching shadow", () => {
    expectRootDeclaration("--focus-ring", "var(--mfs-orange-600)");
    expectRootDeclaration("--focus-ring-shadow", "rgba(196,80,15,.40)");
  });

  it("load-bearing outlines: --border-input = ink-400; ghost border = navy-300", () => {
    expectRootDeclaration("--border-input", "var(--mfs-ink-400)");
    expectRootDeclaration("--action-ghost-border", "var(--mfs-navy-300)");
  });

  it("per-action label colours: ink on orange (LOCKED b), white on navy/red", () => {
    expectRootDeclaration("--action-primary-fg", "var(--mfs-ink-900)");
    expectRootDeclaration("--action-secondary-fg", "#ffffff");
    expectRootDeclaration("--action-danger-fg", "#ffffff");
  });

  it("heading voice is maroon-500 (LOCKED a); icons default navy-700", () => {
    expectRootDeclaration("--text-heading", "var(--mfs-maroon-500)");
    expectRootDeclaration("--icon-default", "var(--mfs-navy-700)");
  });

  it("the blanket --text-on-action is RETIRED from the light :root", () => {
    expect(
      /--text-on-action\s*:/.test(lightRoot),
      "--text-on-action must not be declared in the light :root — it split " +
        "into the per-action -fg tokens (spec §6)",
    ).toBe(false);
  });
});

// ── Layer 2 · the pairing matrix as maths (spec §4) ─────────────────────────
interface Pairing {
  bg: string;
  fg: string;
  role: string;
  min: number;
  documented: number;
}

const APPROVED: Pairing[] = [
  // Cream / white canvas — body text (≥4.5)
  { bg: CREAM, fg: INK_900, role: "body on cream", min: 4.5, documented: 13.9 },
  { bg: CREAM, fg: NAVY_700, role: "navy structure on cream", min: 4.5, documented: 12.5 },
  { bg: CREAM, fg: MAROON_500, role: "maroon headings on cream", min: 4.5, documented: 11.9 },
  { bg: CREAM, fg: ORANGE_700, role: "links on cream", min: 4.5, documented: 5.0 },
  { bg: CREAM, fg: RED_700, role: "error text on cream", min: 4.5, documented: 6.0 },
  { bg: CREAM, fg: INK_600, role: "muted text on cream", min: 4.5, documented: 7.4 },
  // Cream — large text / icons / load-bearing shapes (≥3)
  { bg: CREAM, fg: ORANGE_600, role: "focus ring on cream", min: 3.0, documented: 3.9 },
  { bg: CREAM, fg: INK_400, role: "input border on cream", min: 3.0, documented: 3.7 },
  { bg: CREAM, fg: NAVY_300, role: "ghost-button border on cream", min: 3.0, documented: 4.5 },
  { bg: CREAM, fg: RED_600, role: "alarm fill as shape on cream", min: 3.0, documented: 4.2 },
  { bg: CREAM, fg: SAND_600, role: "sand-600 large/icon on cream", min: 3.0, documented: 3.3 },
  // White card variants
  { bg: WHITE, fg: ORANGE_600, role: "links on white cards", min: 4.5, documented: 4.7 },
  { bg: WHITE, fg: INK_400, role: "input border on white", min: 3.0, documented: 4.4 },
  { bg: WHITE, fg: NAVY_300, role: "ghost border on white", min: 3.0, documented: 5.5 },
  // Bold navy surface
  { bg: NAVY_700, fg: WHITE, role: "body on navy", min: 4.5, documented: 15.1 },
  { bg: NAVY_700, fg: CREAM, role: "cream text on navy", min: 4.5, documented: 12.5 },
  { bg: NAVY_700, fg: ORANGE_500, role: "orange accent on navy", min: 4.5, documented: 4.6 },
  { bg: NAVY_700, fg: RED_500, role: "red icon/badge on navy", min: 3.0, documented: 4.1 },
  // Bold maroon surface (reserved)
  { bg: MAROON_500, fg: WHITE, role: "body on maroon", min: 4.5, documented: 14.4 },
  { bg: MAROON_500, fg: CREAM, role: "cream text on maroon", min: 4.5, documented: 11.9 },
  { bg: MAROON_500, fg: ORANGE_500, role: "orange accent on maroon", min: 3.0, documented: 4.4 },
  { bg: MAROON_500, fg: RED_500, role: "red accent on maroon", min: 3.0, documented: 3.9 },
  // Orange primary-action fill
  { bg: ORANGE_500, fg: INK_900, role: "primary button label (LOCKED b)", min: 4.5, documented: 5.1 },
  { bg: ORANGE_500, fg: WHITE, role: "white on orange — LARGE ONLY", min: 3.0, documented: 3.3 },
  // Alarm / brand-red fills
  { bg: RED_600, fg: WHITE, role: "alarm surface text", min: 4.5, documented: 5.0 },
  { bg: RED_500, fg: WHITE, role: "white on brand red shape", min: 3.0, documented: 3.7 },
  { bg: RED_500, fg: CREAM, role: "cream on brand red shape", min: 3.0, documented: 3.0 },
  // Sand
  { bg: SAND_500, fg: INK_900, role: "ink on sand chip (the ONLY sand text)", min: 4.5, documented: 6.1 },
  // Status badges (soft fill + -700 text) — verified-safe set
  { bg: RED_100, fg: RED_700, role: "error badge", min: 4.5, documented: 5.8 },
  { bg: GREEN_100, fg: GREEN_700, role: "success badge (caged)", min: 4.5, documented: 6.6 },
  { bg: AMBER_100, fg: AMBER_700, role: "warning badge (caged)", min: 4.5, documented: 4.8 },
  { bg: NAVY_50, fg: NAVY_700, role: "info badge", min: 4.5, documented: 12.8 },
  { bg: NEUTRAL_SOFT, fg: INK_600, role: "neutral badge", min: 4.5, documented: 7.5 },
];

/** Banned pairings — must FAIL their bar (proves the maths has teeth). */
const BANNED: Pairing[] = [
  { bg: CREAM, fg: ORANGE_500, role: "orange-500 as text/ring on cream (why the focus ring moved)", min: 3.0, documented: 2.7 },
  { bg: CREAM, fg: SAND_500, role: "sand-500 as text on cream", min: 3.0, documented: 2.3 },
  { bg: ORANGE_500, fg: WHITE, role: "white BODY text on orange (why primary label is ink)", min: 4.5, documented: 3.3 },
  { bg: CREAM, fg: BORDER_STRONG, role: "border-strong as load-bearing outline (why --border-input exists)", min: 3.0, documented: 1.8 },
];

describe("contrast-pairings · layer 2 — the §4 matrix recomputed", () => {
  it.each(APPROVED)(
    "$role — $fg on $bg ≥ $min (documented $documented)",
    ({ bg, fg, min, documented }) => {
      const ratio = contrastRatio(bg, fg);
      expect(ratio, `ratio ${ratio.toFixed(2)} must clear ${min}:1`).toBeGreaterThanOrEqual(min);
      expect(
        Math.abs(ratio - documented),
        `computed ${ratio.toFixed(2)} drifted from the documented ${documented}`,
      ).toBeLessThanOrEqual(0.2);
    },
  );

  it.each(BANNED)(
    "BANNED: $role — $fg on $bg stays BELOW $min",
    ({ bg, fg, min, documented }) => {
      const ratio = contrastRatio(bg, fg);
      expect(ratio, `banned pairing must fail its ${min}:1 bar`).toBeLessThan(min);
      expect(Math.abs(ratio - documented)).toBeLessThanOrEqual(0.2);
    },
  );

  it("the ratio function itself is sane (black/white = 21, self = 1)", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#808080", "#808080")).toBe(1);
  });
});
