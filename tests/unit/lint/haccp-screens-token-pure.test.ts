/**
 * tests/unit/lint/haccp-screens-token-pure.test.ts
 *
 * Light Design-System Refresh (2026-07-01) — the machine guarantee behind the
 * spec's acceptance criterion #6 ("screens remain token-pure") and the
 * brand's dark-on-dark ban, for the 3 SHIPPED HACCP screens.
 *
 * The existing `semantic-tokens-only` guard scopes `components/ui/**` ONLY and
 * does NOT cover app screens. This guard pins the three shipped HACCP screens so
 * a future edit cannot sneak a raw colour, a dark opt-in, or a forbidden
 * navy-on-navy button back in:
 *
 *   1. TOKEN-PURE — no raw hex, no stock Tailwind palette colour, no Tier-1
 *      brand-primitive (`-mfs-*`) utility; semantic tokens only.
 *   2. NO DARK OPT-IN — the screens never set `data-theme="dark"` (HACCP now
 *      inherits the light `:root`).
 *   3. NO DARK-ON-DARK ON THE NAVY HEADER — any button in a `<ScreenHeader>`
 *      `actions` slot sits ON the navy block, so it must use `ghost-inverse`
 *      (or an orange `primary`), NEVER `secondary` (navy = navy-on-navy) or the
 *      bare `ghost` (navy foreground = invisible/forbidden on navy).
 *
 * `next build` ignores ESLint (next.config.ts), so THIS test — inside the
 * hard-gated unit suite — is what makes such a regression unshippable. Mirrors
 * the file-reading-pin pattern of the other tests/unit/lint/* guards, and reuses
 * the same three banned-pattern matchers as `semantic-tokens-only`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();

/** The shipped, token-pure HACCP screens this guard pins. */
const SCREENS = [
  "app/haccp/page.tsx",
  "app/haccp/cold-storage/page.tsx",
  "app/haccp/process-room/page.tsx",
  "app/haccp/delivery/page.tsx",
];

// ── The three banned colour patterns (same as semantic-tokens-only) ──────────
const RAW_HEX = /#[0-9a-fA-F]{3,8}\b/;
const STOCK_PALETTE =
  /\b(bg|text|border|ring|fill|stroke|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d/;
const BRAND_PRIMITIVE = /-mfs-(navy|orange|maroon|red|sand|soft|ink|neutral|kds)/;

/** Returns the list of banned-pattern names a single source string hits. */
function violations(source: string): string[] {
  const hits: string[] = [];
  if (RAW_HEX.test(source)) hits.push("raw-hex");
  if (STOCK_PALETTE.test(source)) hits.push("stock-palette");
  if (BRAND_PRIMITIVE.test(source)) hits.push("brand-primitive");
  return hits;
}

// ── Dark opt-in + navy-on-navy detection ─────────────────────────────────────
const DARK_OPT_IN = /data-theme=["']dark["']/;
// A button variant that must NEVER sit on the navy ScreenHeader: `secondary`
// (navy fill) or the bare `ghost` (navy foreground). `ghost-inverse` is allowed
// and the trailing quote in the class prevents it matching bare `ghost`.
const NAVY_ON_NAVY = /variant=["'](?:secondary|ghost)["']/;

/** Extract the `{...}` block beginning at the opening brace at `openIdx`. */
function braceBlock(src: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(openIdx, i + 1);
  }
  return src.slice(openIdx);
}

/** Extract each `<ScreenHeader>`'s `actions={ ... }` balanced-brace expression. */
function screenHeaderActions(src: string): string[] {
  const blocks: string[] = [];
  const re = /<ScreenHeader\b/g;
  for (let m; (m = re.exec(src)); ) {
    const rest = src.slice(m.index);
    const aIdx = rest.indexOf("actions=");
    if (aIdx === -1) continue;
    const braceIdx = rest.indexOf("{", aIdx);
    if (braceIdx === -1) continue;
    blocks.push(braceBlock(rest, braceIdx));
  }
  return blocks;
}

describe("haccp-screens-token-pure — the 3 shipped HACCP screens stay brand-clean", () => {
  const sources = SCREENS.map((rel) => ({
    rel,
    src: readFileSync(join(ROOT, rel), "utf8"),
  }));

  it("uses semantic tokens only (no raw hex / stock-palette / brand-primitive)", () => {
    const offenders: string[] = [];
    for (const { rel, src } of sources) {
      const hits = violations(src);
      if (hits.length > 0) offenders.push(`${rel} → ${hits.join(", ")}`);
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : "HACCP screens must use SEMANTIC token utilities only — no raw hex, " +
            "stock Tailwind palette colours, or Tier-1 brand primitives (-mfs-*). " +
            "Offenders:\n" +
            offenders.join("\n"),
    ).toEqual([]);
  });

  it("never opts into the dark theme (HACCP inherits the light :root)", () => {
    const offenders = sources
      .filter(({ src }) => DARK_OPT_IN.test(src))
      .map(({ rel }) => rel);
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : 'HACCP screens must NOT set data-theme="dark" (the kiosk flipped to ' +
            "the light skin). Offenders:\n" +
            offenders.join("\n"),
    ).toEqual([]);
  });

  it("puts no navy-on-navy button (secondary / bare ghost) on the navy ScreenHeader", () => {
    const offenders: string[] = [];
    for (const { rel, src } of sources) {
      for (const actions of screenHeaderActions(src)) {
        if (NAVY_ON_NAVY.test(actions)) offenders.push(rel);
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : "Buttons in a <ScreenHeader> actions slot sit on the navy block and " +
            'must use variant="ghost-inverse" (or an orange "primary"), never ' +
            '"secondary" (navy-on-navy) or bare "ghost" (navy fg). Offenders:\n' +
            offenders.join("\n"),
    ).toEqual([]);
  });

  // ── proven teeth: matchers + extractors actually detect a violation ──────────
  it("detects each banned pattern (rule is not vacuously true)", () => {
    expect(violations('color: "#abc"')).toContain("raw-hex");
    expect(violations('className="bg-red-500"')).toContain("stock-palette");
    expect(violations('className="bg-mfs-navy"')).toContain("brand-primitive");
    expect(
      violations('className="bg-surface-inverse text-inverse text-action-primary"'),
    ).toEqual([]);

    expect(DARK_OPT_IN.test('<div data-theme="dark">')).toBe(true);
    expect(DARK_OPT_IN.test('<div className="haccp-shell">')).toBe(false);

    const bad = screenHeaderActions(
      '<ScreenHeader title="x" actions={<><Button variant="secondary">Handbook</Button></>} />',
    );
    expect(bad.some((a) => NAVY_ON_NAVY.test(a))).toBe(true);

    const good = screenHeaderActions(
      '<ScreenHeader title="x" actions={<><Button variant="ghost-inverse">Quick ref</Button></>} />',
    );
    expect(good.some((a) => NAVY_ON_NAVY.test(a))).toBe(false);
  });
});
