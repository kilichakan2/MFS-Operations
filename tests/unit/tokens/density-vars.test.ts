/**
 * tests/unit/tokens/density-vars.test.ts
 *
 * UI Phase 0b — the density-switch wiring guard.
 *
 * Every Wave-1 component sizes itself off the control/field density vars
 * (--ctl-h, --field-h, …) read through Tailwind arbitrary values. Those vars
 * are defined twice: once on :root (comfortable, the touch-first default) and
 * once inside [data-density="compact"] (the desktop-tight override). If a future
 * token edit drops one of them from EITHER block, the components silently stop
 * responding to the density toggle while the build stays green (next build emits
 * no CSS for an unknown utility rather than failing).
 *
 * This static text-parse — same pattern as token-resolve.test.ts — proves both
 * blocks define the full density var set and that compact genuinely tightens
 * (its --ctl-h differs from comfortable's), so the one switch the components
 * rely on is really wired both ways.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const tokensCss = readFileSync(join(ROOT, "app", "tokens.css"), "utf8");

/** The density vars the Wave-1 components read. */
const DENSITY_VARS = [
  "--ctl-h",
  "--ctl-h-sm",
  "--ctl-h-lg",
  "--ctl-px",
  "--ctl-fs",
  "--ctl-radius",
  "--field-h",
  "--field-px",
  "--field-fs",
];

/**
 * Returns the value assigned to `varName` within `block`, or null if absent.
 * Reads up to the terminating ; of that declaration.
 */
function valueOf(block: string, varName: string): string | null {
  const re = new RegExp(`${varName}\\s*:\\s*([^;]+);`);
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

/** The comfortable (default) block is the first :root { … }. */
function rootBlock(css: string): string {
  const start = css.indexOf(":root");
  const open = css.indexOf("{", start);
  // Find the matching close brace for this :root block.
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return css.slice(open + 1);
}

/** The [data-density="compact"] { … } block. */
function compactBlock(css: string): string {
  const start = css.indexOf('[data-density="compact"]');
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return css.slice(open + 1);
}

describe("density-vars — the density toggle is wired both ways", () => {
  const comfortable = rootBlock(tokensCss);
  const compact = compactBlock(tokensCss);

  it("loaded tokens.css and located both density blocks", () => {
    expect(tokensCss.length).toBeGreaterThan(0);
    expect(comfortable.length).toBeGreaterThan(0);
    expect(compact.length).toBeGreaterThan(0);
  });

  it("comfortable (:root) defines every density var", () => {
    const missing = DENSITY_VARS.filter((v) => valueOf(comfortable, v) === null);
    expect(missing, `:root missing density var(s): ${missing.join(", ")}`).toEqual(
      [],
    );
  });

  it('compact ([data-density="compact"]) defines every density var', () => {
    const missing = DENSITY_VARS.filter((v) => valueOf(compact, v) === null);
    expect(
      missing,
      `[data-density="compact"] missing density var(s): ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("compact genuinely tightens (its --ctl-h differs from comfortable's)", () => {
    const comfortableH = valueOf(comfortable, "--ctl-h");
    const compactH = valueOf(compact, "--ctl-h");
    expect(comfortableH).not.toBeNull();
    expect(compactH).not.toBeNull();
    expect(compactH).not.toBe(comfortableH);
  });
});
