/**
 * tests/unit/lint/no-cross-service-imports.test.ts
 *
 * F-TD-05 — pins the cross-service-import guard: a `lib/services/**`
 * (or `lib/usecases/**`) file may never import ANOTHER service module
 * directly (ADR-0002 line 23). Services compose PORTS, or compose via a
 * use-case; they never reach sideways into a sibling service. The
 * dependency graph stays acyclic.
 *
 * Like no-adapter-imports.test.ts (and unlike the hermetic-mirror
 * no-supabase-sdk.test.ts), this pin loads the REAL `.eslintrc.json`
 * from disk so it fails if the rule is weakened or deleted in the
 * shipped config. `next build` ignores ESLint (next.config.ts), so THIS
 * test — inside the hard-gated unit suite — is what makes deleting the
 * guard unshippable.
 *
 * Uses ESLint's `ESLint` class (NOT `Linter` — `Linter.verify()` ignores
 * `overrides[]`). Fixtures use plain value imports (espree can't parse
 * `import type`); the real TS-parsed `npm run lint` covers type imports.
 *
 * Cases:
 *   (1)  Forbidden: service imports a sibling service (alias)     → 1 error
 *   (2)  Forbidden: use-case imports a service (alias)            → 1 error
 *   (3)  Forbidden: use-case imports a service (relative path)    → 1 error
 *   (3b) Allowed:   the services barrel re-exporting its members  → 0 errors
 *   (4)  Allowed:   service imports a PORT                        → 0 errors
 *   (5)  Allowed:   service imports a DOMAIN type                 → 0 errors
 *   (6)  Allowed:   wiring imports a service (composition root)   → 0 errors
 *   (7)  Message:   the F-TD-05 message text verbatim
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

const FTD05_MESSAGE =
  "Services and use-cases must not import another service directly " +
  "(ADR-0002 line 23 / F-TD-05). Compose via a use-case in lib/usecases/ " +
  "or depend on the other domain's PORT. Wire concretions in lib/wiring/.";

function loadRealConfig(): Record<string, unknown> {
  const raw = readFileSync(join(process.cwd(), ".eslintrc.json"), "utf8");
  const config = JSON.parse(raw) as Record<string, unknown>;
  delete config.extends;
  config.parserOptions = { ecmaVersion: 2022, sourceType: "module" };
  return config;
}

async function lint(
  filePath: string,
  source: string,
): Promise<{ ruleId: string | null; message: string }[]> {
  const eslint = new ESLint({
    cwd: process.cwd(),
    useEslintrc: false,
    overrideConfig: loadRealConfig() as never,
  });
  const results = await eslint.lintText(source, { filePath });
  return results[0].messages.map((m) => ({
    ruleId: m.ruleId,
    message: m.message,
  }));
}

describe("F-TD-05 no-restricted-imports — cross-service imports banned", () => {
  // ── (1) ──────────────────────────────────────────────────────────
  it("reports an error when a service imports a sibling service (alias)", async () => {
    const messages = await lint(
      "lib/services/UsersService.ts",
      "import { createOrdersService } from '@/lib/services/OrdersService'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (2) ──────────────────────────────────────────────────────────
  it("reports an error when a use-case imports a service (alias)", async () => {
    const messages = await lint(
      "lib/usecases/pickingList.ts",
      "import { createUsersService } from '@/lib/services/UsersService'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (3) ──────────────────────────────────────────────────────────
  it("reports an error for the relative-path form too (use-case → service)", async () => {
    // A use-case reaching sideways into a service via a relative path.
    // (The same-directory `./OtherService` form is intentionally NOT
    // matched, so the services barrel can re-export `./OrdersService`
    // without tripping — Risk R4; the codebase imports services via the
    // `@/lib/services/*` alias, which case (1) covers.)
    const messages = await lint(
      "lib/usecases/pickingList.ts",
      "import { createOrdersService } from '../services/OrdersService'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (3b) ─────────────────────────────────────────────────────────
  it("does NOT flag the services barrel re-exporting its own members", async () => {
    // lib/services/index.ts legitimately does `export { … } from './OrdersService'`.
    // The same-dir relative form must stay allowed so the barrel works.
    const messages = await lint(
      "lib/services/index.ts",
      "export { createOrdersService } from './OrdersService'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (4) ──────────────────────────────────────────────────────────
  it("allows a service importing a PORT", async () => {
    const messages = await lint(
      "lib/services/UsersService.ts",
      "import { UsersRepository } from '@/lib/ports'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (5) ──────────────────────────────────────────────────────────
  it("allows a service importing a DOMAIN type", async () => {
    const messages = await lint(
      "lib/services/UsersService.ts",
      "import { KNOWN_ROLES } from '@/lib/domain'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (6) ──────────────────────────────────────────────────────────
  it("allows the composition root lib/wiring/ to import a service", async () => {
    const messages = await lint(
      "lib/wiring/users.ts",
      "import { createUsersService } from '@/lib/services'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (7) ──────────────────────────────────────────────────────────
  it("reports the F-TD-05 message text verbatim", async () => {
    const messages = await lint(
      "lib/services/UsersService.ts",
      "import { createOrdersService } from '@/lib/services/OrdersService'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(FTD05_MESSAGE);
  });
});
