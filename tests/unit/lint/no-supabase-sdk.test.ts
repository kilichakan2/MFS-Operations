/**
 * tests/unit/lint/no-supabase-sdk.test.ts
 *
 * F-04 — pins the `no-restricted-imports` configuration against typos
 * and silent drift. Six cases:
 *
 *   (1) Forbidden:  SDK import in app/api/foo/route.ts                       → 1 error
 *   (2) Allowed:    SDK import in lib/adapters/supabase/client.ts            → 0 errors
 *   (3) Allowed:    SDK import in lib/adapters/supabase/OrdersRepository.ts  → 0 errors
 *   (4) Allowed:    SDK import in tests/integration/foo.ts                   → 0 errors
 *   (5) Message:    the configured custom-message text is reported as-is
 *   (6) Sanity:     unrelated import (zod) in app/api/foo/route.ts           → 0 errors
 *
 * Uses ESLint's `ESLint` class (the higher-level API), NOT `Linter`,
 * because `Linter.verify()` ignores `overrides[]` per the legacy
 * config semantics (see node_modules/eslint/lib/linter/linter.js:1447
 * — comment: "Linter doesn't support 'overrides' property in
 * configuration"). The `ESLint` class builds the full legacy config
 * array internally and honours every overrides[] block.
 *
 * `useEslintrc: false` isolates the test from the project's real
 * .eslintrc.json (which extends next/core-web-vitals and would
 * otherwise pull in the entire Next.js + React + a11y rule machinery
 * for no reason in a focused config-test). `overrideConfig` feeds the
 * synthetic F-04 config — a hand-rolled mirror of the .eslintrc.json
 * edit, kept in sync via case (5)'s message-substring assertion (a
 * typo in either copy fails the test).
 *
 * No on-disk fixture files, no temp directories, no shelling out.
 */
import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";

const FORBIDDEN_MESSAGE =
  "Use supabaseService from @/lib/adapters/supabase/client for app code, " +
  "or add an adapter under lib/adapters/supabase/ for vendor-specific operations. " +
  "See ADR-0003 (FREEZE rule).";

// F-10 — bcryptjs may only be imported inside lib/adapters/bcrypt/. The string
// below MUST be byte-identical to the one in .eslintrc.json and
// no-adapter-imports.test.ts (the no-adapter-imports pin asserts it verbatim).
const BCRYPT_FORBIDDEN_MESSAGE =
  "Use the PasswordHasher port via @/lib/wiring/password. " +
  "bcryptjs may only be imported inside lib/adapters/bcrypt/. " +
  "See ADR-0002 / F-10.";

// F-12 — @anthropic-ai/sdk may only be imported inside lib/adapters/anthropic/.
// The string below MUST be byte-identical to the one in .eslintrc.json and
// no-adapter-imports.test.ts (the no-adapter-imports pin asserts it verbatim).
const ANTHROPIC_FORBIDDEN_MESSAGE =
  "Use the LLMExtractor port via @/lib/wiring/llm. " +
  "@anthropic-ai/sdk may only be imported inside lib/adapters/anthropic/. " +
  "See ADR-0002 / F-12.";

/**
 * The F-04 config under test. Mirrors `.eslintrc.json` exactly.
 *
 * If the .eslintrc.json edit drifts (e.g. someone changes the
 * forbidden module name or edits the custom message), case (5)'s
 * message assertion catches it. The local copy keeps the test
 * hermetic — no file-system read, no JSON.parse on the actual
 * .eslintrc.json — but the canonical source of truth remains the
 * shipped config; the test mirrors it.
 *
 * `parserOptions` is set to a permissive ES2022 + sourceType: 'module'
 * so the inline-string fixtures parse as ESM regardless of the
 * project's tsconfig.
 */
const f04Config = {
  parserOptions: {
    ecmaVersion: 2022 as const,
    sourceType: "module" as const,
  },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@supabase/supabase-js",
            message: FORBIDDEN_MESSAGE,
          },
          {
            name: "bcryptjs",
            message: BCRYPT_FORBIDDEN_MESSAGE,
          },
          {
            name: "@anthropic-ai/sdk",
            message: ANTHROPIC_FORBIDDEN_MESSAGE,
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: [
        "lib/adapters/supabase/**/*.ts",
        "lib/adapters/bcrypt/**/*.ts",
        "lib/adapters/anthropic/**/*.ts",
        "tests/**",
      ],
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
};

/**
 * Construct a fresh ESLint instance per test to avoid any internal
 * caching between cases. The instance is configured to:
 *   - Skip .eslintrc.* discovery (useEslintrc: false).
 *   - Use only the F-04 config under test (overrideConfig).
 *
 * `cwd` is set to the project root so the overrides[] file globs
 * resolve against the same base path the project ESLint run uses.
 * Without this, a glob like `lib/supabase.ts` would resolve relative
 * to whatever cwd vitest happens to spawn with.
 */
function makeEslint(): ESLint {
  return new ESLint({
    cwd: process.cwd(),
    useEslintrc: false,
    overrideConfig: f04Config as never,
  });
}

async function lint(
  filePath: string,
  source: string,
): Promise<{ ruleId: string | null; message: string }[]> {
  const eslint = makeEslint();
  const results = await eslint.lintText(source, { filePath });
  // lintText returns one LintResult per file (just one here);
  // .messages contains every reported diagnostic.
  return results[0].messages.map((m) => ({
    ruleId: m.ruleId,
    message: m.message,
  }));
}

describe("F-04 no-restricted-imports — Supabase SDK FREEZE rule", () => {
  // ── (1) ────────────────────────────────────────────────────────
  it("reports an error when @supabase/supabase-js is imported from app/api", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (2) ────────────────────────────────────────────────────────
  it("allows the import in lib/adapters/supabase/client.ts (central client)", async () => {
    const messages = await lint(
      "lib/adapters/supabase/client.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (3) ────────────────────────────────────────────────────────
  it("allows the import in lib/adapters/supabase/**/*.ts (prospective adapter dir)", async () => {
    const messages = await lint(
      "lib/adapters/supabase/OrdersRepository.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (4) ────────────────────────────────────────────────────────
  it("allows the import in tests/** (test infrastructure)", async () => {
    const messages = await lint(
      "tests/integration/foo.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (5) ────────────────────────────────────────────────────────
  it("reports the configured custom-message text verbatim", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toHaveLength(1);
    // The rule message format is:
    //   "'<name>' import is restricted from being used. <message>"
    // We assert the configured tail appears verbatim in the rendered
    // message. (Substring asserts the configured text, robust to
    // ESLint's leading-prefix wording.)
    expect(messages[0].message).toContain(FORBIDDEN_MESSAGE);
  });

  // ── (6) ────────────────────────────────────────────────────────
  it("does not affect unrelated imports (zod in app/api)", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import { z } from 'zod'\n",
    );
    expect(messages).toEqual([]);
  });
});

describe("F-10 no-restricted-imports — bcryptjs may only live in lib/adapters/bcrypt", () => {
  // ── (a) ────────────────────────────────────────────────────────
  it("reports an error when bcryptjs is imported from app/api", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import bcrypt from 'bcryptjs'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (b) ────────────────────────────────────────────────────────
  it("allows the import in lib/adapters/bcrypt/**/*.ts (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/bcrypt/PasswordHasher.ts",
      "import bcrypt from 'bcryptjs'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (c) ────────────────────────────────────────────────────────
  it("reports the configured bcryptjs custom-message text verbatim", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import bcrypt from 'bcryptjs'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(BCRYPT_FORBIDDEN_MESSAGE);
  });
});

describe("F-12 no-restricted-imports — @anthropic-ai/sdk may only live in lib/adapters/anthropic", () => {
  // ── (a) ────────────────────────────────────────────────────────
  it("reports an error when @anthropic-ai/sdk is imported from app/api", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import Anthropic from '@anthropic-ai/sdk'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (b) ────────────────────────────────────────────────────────
  it("allows the import in lib/adapters/anthropic/**/*.ts (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/anthropic/LLMExtractor.ts",
      "import Anthropic from '@anthropic-ai/sdk'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (c) ────────────────────────────────────────────────────────
  it("reports the configured @anthropic-ai/sdk custom-message text verbatim", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import Anthropic from '@anthropic-ai/sdk'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(ANTHROPIC_FORBIDDEN_MESSAGE);
  });
});
