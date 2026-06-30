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

// ── Detection: an EXPORTED component whose render ROOT is an <svg> ────────────
// A brand asset's tell is that the component IS the svg (root return is <svg>,
// possibly through a fragment, possibly after early-return guards), as opposed to
// a real screen that merely NESTS a decorative <svg> inside a <div>/etc. We match
// each exported component's OWN body (brace-balanced) so a non-exported local
// icon helper (e.g. `Ic` in app/haccp/page.tsx, Modal's `CloseIcon`) never counts.
//
// Hardened (FORGE Guard 🟡): the earlier "svg immediately after the opening brace"
// anchor let common icon shapes evade — block-body arrows `() => { return <svg> }`,
// early-return guards `if(!ok) return null; return <svg>`, fragment-wrapped roots,
// and forwardRef/memo wrappers. All are caught now.

/** Extract the `{...}` block beginning at the opening brace at `openIdx`. */
function braceBlock(src: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(openIdx, i + 1);
  }
  return src.slice(openIdx);
}

/** A returned/implicit JSX whose ROOT is <svg> (optionally via a fragment). */
const SVG_ROOT_RETURN =
  /return\s*\(?\s*(?:<>\s*|<React\.Fragment>\s*)?<svg[\s/>]/;
const SVG_ROOT_IMPLICIT =
  /^\s*\(?\s*(?:<>\s*|<React\.Fragment>\s*)?<svg[\s/>]/;

/** True if the source declares an EXPORTED svg-rooted (brand-asset) component. */
function isStrayBrandAsset(raw: string): boolean {
  // Collapse forwardRef/memo wrappers so they reduce to the base fn/arrow forms.
  const src = raw.replace(/\b(?:React\.)?(?:forwardRef|memo)\s*\(/g, "");

  // export [default] [async] function Name(...) { ...body... }
  const fnHead =
    /export\s+(?:default\s+)?(?:async\s+)?function\s*\w*\s*\([^)]*\)\s*(?::\s*[^){]+)?\{/g;
  for (let m; (m = fnHead.exec(src)); ) {
    if (SVG_ROOT_RETURN.test(braceBlock(src, fnHead.lastIndex - 1))) return true;
  }

  // export const Name [: T] = [<gen>] (...) => ...   |   export default (...) => ...
  const arrowHead =
    /export\s+(?:default\s+|const\s+\w+\s*(?::[^=]+)?=\s*)(?:<[^>]*>\s*)?\([^)]*\)\s*(?::\s*[^=]+)?=>\s*/g;
  for (let m; (m = arrowHead.exec(src)); ) {
    const after = src.slice(arrowHead.lastIndex);
    if (after.startsWith("{")) {
      if (SVG_ROOT_RETURN.test(braceBlock(src, arrowHead.lastIndex))) return true;
    } else if (SVG_ROOT_IMPLICIT.test(after)) {
      return true;
    }
  }
  return false;
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
  it("detects every common exported svg-rooted icon shape (no easy evasion)", () => {
    const caught = [
      "export default function X(){ return (<svg></svg>) }", // fn decl
      "export const Star = (p) => (<svg/>)", // implicit arrow
      "export const Star = () => { return (<svg/>) }", // block-body arrow
      "export default function X(){ if(!ok) return null; return (<svg/>) }", // early return
      "export default function X(){ return (<><svg/></>) }", // fragment-wrapped root
      "export default forwardRef(function X(){ return (<svg/>) })", // forwardRef wrapper
      "export default memo(function X(){ return (<svg/>) })", // memo wrapper
      "export const Star = <T,>(p) => (<svg/>)", // generic arrow
    ];
    for (const shape of caught) {
      expect(isStrayBrandAsset(shape), `should flag: ${shape}`).toBe(true);
    }
  });

  it("does NOT flag a local helper or a nested decorative svg", () => {
    // local, non-exported icon helper (like `Ic` / Modal's `CloseIcon`)
    expect(isStrayBrandAsset("function Ic(){ return (<svg/>) }")).toBe(false);
    // larger component with a nested decorative <svg> (root return is <div>)
    expect(
      isStrayBrandAsset(
        "export default function P(){ return (<div><svg/></div>) }",
      ),
    ).toBe(false);
    // exported screen that nests an svg deep, with a non-exported icon helper too
    expect(
      isStrayBrandAsset(
        "function Ic(){ return (<svg/>) }\nexport default function Page(){ return (<main><Ic/></main>) }",
      ),
    ).toBe(false);
  });
});
