/**
 * tests/unit/lint/no-service-role-in-user-routes.test.ts
 *
 * F-RLS-final — "the RLS posture gets teeth." The regression guard that seals
 * the service-role-vs-RLS security posture so it cannot silently regress.
 *
 * Background. F-RLS-04a–i cut the user-facing routes onto per-request,
 * RLS-enforcing `…ForCaller(userId)` factories (the badge-checked door). What
 * remains is a small, deliberate set of routes that still reach the database
 * *master key* — the service-role client, which BYPASSES Row-Level Security.
 * Every one of those routes is a deliberate, written-down exception. This guard
 * goes RED the moment a NEW route grabs the master key without being added to
 * the allow-list below, on EITHER of the two doors into the vault:
 *
 *   • Rule A — DIRECT import. A route imports `supabaseService` /
 *     `getSupabaseService` straight from the Supabase client adapter.
 *   • Rule B — WIRING SINGLETON. A route imports, from `@/lib/wiring/**`, a
 *     pre-wired singleton (e.g. `ordersService`) instead of the safe
 *     per-caller `…ForCaller` factory. A pre-wired singleton carries the
 *     service-role master key two hops away inside the wiring; the route never
 *     names `supabaseService`, so Rule A can't see it — Rule B can.
 *   • Rule C — RAW-ENV MASTER KEY. A route references
 *     `SUPABASE_SERVICE_ROLE_KEY` directly (typically `process.env.…` pasted
 *     into a hand-rolled raw-REST fetch header). It imports NEITHER
 *     `supabaseService` NOR a wiring singleton, so Rules A and B are both blind
 *     to it — Rule C catches it.
 *
 * Detection rule for Rule B is convention-based, NOT a hand-maintained list of
 * singleton export NAMES (which would drift): any symbol imported from
 * `@/lib/wiring` whose name ends in `ForCaller` is the SAFE per-user path and
 * is always allowed; ANY other wiring symbol is presumed to carry the master
 * key and must be justified on the Rule-B allow-list. This errs toward
 * requiring a written reason — the correct bias for a security seal.
 *
 * The allow-lists below are the SINGLE EXECUTABLE SOURCE OF TRUTH (mirroring
 * F-27's in-file ALLOWLIST). ADR-0008 reproduces them in prose for human
 * auditors. When you edit a list here, update the ADR prose to match.
 *
 * Comment immunity: all three matchers anchor on the `import` keyword (Rules A/B)
 * or the `process.env.` access form (Rule C), not on the bare token / module
 * name, so `supabaseService`, `@/lib/wiring/...` or `SUPABASE_SERVICE_ROLE_KEY`
 * appearing in a COMMENT does not trip the guard — exactly the directive-anchoring
 * discipline `no-disable-arch-rules.test.ts` uses. (E.g. app/api/notifications/
 * subscribe mentions `supabaseService` in a doc comment only.)
 *
 * DOCUMENTED ASSUMPTION (Fold-in #3, not enforced this unit). All three matchers
 * are SINGLE-LINE — they test each physical line in isolation, mirroring
 * `no-disable-arch-rules.test.ts`. A formatter that split an import or env access
 * across multiple physical lines (e.g. a brace body wrapped, or
 * `process.env\n  .SUPABASE_SERVICE_ROLE_KEY`) could evade detection. No such
 * case exists in the tree today; if one ever appears, the matchers need a
 * multi-line / AST pass. Recorded in ADR-0008's residual section alongside the
 * three-hop edge.
 *
 * Self-exclusion: the walk scans `app/api/**` ONLY — never `tests/**` or itself,
 * so the allow-list literal containing route names cannot trip the guard.
 *
 * `next build` ignores ESLint (next.config.ts), so THIS test — inside the
 * hard-gated unit suite — is what makes a future un-allow-listed service-role
 * route unshippable.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const API_ROOT = join(ROOT, "app", "api");

// ───────────────────────────────────────────────────────────────────────────
// ALLOW-LIST — Rule A (direct service-role import)
// Seeded from the LIVE grep at implementation time:
//   grep -rn "import.*supabaseService" app/api/   →  the 9 routes below.
// Each route legitimately imports `supabaseService` directly; each carries its
// category + reason + follow-on cutover ticket. Adding to this list is a
// deliberate, reviewed act — that is the whole point of the seal.
//
// Paths are stored relative to the repo root with FORWARD slashes (the walk
// normalises Windows separators before comparing).
// ───────────────────────────────────────────────────────────────────────────
const RULE_A_ALLOWLIST = new Set<string>([
  // system read — reference-data bootstrap read; consumed pre-/cross-user.   (F-RLS-04-reference)
  "app/api/reference/route.ts",
  // system — label print path; service-role read of cross-entity data.       (F-RLS-04-labels)
  "app/api/labels/route.ts",
  // sync/create — Screen-1 sync create-path (cross-cutting writes).          (F-RLS-04g / F-TD-31)
  "app/api/screen1/sync/route.ts",
  // admin/routes — route-planning admin surface (middleware admin-gated).    (F-RLS-04-routes)
  "app/api/routes/customers/route.ts",
  // admin/routes — as above.                                                 (F-RLS-04-routes)
  "app/api/routes/customers/[id]/route.ts",
  // admin/routes — route optimiser (admin).                                  (F-RLS-04-routes)
  "app/api/routes/optimise/route.ts",
  // admin/routes — route assignment user list (admin).                       (F-RLS-04-routes)
  "app/api/routes/users/route.ts",
  // admin/routes — road-time compute (admin).                                (F-RLS-04-routes)
  "app/api/routes/compute-road-times/route.ts",
  // system — push-subscription delete (no logged-in RLS context guaranteed). (F-RLS-04-notifications)
  "app/api/notifications/unsubscribe/route.ts",
]);

// ───────────────────────────────────────────────────────────────────────────
// ALLOW-LIST — Rule B (wiring-singleton import — a non-`…ForCaller` symbol
// imported from @/lib/wiring/**, presumed to carry the service-role master key)
// Seeded from the LIVE grep at implementation time:
//   grep -rn "from '@/lib/wiring" app/api/   →  kept only the routes importing
//   at least one symbol whose name does NOT end in `ForCaller`.
// Each route legitimately uses a pre-wired singleton; each carries its
// category + reason + follow-on. The `…ForCaller` factories are the safe
// per-user path and are NOT listed (the guard always allows them).
// ───────────────────────────────────────────────────────────────────────────
const RULE_B_ALLOWLIST = new Set<string>([
  // pre-auth — must read ANY user's credential before a session exists.      (by design)
  "app/api/auth/login/route.ts",
  // pre-auth — PIN credential read (kds-pin).                                (by design)
  "app/api/auth/kds-pin/route.ts",
  // pre-auth — session-token mint/verify before a user context exists.       (by design)
  "app/api/auth/haccp-admin/route.ts",
  // pre-auth — user lookup before session (login-type probe).                (by design)
  "app/api/auth/type/route.ts",
  // pre-auth — team list read (auth bootstrap).                              (by design)
  "app/api/auth/team/route.ts",
  // pre-auth — HACCP team read (auth bootstrap).                             (by design)
  "app/api/auth/haccp-team/route.ts",
  // public kiosk — visitor sign-in pad; no logged-in user.                   (by design)
  "app/api/haccp/visitor/route.ts",
  // wiring singleton — KDS queue read (kds usecase, cross-rep kitchen view). (F-RLS-04-kds)
  "app/api/kds/orders/route.ts",
  // wiring singleton — KDS line done (kds usecase).                          (F-RLS-04-kds)
  "app/api/kds/lines/[lineId]/done/route.ts",
  // wiring singleton — KDS line undone (kds usecase).                        (F-RLS-04-kds)
  "app/api/kds/lines/[lineId]/undo/route.ts",
  // wiring singleton — orders POST-create; idempotency atomicity.            (F-RLS-04a-create)
  "app/api/orders/route.ts",
  // wiring singleton — screen3 read (today aggregate, cross-rep).            (F-RLS-04g / F-TD-31)
  "app/api/screen3/today/route.ts",
  // wiring singleton — screen3 sync create-path; audit_log cross-cut.        (F-RLS-04g / F-TD-31)
  "app/api/screen3/sync/route.ts",
  // storage — cash upload; `cash-attachments` bucket has no authed policies. (F-RLS-04-cash-storage)
  "app/api/cash/upload/route.ts",
  // wiring singleton — admin dashboard aggregation (cross-rep analytics).    (F-RLS-04-dashboard)
  "app/api/dashboard/route.ts",
  // wiring singleton — discrepancy detail read (admin drill-down).           (F-RLS-04-discrepancies)
  "app/api/detail/discrepancy/route.ts",
  // wiring singleton — geocoder + LLM extractor are non-DB ports; the import  (F-RLS-04-import)
  //   route also wires the LLM extractor singleton.
  "app/api/admin/import/route.ts",
  // wiring singleton — geocoder singleton (non-DB port) in customer edit.    (F-RLS-04-geocoder)
  "app/api/admin/customers/[id]/route.ts",
  // wiring singleton — geocoder singleton (non-DB port) in confirm import.   (F-RLS-04-geocoder)
  "app/api/admin/import/confirm/route.ts",
  // wiring singleton — geocoder singleton (non-DB port) in geocode-all.      (F-RLS-04-geocoder)
  "app/api/admin/geocode-all/route.ts",
  // wiring singleton — routes service (admin run-plan read).                 (F-RLS-04-routes)
  "app/api/admin/runs/route.ts",
  // wiring singleton — routes service (admin run-plan read by id).           (F-RLS-04-routes)
  "app/api/admin/runs/[id]/route.ts",
  // wiring singleton — routes service (route list read).                     (F-RLS-04-routes)
  "app/api/routes/route.ts",
  // wiring singleton — routes service (today's route read).                  (F-RLS-04-routes)
  "app/api/routes/today/route.ts",
  // wiring singleton — routes service (route by id).                         (F-RLS-04-routes)
  "app/api/routes/[id]/route.ts",
  // wiring singleton — pricing activation email (fire-and-forget, no user).  (F-RLS-04-pricing-email)
  "app/api/pricing/[id]/route.ts",
  // wiring singleton — pricing service (bulk line replace).                  (F-RLS-04-pricing)
  "app/api/pricing/[id]/lines/replace/route.ts",
  // wiring singleton — pushSender (web-push port, non-DB) vapid-key read.    (F-RLS-04-push)
  "app/api/notifications/vapid-key/route.ts",
  // wiring singleton — pushSubscriptions repo upsert (no RLS context).       (F-RLS-04-notifications)
  "app/api/notifications/subscribe/route.ts",
  // cron/system — CRON_SECRET-gated; no user context.                        (n/a system)
  "app/api/cron/purge-idempotency-keys/route.ts",
  // cron/system — CRON_SECRET-gated; no user context.                        (F-PROD-03 vercel.json)
  "app/api/cron/haccp-alarm/route.ts",
]);

// ───────────────────────────────────────────────────────────────────────────
// ALLOW-LIST — Rule C (raw-env master key)
// A route reads `SUPABASE_SERVICE_ROLE_KEY` from the environment directly and
// pastes it into hand-rolled raw-REST fetch headers. It imports NEITHER
// `supabaseService` NOR a wiring singleton, so Rules A/B are blind to it.
// Seeded from the LIVE grep at implementation time:
//   grep -rn "SUPABASE_SERVICE_ROLE_KEY" app/api/   →  the 5 routes below.
// These raw-REST master-key uses are the audit-log / cross-cutting writers
// tracked under F-TD-31; their cutover onto an owned port retires the raw key.
// ───────────────────────────────────────────────────────────────────────────
const RULE_C_ALLOWLIST = new Set<string>([
  // raw-REST audit/discrepancy writer — screen2 note (raw key, owned-port cutover pending). (F-TD-31)
  "app/api/screen2/note/route.ts",
  // raw-REST audit/discrepancy writer — screen2 resolve (raw key).            (F-TD-31)
  "app/api/screen2/resolve/route.ts",
  // raw-REST audit/discrepancy writer — screen2 sync (raw key).               (F-TD-31)
  "app/api/screen2/sync/route.ts",
  // raw-REST audit cross-cut — screen3 sync (raw key; also Rule-B for visits). (F-TD-31)
  "app/api/screen3/sync/route.ts",
  // route optimiser — raw key for road-time compute (also Rule-A direct import). (F-TD-31)
  "app/api/routes/optimise/route.ts",
]);

// ── Matchers ────────────────────────────────────────────────────────────────

/**
 * Rule A: a direct service-role import. Anchored on the `import` keyword and the
 * supabase adapter module path, so the symbol names appearing in a comment or
 * string do NOT match. Covers both the named import and the aliased form
 * (`import { supabaseService as supabase } from …`).
 *
 * Two doors are guarded here:
 *   • `supabaseService` / `getSupabaseService` from `adapters/supabase/client`
 *     — the 9 direct importers.
 *   • `requireServiceRole` from `adapters/supabase/authenticatedClient` — the
 *     ADR-0004-blessed master-key entry point (Fold-in #2). NO route imports it
 *     today, so there is no false-red and no allow-list entry is needed; the
 *     guard must not be silent on the OFFICIAL path or a future author could use
 *     the "blessed" door and dodge the alarm.
 */
const RULE_A_IMPORT =
  /^\s*import\s*\{[^}]*\b(?:supabaseService|getSupabaseService|requireServiceRole)\b[^}]*\}\s*from\s*['"][^'"]*adapters\/supabase\/(?:client|authenticatedClient)['"]/;

/**
 * Rule C: a raw-env master-key reference. Anchored on the `process.env.` access
 * form, so `SUPABASE_SERVICE_ROLE_KEY` appearing in a comment or string does NOT
 * match. Catches the hand-rolled raw-REST path where a route copies the master
 * key's value rather than importing a client.
 */
const RULE_C_ENV =
  /process\.env\s*(?:\.\s*SUPABASE_SERVICE_ROLE_KEY\b|\[\s*['"]SUPABASE_SERVICE_ROLE_KEY['"]\s*\])/;

/**
 * Matches a named import statement from `@/lib/wiring/**` and captures the brace
 * body of symbols. Anchored on `import`, so a wiring path in a comment does not
 * match. We then inspect each symbol for the `ForCaller` suffix.
 */
const WIRING_IMPORT = /^\s*import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/wiring\b[^'"]*['"]/;

/** Recursively collect every `route.ts` under a directory. */
function walkRoutes(dir: string, acc: string[]): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc; // app/api may not exist in some contexts — fine.
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkRoutes(full, acc);
    } else if (entry === "route.ts") {
      acc.push(full);
    }
  }
  return acc;
}

/** Repo-root-relative path with forward slashes (stable across platforms). */
function relPath(full: string): string {
  return full.slice(ROOT.length + 1).split("\\").join("/");
}

/** Does this source DIRECTLY import the service-role client (Rule A)? */
function hasDirectServiceRoleImport(source: string): boolean {
  return source.split("\n").some((line) => RULE_A_IMPORT.test(line));
}

/**
 * Does this source import a NON-`ForCaller` wiring singleton (Rule B)?
 * Returns the offending symbol name(s), or [] if every wiring import is a safe
 * `…ForCaller` factory.
 */
function wiringSingletonOffenders(source: string): string[] {
  const offenders: string[] = [];
  for (const line of source.split("\n")) {
    const m = WIRING_IMPORT.exec(line);
    if (!m) continue;
    const symbols = m[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      // handle `foo as bar` — the LOCAL/source name before `as` is what matters;
      // either way, if neither side ends in ForCaller it's a singleton.
      .map((s) => s.split(/\s+as\s+/)[0].trim());
    for (const sym of symbols) {
      if (!sym.endsWith("ForCaller")) offenders.push(sym);
    }
  }
  return offenders;
}

/**
 * Does this source reference the raw `SUPABASE_SERVICE_ROLE_KEY` env var via a
 * `process.env.…` access (Rule C)? Anchored on the access form so a mention in a
 * comment does NOT match.
 */
function hasRawEnvMasterKey(source: string): boolean {
  return source.split("\n").some((line) => RULE_C_ENV.test(line));
}

describe("F-RLS-final no-service-role-in-user-routes — the master-key seal", () => {
  // ── Rule A : direct service-role import ─────────────────────────────────
  describe("Rule A — direct service-role import", () => {
    it("detects a direct supabaseService import at a non-allow-listed path (fixture, proves it CAN go red)", () => {
      const fixture =
        "import { NextResponse } from 'next/server'\n" +
        "import { supabaseService } from '@/lib/adapters/supabase/client'\n" +
        "export async function GET() { return NextResponse.json({}) }\n";
      expect(hasDirectServiceRoleImport(fixture)).toBe(true);
    });

    it("detects the aliased form too (import { supabaseService as supabase })", () => {
      const fixture =
        "import { supabaseService as supabase } from '@/lib/adapters/supabase/client'\n";
      expect(hasDirectServiceRoleImport(fixture)).toBe(true);
    });

    it("detects the blessed requireServiceRole entry point too (Fold-in #2)", () => {
      const fixture =
        "import { requireServiceRole } from '@/lib/adapters/supabase/authenticatedClient'\n";
      expect(hasDirectServiceRoleImport(fixture)).toBe(true);
    });

    it("does NOT flag the safe authenticatedClientForCaller from the same module", () => {
      const fixture =
        "import { authenticatedClientForCaller } from '@/lib/adapters/supabase/authenticatedClient'\n";
      expect(hasDirectServiceRoleImport(fixture)).toBe(false);
    });

    it("is immune to a comment mentioning supabaseService (no import statement)", () => {
      const fixture =
        "/**\n * F-25 — the raw `supabaseService` upsert is gone.\n */\n" +
        "import { pushSubscriptions } from '@/lib/wiring/pushSubscriptions'\n";
      expect(hasDirectServiceRoleImport(fixture)).toBe(false);
    });

    it("the LIVE app/api tree has ZERO un-allow-listed direct service-role imports", () => {
      const offenders: string[] = [];
      for (const file of walkRoutes(API_ROOT, [])) {
        const rel = relPath(file);
        if (RULE_A_ALLOWLIST.has(rel)) continue;
        if (hasDirectServiceRoleImport(readFileSync(file, "utf8"))) {
          offenders.push(rel);
        }
      }
      expect(
        offenders,
        offenders.length === 0
          ? ""
          : `Route(s) import the service-role client (RLS-bypassing master key) ` +
              `WITHOUT being on the Rule-A allow-list: ${offenders.join(", ")}.\n` +
              `EITHER cut the route over to a per-caller \`…ForCaller\` factory ` +
              `(the safe RLS-enforcing path) — OR, if it is a deliberate ` +
              `admin/cron/pre-auth/system exception, add it to RULE_A_ALLOWLIST in ` +
              `tests/unit/lint/no-service-role-in-user-routes.test.ts with a reason ` +
              `+ follow-on ticket, and mirror it into ADR-0008's prose register.`,
      ).toEqual([]);
    });

    it("an allow-listed route importing supabaseService is NOT an offender (positive case)", () => {
      // Sanity: app/api/reference/route.ts (allow-listed) really does import it,
      // and the guard must NOT flag it.
      const ref = "app/api/reference/route.ts";
      expect(RULE_A_ALLOWLIST.has(ref)).toBe(true);
      const source = readFileSync(join(ROOT, ref), "utf8");
      expect(hasDirectServiceRoleImport(source)).toBe(true); // it does import it
      // …but because it is allow-listed, the live scan above already excludes it.
    });
  });

  // ── Rule B : wiring-singleton import ────────────────────────────────────
  describe("Rule B — wiring-singleton import (non-`ForCaller`)", () => {
    it("detects a non-`ForCaller` wiring singleton at a non-allow-listed path (fixture, proves it CAN go red)", () => {
      const fixture =
        "import { NextResponse } from 'next/server'\n" +
        "import { ordersService } from '@/lib/wiring/orders'\n" +
        "export async function POST() { return NextResponse.json({}) }\n";
      const offenders = wiringSingletonOffenders(fixture);
      expect(offenders).toContain("ordersService");
    });

    it("does NOT flag a safe `…ForCaller` factory import", () => {
      const fixture =
        "import { ordersServiceForCaller } from '@/lib/wiring/orders'\n";
      expect(wiringSingletonOffenders(fixture)).toEqual([]);
    });

    it("flags only the singleton in a mixed import (ForCaller + singleton)", () => {
      const fixture =
        "import { ordersService, ordersServiceForCaller } from '@/lib/wiring/orders'\n";
      expect(wiringSingletonOffenders(fixture)).toEqual(["ordersService"]);
    });

    it("is immune to a comment mentioning a wiring path (no import statement)", () => {
      const fixture =
        "// re-pointed off the raw @/lib/wiring/orders singleton onto ForCaller\n" +
        "import { ordersServiceForCaller } from '@/lib/wiring/orders'\n";
      expect(wiringSingletonOffenders(fixture)).toEqual([]);
    });

    it("the LIVE app/api tree has ZERO un-allow-listed wiring-singleton imports", () => {
      const offenders: { route: string; symbols: string[] }[] = [];
      for (const file of walkRoutes(API_ROOT, [])) {
        const rel = relPath(file);
        if (RULE_B_ALLOWLIST.has(rel)) continue;
        const symbols = wiringSingletonOffenders(readFileSync(file, "utf8"));
        if (symbols.length > 0) offenders.push({ route: rel, symbols });
      }
      expect(
        offenders,
        offenders.length === 0
          ? ""
          : `Route(s) import a pre-wired wiring SINGLETON (presumed to carry the ` +
              `service-role master key) WITHOUT being on the Rule-B allow-list: ` +
              offenders
                .map((o) => `${o.route} [${o.symbols.join(", ")}]`)
                .join("; ") +
              `.\nEITHER switch to the safe \`…ForCaller\` factory — OR, if the ` +
              `singleton is a deliberate exception, add the route to ` +
              `RULE_B_ALLOWLIST in ` +
              `tests/unit/lint/no-service-role-in-user-routes.test.ts with a reason ` +
              `+ follow-on ticket, and mirror it into ADR-0008's prose register.`,
      ).toEqual([]);
    });

    it("an allow-listed route importing a wiring singleton is NOT a live offender (positive case)", () => {
      // app/api/orders/route.ts (allow-listed) imports the `ordersService`
      // singleton; the live scan must exclude it.
      const route = "app/api/orders/route.ts";
      expect(RULE_B_ALLOWLIST.has(route)).toBe(true);
      const source = readFileSync(join(ROOT, route), "utf8");
      expect(wiringSingletonOffenders(source)).toContain("ordersService");
    });
  });

  // ── Rule C : raw-env master key ─────────────────────────────────────────
  describe("Rule C — raw-env master key (process.env.SUPABASE_SERVICE_ROLE_KEY)", () => {
    it("detects a raw process.env.SUPABASE_SERVICE_ROLE_KEY at a non-allow-listed path (fixture, proves it CAN go red)", () => {
      const fixture =
        "import { NextResponse } from 'next/server'\n" +
        "const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''\n" +
        "export async function POST() { return NextResponse.json({ KEY }) }\n";
      expect(hasRawEnvMasterKey(fixture)).toBe(true);
    });

    it("detects the bracket-access form too (process.env['SUPABASE_SERVICE_ROLE_KEY'])", () => {
      const fixture =
        "const KEY = process.env['SUPABASE_SERVICE_ROLE_KEY']\n";
      expect(hasRawEnvMasterKey(fixture)).toBe(true);
    });

    it("is immune to a comment mentioning SUPABASE_SERVICE_ROLE_KEY (no process.env access)", () => {
      const fixture =
        "// the raw SUPABASE_SERVICE_ROLE_KEY paste was retired in favour of a port\n" +
        "import { somethingForCaller } from '@/lib/wiring/something'\n";
      expect(hasRawEnvMasterKey(fixture)).toBe(false);
    });

    it("the LIVE app/api tree has ZERO un-allow-listed raw-env master-key references", () => {
      const offenders: string[] = [];
      for (const file of walkRoutes(API_ROOT, [])) {
        const rel = relPath(file);
        if (RULE_C_ALLOWLIST.has(rel)) continue;
        if (hasRawEnvMasterKey(readFileSync(file, "utf8"))) {
          offenders.push(rel);
        }
      }
      expect(
        offenders,
        offenders.length === 0
          ? ""
          : `Route(s) read the raw SUPABASE_SERVICE_ROLE_KEY env var (the master ` +
              `key, RLS-bypassing) WITHOUT being on the Rule-C allow-list: ` +
              `${offenders.join(", ")}.\nEITHER cut the route over to an owned ` +
              `service-role port (the F-TD-31 path) — OR, if it is a deliberate ` +
              `raw-REST exception, add it to RULE_C_ALLOWLIST in ` +
              `tests/unit/lint/no-service-role-in-user-routes.test.ts with a reason ` +
              `+ follow-on ticket, and mirror it into ADR-0008's prose register.`,
      ).toEqual([]);
    });

    it("an allow-listed route reading the raw env key is NOT a live offender (positive case)", () => {
      // app/api/screen2/note/route.ts (allow-listed) really does read the raw
      // env key; the live scan above must exclude it.
      const route = "app/api/screen2/note/route.ts";
      expect(RULE_C_ALLOWLIST.has(route)).toBe(true);
      const source = readFileSync(join(ROOT, route), "utf8");
      expect(hasRawEnvMasterKey(source)).toBe(true); // it does read it
      // …but because it is allow-listed, the live scan already excludes it.
    });
  });
});
