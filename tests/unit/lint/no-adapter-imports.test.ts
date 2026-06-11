/**
 * tests/unit/lint/no-adapter-imports.test.ts
 *
 * F-TD-11 — pins the adapter-import guard: `lib/services/**` and
 * `lib/usecases/**` may never import from `lib/adapters/**`; only the
 * composition root (`lib/wiring/`) wires concretions to abstractions
 * (ADR-0002). Seven cases:
 *
 *   (1) Forbidden:  adapter import (alias) in lib/services/OrdersService.ts → 1 error
 *   (2) Forbidden:  adapter import (alias) in lib/usecases/pickingList.ts   → 1 error
 *   (3) Forbidden:  adapter import (relative) in lib/services/Foo.ts        → 1 error
 *   (4) Allowed:    adapter import in lib/wiring/orders.ts                  → 0 errors
 *   (5) Allowed:    port import in lib/services/OrdersService.ts            → 0 errors
 *   (6) Forbidden:  @supabase/supabase-js in lib/services/OrdersService.ts  → 1 error
 *                   carrying the F-04 message (the override RESTATES the
 *                   F-04 `paths` entry — legacy overrides REPLACE rule
 *                   options, they do not merge; this case proves the
 *                   restatement survived)
 *   (7) Message:    the F-TD-11 pattern message text is reported as-is
 *
 * Unlike no-supabase-sdk.test.ts (a hermetic mirror), this pin loads
 * the REAL `.eslintrc.json` from disk (F-TD-05's lesson: pins must
 * catch drift, not codify it). The `extends` key is deleted so the
 * next/core-web-vitals machinery isn't pulled in; `parserOptions` is
 * added so the inline-string fixtures parse as ESM. `next build`
 * ignores ESLint (next.config.ts), so THIS test — inside the
 * hard-gated unit suite — is what makes deleting the guard unshippable.
 *
 * Uses ESLint's `ESLint` class (NOT `Linter` — `Linter.verify()`
 * ignores `overrides[]` per legacy-config semantics). Fixtures use
 * plain value imports, never `import type` — espree cannot parse
 * TypeScript `import type` syntax; the real TS-parsed `npm run lint`
 * covers `import type` violations too.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

const F04_MESSAGE =
  "Use supabaseService from @/lib/supabase for app code, " +
  "or add an adapter under lib/adapters/supabase/ for vendor-specific operations. " +
  "See ADR-0003 (FREEZE rule).";

const FTD11_MESSAGE =
  "Services and use-cases depend on ports, never on adapters (ADR-0002). " +
  "Wire concretions in the composition root lib/wiring/ instead. See F-TD-11.";

/**
 * Load the SHIPPED config from disk so the pin fails if the guard is
 * weakened or deleted in `.eslintrc.json` itself. `extends` is removed
 * (config-mechanics under test, not the Next.js rule set);
 * `parserOptions` added for the ESM string fixtures.
 */
function loadRealConfig(): Record<string, unknown> {
  const raw = readFileSync(join(process.cwd(), ".eslintrc.json"), "utf8");
  const config = JSON.parse(raw) as Record<string, unknown>;
  delete config.extends;
  config.parserOptions = { ecmaVersion: 2022, sourceType: "module" };
  return config;
}

function makeEslint(): ESLint {
  return new ESLint({
    cwd: process.cwd(),
    useEslintrc: false,
    overrideConfig: loadRealConfig() as never,
  });
}

async function lint(
  filePath: string,
  source: string,
): Promise<{ ruleId: string | null; message: string }[]> {
  const eslint = makeEslint();
  const results = await eslint.lintText(source, { filePath });
  return results[0].messages.map((m) => ({
    ruleId: m.ruleId,
    message: m.message,
  }));
}

describe("F-TD-11 no-restricted-imports — adapter imports banned in services/usecases", () => {
  // ── (1) ────────────────────────────────────────────────────────
  it("reports an error when a service imports from @/lib/adapters/supabase", async () => {
    const messages = await lint(
      "lib/services/OrdersService.ts",
      "import { supabaseOrdersRepository } from '@/lib/adapters/supabase'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (2) ────────────────────────────────────────────────────────
  it("reports an error when a use-case imports from @/lib/adapters/supabase", async () => {
    const messages = await lint(
      "lib/usecases/pickingList.ts",
      "import { supabaseOrdersRepository } from '@/lib/adapters/supabase'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (3) ────────────────────────────────────────────────────────
  it("reports an error for the relative-path form too", async () => {
    const messages = await lint(
      "lib/services/Foo.ts",
      "import { x } from '../adapters/supabase'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (4) ────────────────────────────────────────────────────────
  it("allows adapter imports in the composition root lib/wiring/", async () => {
    const messages = await lint(
      "lib/wiring/orders.ts",
      "import { supabaseOrdersRepository } from '@/lib/adapters/supabase'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (5) ────────────────────────────────────────────────────────
  it("allows port imports in services (sanity)", async () => {
    const messages = await lint(
      "lib/services/OrdersService.ts",
      "import { OrdersRepository } from '@/lib/ports'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (6) ────────────────────────────────────────────────────────
  it("still bans @supabase/supabase-js inside lib/services (F-04 parity preserved)", async () => {
    const messages = await lint(
      "lib/services/OrdersService.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
    expect(messages[0].message).toContain(F04_MESSAGE);
  });

  // ── (7) ────────────────────────────────────────────────────────
  it("reports the F-TD-11 pattern message text verbatim", async () => {
    const messages = await lint(
      "lib/services/OrdersService.ts",
      "import { supabaseOrdersRepository } from '@/lib/adapters/supabase'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(FTD11_MESSAGE);
  });
});
