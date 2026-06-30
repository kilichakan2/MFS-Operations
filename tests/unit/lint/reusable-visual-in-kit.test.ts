/**
 * tests/unit/lint/reusable-visual-in-kit.test.ts
 *
 * Design-system governance guard (ADR-0014 Rule 1 + Rule 3).
 *
 * Every reusable visual primitive / brand asset (an icon, logo or brand mark)
 * is DEFINED in `components/ui/` and CONSUMED from its barrel. A brand/icon/logo
 * asset has a tell-tale shape: an EXPORTED component whose body opens directly
 * with an `<svg>` return — the whole component IS the svg. Such a component
 * defined anywhere OUTSIDE the kit is the stray-logo mistake this guard exists
 * to catch (e.g. the original `components/MfsLogo.tsx` before it was moved into
 * `components/ui/`).
 *
 * `next build` ignores ESLint (next.config.ts), so THIS test — inside the
 * hard-gated unit suite — is what makes a future stray brand asset unshippable.
 * Mirrors the file-reading-pin pattern of the other tests/unit/lint/* guards.
 *
 * SCOPE: every `.tsx` under `app/**` and `components/**`, EXCLUDING
 * `components/ui/**` (the kit is the allowed home) and node_modules/.next.
 *
 * The "exported + svg is the FIRST thing in the body" anchor is the
 * discriminator: it catches MfsLogo/MfsIcon-style files but NOT a local,
 * non-exported icon helper (e.g. `Ic` in app/haccp/page.tsx, Modal's local
 * `CloseIcon`) and NOT a larger component with a nested decorative `<svg>`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const SCOPE_DIRS = [join(ROOT, "app"), join(ROOT, "components")];
const KIT_DIR = join(ROOT, "components", "ui"); // the allowed home — excluded

// ── The four svg-rooted EXPORTED-component fingerprints ──────────────────────
// `\s` spans newlines; each matches "export …(){ return ( <svg" or "=> <svg".
const PATTERNS: RegExp[] = [
  // R1: export default function X(...) { return ( <svg
  /export\s+default\s+function\s+\w+\s*\([^)]*\)\s*(:\s*[^{]+)?\{\s*return\s*\(?\s*<svg[\s/>]/,
  // R2: export function X(...) { return ( <svg
  /export\s+function\s+\w+\s*\([^)]*\)\s*(:\s*[^{]+)?\{\s*return\s*\(?\s*<svg[\s/>]/,
  // R3: export const X = (...) => ( <svg
  /export\s+const\s+\w+\s*(:[^=]+)?=\s*\([^)]*\)\s*(:\s*[^=]+)?=>\s*\(?\s*<svg[\s/>]/,
  // R4: export default (...) => ( <svg
  /export\s+default\s+\([^)]*\)\s*=>\s*\(?\s*<svg[\s/>]/,
];

/** True if the source declares an exported svg-rooted (brand-asset) component. */
function isStrayBrandAsset(source: string): boolean {
  return PATTERNS.some((re) => re.test(source));
}

/** Recursively collect .tsx files under a dir, skipping the kit + build dirs. */
function walkTsx(dir: string, acc: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (full === KIT_DIR) continue; // exclude components/ui/** — the kit
    if (statSync(full).isDirectory()) {
      walkTsx(full, acc);
    } else if (/\.tsx$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function relPath(full: string): string {
  return full.slice(ROOT.length + 1).split("\\").join("/");
}

describe("reusable-visual-in-kit — brand/icon assets live only in components/ui/**", () => {
  const files = SCOPE_DIRS.flatMap((d) => walkTsx(d, []));

  it("flags no exported svg-rooted component outside the kit", () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (isStrayBrandAsset(readFileSync(file, "utf8"))) {
        offenders.push(relPath(file));
      }
    }
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : "Reusable visual primitives / brand assets (an EXPORTED component " +
            "whose body is an <svg>) must be DEFINED in components/ui/ and " +
            "consumed from its barrel (ADR-0014 Rule 1/3). Move these into the " +
            "kit:\n" +
            offenders.join("\n"),
    ).toEqual([]);
  });

  // ── proven teeth: planted positives go red, planted negatives stay green ────
  it("detects an exported svg-rooted component (rule is not vacuously true)", () => {
    expect(
      isStrayBrandAsset("export default function X(){ return (<svg></svg>) }"),
    ).toBe(true);
    expect(isStrayBrandAsset("export const Star = () => <svg/>")).toBe(true);
  });

  it("does NOT flag a local helper or a nested decorative svg", () => {
    // local, non-exported icon helper (like `Ic` / Modal's `CloseIcon`)
    expect(isStrayBrandAsset("function Ic(){ return (<svg/>) }")).toBe(false);
    // larger component with a nested decorative <svg> (body opens with <div>)
    expect(
      isStrayBrandAsset(
        "export default function P(){ return (<div><svg/></div>) }",
      ),
    ).toBe(false);
  });
});
