/**
 * tests/unit/lint/semantic-tokens-only.test.ts
 *
 * UI Phase 0a — the design-system "use the semantic layer" guard.
 *
 * From Phase 0b onward every SHARED UI component lives in `components/ui/**`
 * and must reach for the purpose-named (Tier-2 semantic) token utilities
 * (`bg-action-primary`, `text-muted`, `border-strong`, …) — NOT a raw hex,
 * NOT a stock Tailwind palette colour (`bg-blue-500`), and NOT a Tier-1 brand
 * primitive utility (`bg-mfs-navy`). That keeps theming (light/dark/density) in
 * one place: change the token, every component follows.
 *
 * `next build` ignores ESLint (next.config.ts), so THIS test — inside the
 * hard-gated unit suite — is what makes a future raw-colour component
 * unshippable. Mirrors the file-reading-pin pattern of the other
 * tests/unit/lint/* guards.
 *
 * SCOPE: `components/ui/**` ONLY. The existing 19 components and
 * `app/dashboard/admin/_components/primitives.tsx` are pre-existing and are NOT
 * retro-flagged (same scoping discipline as the other lint pins). In 0a the
 * directory does not yet exist / is empty, so the positive scan passes
 * vacuously and PINS the rule for 0b. A separate inline-fixture case proves the
 * matchers actually detect a violation (teeth, not just silence).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const UI_ROOT = join(ROOT, "components", "ui");

// ── The three banned patterns ──────────────────────────────────────────────
// (a) raw hex colour literal (#abc, #aabbcc, #aabbccdd)
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;
// (b) stock Tailwind palette colour utility
const STOCK_PALETTE =
  /\b(bg|text|border|ring|fill|stroke|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/;
// (c) Tier-1 brand-primitive utility (must use the semantic layer instead)
const BRAND_PRIMITIVE =
  /-mfs-(navy|orange|maroon|red|sand|soft|ink|neutral|kds)/;

/** Recursively collect .ts/.tsx files under a dir (empty/absent → []). */
function walkUi(dir: string, acc: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc; // components/ui may not exist yet in 0a — fine.
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkUi(full, acc);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

/** Returns the list of banned-pattern names a single source string hits. */
function violations(source: string): string[] {
  const hits: string[] = [];
  if (RAW_HEX.test(source)) hits.push("raw-hex");
  if (STOCK_PALETTE.test(source)) hits.push("stock-palette");
  if (BRAND_PRIMITIVE.test(source)) hits.push("brand-primitive");
  return hits;
}

function relPath(full: string): string {
  return full.slice(ROOT.length + 1).split("\\").join("/");
}

describe("semantic-tokens-only — components/ui/** uses the semantic layer", () => {
  const files = walkUi(UI_ROOT, []);

  it("flags no raw hex / stock-palette / brand-primitive colour in components/ui/**", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const hits = violations(readFileSync(file, "utf8"));
      if (hits.length > 0) {
        offenders.push(`${relPath(file)} → ${hits.join(", ")}`);
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : "components/ui/** must use the SEMANTIC token utilities " +
            "(bg-action-primary, text-muted, …), not raw hex, stock Tailwind " +
            "palette colours, or Tier-1 brand primitives (-mfs-*). Offenders:\n" +
            offenders.join("\n"),
    ).toEqual([]);
  });

  // ── proven-negative: the matchers have teeth ──────────────────────────────
  it("detects each banned pattern (rule is not vacuously true)", () => {
    expect(violations('color: "#abc"')).toContain("raw-hex");
    expect(violations('className="bg-blue-500"')).toContain("stock-palette");
    expect(violations('className="bg-mfs-navy"')).toContain("brand-primitive");
    // and a clean semantic-only sample trips nothing
    expect(
      violations('className="bg-action-primary text-on-action border-strong"'),
    ).toEqual([]);
  });
});
