/**
 * tests/unit/lint/tailwind-namespace-collision.test.ts
 *
 * F-TD-40 — the executable invariant behind the colour-pairing system
 * (2026-07-01 Unit 2). Root cause of the bug: semantic text COLOURS lived in
 * `theme.extend.colors.text.*`, whose nested keys collide with the
 * `theme.extend.fontSize` keys (`body`, …) — Tailwind resolves `text-body` to
 * the SIZE utility and silently emits no colour at all for `text-muted`,
 * `text-subtle`, `text-on-action`, `text-link`. The same nesting made every
 * `border-default|strong|subtle` utility inert (only `border-border-*` ever
 * compiled) — every "semantic" text/border colour on the migrated screens was
 * a no-op falling back to black / preflight grey.
 *
 * The fix puts text colours in Tailwind's dedicated `textColor` theme key and
 * border colours in `borderColor` (each generates ONLY its own utility
 * namespace), and bans any key shared between `fontSize` and `textColor`.
 * This guard pins that layout forever:
 *
 *   (a) no nested `colors.text` group, no top-level `colors.inverse` alias
 *       (the alias also leaked broken `bg-inverse` / `border-inverse`);
 *   (b) `fontSize` and `textColor` share NO key (full key-set comparison —
 *       any future name that collides fails CI, not just today's names);
 *   (c) `textColor` carries exactly the semantic text-colour contract;
 *   (d) `borderColor` carries the semantic border-colour contract.
 *
 * A fixture case proves the collision detector itself has teeth.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import config from "@/tailwind.config";

type KeyedRecord = Record<string, unknown> | undefined;

const extend = (config.theme?.extend ?? {}) as Record<string, KeyedRecord>;
const colors = extend.colors ?? {};
const fontSize = extend.fontSize ?? {};
const textColor = extend.textColor ?? {};
const borderColor = extend.borderColor ?? {};

/** Keys shared between two theme groups — the collision detector. */
function collidingKeys(a: KeyedRecord, b: KeyedRecord): string[] {
  const bKeys = new Set(Object.keys(b ?? {}));
  return Object.keys(a ?? {}).filter((k) => bKeys.has(k));
}

describe("tailwind-namespace-collision — F-TD-40 stays fixed", () => {
  it("(a) colors has no nested `text` group and no top-level `inverse` alias", () => {
    expect(
      colors.text,
      "theme.extend.colors.text must not exist — nesting text colours under " +
        "`colors` collides with fontSize keys and made every semantic text " +
        "colour utility inert (F-TD-40). Use theme.extend.textColor.",
    ).toBeUndefined();
    expect(
      colors.inverse,
      "theme.extend.colors.inverse must not exist — the alias generated " +
        "broken bg-inverse/border-inverse utilities that painted backgrounds " +
        "with the TEXT token. `text-inverse` lives in theme.extend.textColor.",
    ).toBeUndefined();
  });

  it("(b) fontSize and textColor share no key (size/colour collision ban)", () => {
    const collisions = collidingKeys(fontSize, textColor);
    expect(
      collisions,
      collisions.length === 0
        ? ""
        : "A fontSize key and a textColor key share a name — Tailwind will " +
          "resolve `text-<name>` to ONE of them and silently drop the other " +
          "(the F-TD-40 disease). Rename one side. Colliding keys: " +
          collisions.join(", "),
    ).toEqual([]);
  });

  it("(c) textColor pins the semantic text-colour contract", () => {
    expect(Object.keys(textColor).sort()).toEqual(
      ["heading", "body", "muted", "subtle", "inverse", "link", "icon"].sort(),
    );
  });

  it("(d) borderColor pins the semantic border-colour contract", () => {
    expect(Object.keys(borderColor).sort()).toEqual(
      ["default", "strong", "subtle", "input"].sort(),
    );
  });

  // ── deprecation guard: the blanket on-action colour is fully retired ───────
  it("text-on-action / var(--text-on-action) appear nowhere in app/** + components/**", () => {
    const ROOT = process.cwd();
    const offenders: string[] = [];
    const BANNED = /text-on-action|var\(--text-on-action\)/;
    function walk(dir: string): void {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx|css)$/.test(entry) && BANNED.test(readFileSync(full, "utf8"))) {
          // app/tokens.css legitimately keeps ONE declaration in the
          // [data-theme="dark"] block (KDS kiosk; retired with KDS) — its
          // light :root purge is pinned by contrast-pairings.test.ts.
          if (full.endsWith(join("app", "tokens.css"))) continue;
          offenders.push(full.slice(ROOT.length + 1));
        }
      }
    }
    walk(join(ROOT, "app"));
    walk(join(ROOT, "components"));
    expect(
      offenders,
      offenders.length === 0
        ? ""
        : "`text-on-action` is deprecated — use the per-action -fg utilities " +
          "(text-action-primary-fg / -secondary-fg / -danger-fg). Offenders:\n" +
          offenders.join("\n"),
    ).toEqual([]);
  });

  // ── proven teeth: the detector actually fires on a collision ───────────────
  it("collision detector detects a shared key (rule is not vacuously true)", () => {
    const fixture = {
      fontSize: { x: ["1rem", { lineHeight: "1.5" }] },
      textColor: { x: "var(--text-x)" },
    };
    expect(collidingKeys(fixture.fontSize, fixture.textColor)).toEqual(["x"]);
    expect(collidingKeys({ a: 1 }, { b: 2 })).toEqual([]);
  });
});
