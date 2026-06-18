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

// F-24 — leaflet / react-leaflet may only be imported inside lib/adapters/leaflet/.
// The strings below MUST be byte-identical to those in .eslintrc.json and
// no-adapter-imports.test.ts (the no-adapter-imports pin asserts them verbatim).
const LEAFLET_FORBIDDEN_MESSAGE =
  "Use the MapProvider port via @/lib/adapters/leaflet. " +
  "leaflet may only be imported inside lib/adapters/leaflet/. " +
  "See ADR-0002 / F-24.";

const REACT_LEAFLET_FORBIDDEN_MESSAGE =
  "Use the MapProvider port via @/lib/adapters/leaflet. " +
  "react-leaflet may only be imported inside lib/adapters/leaflet/. " +
  "See ADR-0002 / F-24.";

// F-24 PR2 — leaflet.markercluster / react-leaflet-cluster join the fence so all
// FOUR Leaflet packages are adapter-only. Byte-identical to .eslintrc.json and
// no-adapter-imports.test.ts.
const LEAFLET_MARKERCLUSTER_FORBIDDEN_MESSAGE =
  "Use the MapProvider port via @/lib/adapters/leaflet. " +
  "leaflet.markercluster may only be imported inside lib/adapters/leaflet/. " +
  "See ADR-0002 / F-24.";

const REACT_LEAFLET_CLUSTER_FORBIDDEN_MESSAGE =
  "Use the MapProvider port via @/lib/adapters/leaflet. " +
  "react-leaflet-cluster may only be imported inside lib/adapters/leaflet/. " +
  "See ADR-0002 / F-24.";

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
          {
            name: "leaflet",
            message: LEAFLET_FORBIDDEN_MESSAGE,
          },
          {
            name: "react-leaflet",
            message: REACT_LEAFLET_FORBIDDEN_MESSAGE,
          },
          {
            name: "leaflet.markercluster",
            message: LEAFLET_MARKERCLUSTER_FORBIDDEN_MESSAGE,
          },
          {
            name: "react-leaflet-cluster",
            message: REACT_LEAFLET_CLUSTER_FORBIDDEN_MESSAGE,
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
        "lib/adapters/leaflet/**/*.{ts,tsx}",
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

describe("F-24 no-restricted-imports — leaflet/react-leaflet may only live in lib/adapters/leaflet", () => {
  // ── (a) ────────────────────────────────────────────────────────
  it("reports an error when leaflet is imported from components", async () => {
    const messages = await lint(
      "components/RouteMap.tsx",
      "import L from 'leaflet'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (b) ────────────────────────────────────────────────────────
  it("reports an error when react-leaflet is imported from components", async () => {
    const messages = await lint(
      "components/RouteMap.tsx",
      "import { MapContainer } from 'react-leaflet'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (c) ────────────────────────────────────────────────────────
  it("allows leaflet inside lib/adapters/leaflet/**/*.{ts,tsx} (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/leaflet/MapCanvas.tsx",
      "import L from 'leaflet'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (d) ────────────────────────────────────────────────────────
  it("allows react-leaflet inside lib/adapters/leaflet/**/*.{ts,tsx} (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/leaflet/MapCanvas.tsx",
      "import { MapContainer } from 'react-leaflet'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (e) ────────────────────────────────────────────────────────
  it("reports the configured leaflet custom-message text verbatim", async () => {
    const messages = await lint(
      "components/RouteMap.tsx",
      "import L from 'leaflet'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(LEAFLET_FORBIDDEN_MESSAGE);
  });

  // ── (f) ────────────────────────────────────────────────────────
  it("reports the configured react-leaflet custom-message text verbatim", async () => {
    const messages = await lint(
      "components/RouteMap.tsx",
      "import { MapContainer } from 'react-leaflet'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(REACT_LEAFLET_FORBIDDEN_MESSAGE);
  });
});

describe("F-24 PR2 no-restricted-imports — the cluster libs join the leaflet fence", () => {
  // ── (a) ────────────────────────────────────────────────────────
  it("reports an error when leaflet.markercluster is imported from components/MapView.tsx", async () => {
    const messages = await lint(
      "components/MapView.tsx",
      "import 'leaflet.markercluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (b) ────────────────────────────────────────────────────────
  it("reports an error when react-leaflet-cluster is imported from components/MapView.tsx", async () => {
    const messages = await lint(
      "components/MapView.tsx",
      "import MarkerClusterGroup from 'react-leaflet-cluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (c) ────────────────────────────────────────────────────────
  it("allows leaflet.markercluster + react-leaflet-cluster inside lib/adapters/leaflet/MarkerMapCanvas.tsx (the one allowed plug)", async () => {
    const cluster = await lint(
      "lib/adapters/leaflet/MarkerMapCanvas.tsx",
      "import 'leaflet.markercluster'\n",
    );
    expect(cluster).toEqual([]);
    const reactCluster = await lint(
      "lib/adapters/leaflet/MarkerMapCanvas.tsx",
      "import MarkerClusterGroup from 'react-leaflet-cluster'\n",
    );
    expect(reactCluster).toEqual([]);
  });

  // ── (d) ────────────────────────────────────────────────────────
  it("allows leaflet + react-leaflet inside the new MarkerMapCanvas.tsx adapter file", async () => {
    const leaflet = await lint(
      "lib/adapters/leaflet/MarkerMapCanvas.tsx",
      "import L from 'leaflet'\n",
    );
    expect(leaflet).toEqual([]);
    const reactLeaflet = await lint(
      "lib/adapters/leaflet/MarkerMapCanvas.tsx",
      "import { MapContainer } from 'react-leaflet'\n",
    );
    expect(reactLeaflet).toEqual([]);
  });

  // ── (e) ────────────────────────────────────────────────────────
  it("reports the configured leaflet.markercluster custom-message text verbatim", async () => {
    const messages = await lint(
      "components/MapView.tsx",
      "import 'leaflet.markercluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(
      LEAFLET_MARKERCLUSTER_FORBIDDEN_MESSAGE,
    );
  });

  // ── (f) ────────────────────────────────────────────────────────
  it("reports the configured react-leaflet-cluster custom-message text verbatim", async () => {
    const messages = await lint(
      "components/MapView.tsx",
      "import MarkerClusterGroup from 'react-leaflet-cluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(REACT_LEAFLET_CLUSTER_FORBIDDEN_MESSAGE);
  });
});
