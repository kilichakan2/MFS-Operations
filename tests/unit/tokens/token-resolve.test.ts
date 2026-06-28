/**
 * tests/unit/tokens/token-resolve.test.ts
 *
 * UI Phase 0a — the BUILD-GREEN backstop.
 *
 * `next build` ignores ESLint + tsc (next.config.ts) AND an unknown Tailwind
 * utility emits NO CSS rather than failing the build — so a dropped or mistyped
 * colour name would render a screen colourless while the build stays green and
 * silently wrong. THIS static text-parse guard is the precise net under that:
 * it loads the REAL app/tokens.css, app/globals.css and tailwind.config.ts and
 * proves the §5 inventory of the plan is honoured —
 *   • every legacy Tailwind colour name still exists and points at a real token
 *   • the two opacity colours are in channel form and their *-rgb vars exist
 *   • the dark + compact override blocks exist and redefine a semantic var
 *   • the font variables are consumed (not redeclared) and the type ramp exists
 *   • the legacy inline-style alias vars exist
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const tokensCss = readFileSync(join(ROOT, "app", "tokens.css"), "utf8");
const globalsCss = readFileSync(join(ROOT, "app", "globals.css"), "utf8");
const twConfig = readFileSync(join(ROOT, "tailwind.config.ts"), "utf8");

/** Set of custom properties DEFINED (left-hand side) in a CSS string. */
function definedVars(css: string): Set<string> {
  const out = new Set<string>();
  for (const m of css.matchAll(/(--[\w-]+)\s*:/g)) out.add(m[1]);
  return out;
}

/** All custom properties REFERENCED via var(--x) in a string. */
function referencedVars(src: string): string[] {
  return [...src.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
}

const tokensDefined = definedVars(tokensCss);
const globalsDefined = definedVars(globalsCss);

// The §5 legacy Tailwind colour-utility names that MUST still resolve.
const LEGACY_COLOR_NAMES = [
  "mfs-navy", "mfs-orange", "mfs-maroon", "mfs-red", "mfs-sand",
  "mfs-soft-neutral", "mfs-black", "mfs-success", "mfs-warning", "mfs-danger",
  "mfs-neutral-50", "mfs-neutral-100", "mfs-neutral-200", "mfs-neutral-300",
  "mfs-neutral-400", "mfs-neutral-500", "mfs-neutral-700", "mfs-neutral-900",
  "mfs-kds-bg", "mfs-kds-surface", "mfs-kds-surface-raised", "mfs-kds-border",
  "mfs-kds-text", "mfs-kds-text-muted", "mfs-kds-line-empty", "mfs-kds-line-done",
  "mfs-kds-accent",
];

describe("token-resolve — §5 build-safety inventory is honoured", () => {
  it("loaded all three source files", () => {
    expect(tokensCss.length).toBeGreaterThan(0);
    expect(globalsCss.length).toBeGreaterThan(0);
    expect(twConfig.length).toBeGreaterThan(0);
  });

  // ── (1) every legacy colour name still present in the Tailwind config ──────
  it("keeps every §5 legacy colour name in the Tailwind colours config", () => {
    const missing = LEGACY_COLOR_NAMES.filter(
      (name) => !twConfig.includes(`'${name}'`),
    );
    expect(missing, `legacy colour name(s) dropped: ${missing.join(", ")}`).toEqual([]);
  });

  // ── (2) no dangling var(): every token a colour points at exists in tokens.css ─
  it("resolves every colour var() reference to a token defined in tokens.css", () => {
    // External-owned vars (next/font + the type ramp) are NOT in tokens.css.
    const external = (v: string) =>
      v === "--font-display" || v === "--font-text" || v.endsWith("-size");
    const dangling = referencedVars(twConfig)
      .filter((v) => !external(v))
      .filter((v) => !tokensDefined.has(v));
    expect(
      [...new Set(dangling)],
      `Tailwind references var() not defined in tokens.css: ${[...new Set(dangling)].join(", ")}`,
    ).toEqual([]);
  });

  // ── (3) R1 — channel form for the two opacity colours ──────────────────────
  it("exposes mfs-navy and mfs-danger in channel form with their *-rgb vars", () => {
    expect(twConfig).toMatch(
      /'mfs-navy':\s*'rgb\(var\(--mfs-navy-rgb\) \/ <alpha-value>\)'/,
    );
    expect(twConfig).toMatch(
      /'mfs-danger':\s*'rgb\(var\(--mfs-danger-rgb\) \/ <alpha-value>\)'/,
    );
    expect(tokensDefined.has("--mfs-navy-rgb")).toBe(true);
    expect(tokensDefined.has("--mfs-danger-rgb")).toBe(true);
  });

  // ── (4) dark + compact override blocks exist and redefine a semantic var ──
  it("defines the dark theme + compact density override blocks", () => {
    expect(tokensCss).toContain('[data-theme="dark"]');
    expect(tokensCss).toContain('[data-density="compact"]');
    // dark redefines a representative semantic surface var…
    const darkBlock = tokensCss.slice(tokensCss.indexOf('[data-theme="dark"]'));
    expect(darkBlock).toMatch(/--surface-base\s*:/);
    // …compact redefines a representative density control var.
    const compactBlock = tokensCss.slice(
      tokensCss.indexOf('[data-density="compact"]'),
    );
    expect(compactBlock).toMatch(/--ctl-h\s*:/);
  });

  // ── (5) fonts consumed-not-redeclared + the type ramp survives ─────────────
  it("lets next/font own --font-display/--font-text and keeps the type ramp", () => {
    // next/font owns these — they must NOT be redeclared in tokens.css…
    expect(tokensDefined.has("--font-display")).toBe(false);
    expect(tokensDefined.has("--font-text")).toBe(false);
    // …and they must be CONSUMED (referenced) so the wiring isn't dangling.
    expect(referencedVars(globalsCss)).toContain("--font-display");
    expect(referencedVars(globalsCss)).toContain("--font-text");
    expect(referencedVars(twConfig)).toContain("--font-display");
    expect(referencedVars(twConfig)).toContain("--font-text");
    // type ramp vars (read by the Tailwind fontSize map) survive in globals.css.
    for (const v of [
      "--text-display-size", "--text-h1-size", "--text-h2-size",
      "--text-h3-size", "--text-body-lg-size", "--text-body-size",
      "--text-body-sm-size", "--text-caption-size", "--text-mono-size",
    ]) {
      expect(globalsDefined.has(v), `missing type-ramp var ${v}`).toBe(true);
    }
  });

  // ── (6) legacy inline-style alias vars exist ──────────────────────────────
  it("defines the legacy inline-style alias vars (and --mfs-navy)", () => {
    for (const v of [
      "--mfs-navy", "--mfs-orange", "--mfs-neutral",
      // four extras found in the live grep beyond the plan's §5 list:
      "--mfs-sand", "--mfs-red", "--mfs-maroon", "--mfs-black",
    ]) {
      expect(tokensDefined.has(v), `missing legacy alias var ${v}`).toBe(true);
    }
  });
});
