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
  "Use supabaseService from @/lib/adapters/supabase/client for app code, " +
  "or add an adapter under lib/adapters/supabase/ for vendor-specific operations. " +
  "See ADR-0003 (FREEZE rule).";

const FTD11_MESSAGE =
  "Services and use-cases depend on ports, never on adapters (ADR-0002). " +
  "Wire concretions in the composition root lib/wiring/ instead. See F-TD-11.";

// F-10 — the bcryptjs forbidden message. This is the drift-catcher pin: it is
// asserted verbatim against the SHIPPED .eslintrc.json (loaded from disk), so a
// typo in the config's bcryptjs message fails this test.
const BCRYPT_MESSAGE =
  "Use the PasswordHasher port via @/lib/wiring/password. " +
  "bcryptjs may only be imported inside lib/adapters/bcrypt/. " +
  "See ADR-0002 / F-10.";

// F-12 — the @anthropic-ai/sdk forbidden message. Drift-catcher pin: asserted
// verbatim against the SHIPPED .eslintrc.json (loaded from disk), so a typo in
// the config's message fails this test.
const ANTHROPIC_MESSAGE =
  "Use the LLMExtractor port via @/lib/wiring/llm. " +
  "@anthropic-ai/sdk may only be imported inside lib/adapters/anthropic/. " +
  "See ADR-0002 / F-12.";

// F-11 — the `resend` forbidden message. Drift-catcher pin: asserted verbatim
// against the SHIPPED .eslintrc.json (loaded from disk), so a typo in the
// config's message fails this test. Restated in BOTH the top-level paths block
// and the services/usecases override (legacy overrides REPLACE rule options —
// they do not merge), so both must carry it.
const RESEND_MESSAGE =
  "Use the Mailer port via @/lib/wiring/mailer. " +
  "resend may only be imported inside lib/adapters/resend/. " +
  "See ADR-0002 / F-11.";

// F-24 — the `leaflet` / `react-leaflet` forbidden messages. Drift-catcher pins:
// asserted verbatim against the SHIPPED .eslintrc.json (loaded from disk), so a
// typo in the config's message fails this test. Restated in BOTH the top-level
// paths block and the services/usecases override (legacy overrides REPLACE rule
// options — they do not merge), so both must carry them.
const LEAFLET_MESSAGE =
  "Use the MapProvider port via @/lib/adapters/leaflet. " +
  "leaflet may only be imported inside lib/adapters/leaflet/. " +
  "See ADR-0002 / F-24.";

const REACT_LEAFLET_MESSAGE =
  "Use the MapProvider port via @/lib/adapters/leaflet. " +
  "react-leaflet may only be imported inside lib/adapters/leaflet/. " +
  "See ADR-0002 / F-24.";

// F-24 PR2 — leaflet.markercluster / react-leaflet-cluster join the fence (all
// four Leaflet packages adapter-only). Drift-catcher pins: asserted verbatim
// against the SHIPPED .eslintrc.json (loaded from disk). Restated in BOTH the
// top-level paths block and the services/usecases override.
const LEAFLET_MARKERCLUSTER_MESSAGE =
  "Use the MapProvider port via @/lib/adapters/leaflet. " +
  "leaflet.markercluster may only be imported inside lib/adapters/leaflet/. " +
  "See ADR-0002 / F-24.";

const REACT_LEAFLET_CLUSTER_MESSAGE =
  "Use the MapProvider port via @/lib/adapters/leaflet. " +
  "react-leaflet-cluster may only be imported inside lib/adapters/leaflet/. " +
  "See ADR-0002 / F-24.";

// F-22 — the `jspdf` / `jspdf-autotable` forbidden messages. Drift-catcher pins:
// asserted verbatim against the SHIPPED .eslintrc.json (loaded from disk), so a
// typo in the config's message fails this test. Restated in BOTH the top-level
// paths block and the services/usecases override (legacy overrides REPLACE rule
// options — they do not merge), so both must carry them.
const JSPDF_MESSAGE =
  "Use the PdfRenderer port via @/lib/wiring/pdf. " +
  "jspdf may only be imported inside lib/adapters/jspdf/. " +
  "See ADR-0002 / F-22.";

const JSPDF_AUTOTABLE_MESSAGE =
  "Use the PdfRenderer port via @/lib/wiring/pdf. " +
  "jspdf-autotable may only be imported inside lib/adapters/jspdf/. " +
  "See ADR-0002 / F-22.";

// F-22 (conductor ruling) — the no-restricted-syntax DYNAMIC-import messages.
// The static no-restricted-imports ban only catches `import … from 'jspdf'`;
// the page used `await import('jspdf')` (a dynamic ImportExpression), which the
// static rule cannot see. These pins assert the dynamic-import ban verbatim
// against the SHIPPED .eslintrc.json so a typo or deletion fails the test.
const JSPDF_DYNAMIC_MESSAGE =
  "Dynamic import('jspdf') is banned outside lib/adapters/jspdf/. " +
  "Use the PdfRenderer port via @/lib/wiring/pdf. See ADR-0002 / F-22.";

const JSPDF_AUTOTABLE_DYNAMIC_MESSAGE =
  "Dynamic import('jspdf-autotable') is banned outside lib/adapters/jspdf/. " +
  "Use the PdfRenderer port via @/lib/wiring/pdf. See ADR-0002 / F-22.";

// F-25 — the `web-push` forbidden message. Drift-catcher pin: asserted verbatim
// against the SHIPPED .eslintrc.json (loaded from disk), so a typo in the
// config's message fails this test. Restated in BOTH the top-level paths block
// and the services/usecases override (legacy overrides REPLACE rule options —
// they do not merge), so both must carry it.
const WEB_PUSH_MESSAGE =
  "Use the PushSender port via @/lib/wiring/pushSender. " +
  "web-push may only be imported inside lib/adapters/web-push/. " +
  "See ADR-0002 / F-25.";

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

  // ── (8) F-10 ───────────────────────────────────────────────────
  it("bans bcryptjs inside lib/services (override RESTATES the bcryptjs path)", async () => {
    const messages = await lint(
      "lib/services/OrdersService.ts",
      "import bcrypt from 'bcryptjs'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (9) F-10 ───────────────────────────────────────────────────
  it("bans bcryptjs inside app/api routes", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import bcrypt from 'bcryptjs'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (10) F-10 ──────────────────────────────────────────────────
  it("allows bcryptjs inside lib/adapters/bcrypt (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/bcrypt/PasswordHasher.ts",
      "import bcrypt from 'bcryptjs'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (11) F-10 ──────────────────────────────────────────────────
  it("reports the shipped bcryptjs message text verbatim", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import bcrypt from 'bcryptjs'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(BCRYPT_MESSAGE);
  });

  // ── (12) F-12 ──────────────────────────────────────────────────
  it("bans @anthropic-ai/sdk inside lib/services (services override RESTATES the path)", async () => {
    const messages = await lint(
      "lib/services/OrdersService.ts",
      "import Anthropic from '@anthropic-ai/sdk'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (13) F-12 ──────────────────────────────────────────────────
  it("bans @anthropic-ai/sdk inside app/api routes", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import Anthropic from '@anthropic-ai/sdk'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (14) F-12 ──────────────────────────────────────────────────
  it("allows @anthropic-ai/sdk inside lib/adapters/anthropic (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/anthropic/LLMExtractor.ts",
      "import Anthropic from '@anthropic-ai/sdk'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (15) F-12 ──────────────────────────────────────────────────
  it("reports the shipped @anthropic-ai/sdk message text verbatim", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import Anthropic from '@anthropic-ai/sdk'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(ANTHROPIC_MESSAGE);
  });

  // ── (16) F-RLS-03 ──────────────────────────────────────────────
  // The new per-request authenticated client is built with `createClient`
  // from @supabase/supabase-js. No NEW lint rule is needed: the existing
  // F-04 ban on @supabase/supabase-js already fences `createClient` (and
  // therefore the anon-key authenticated client) inside the adapter folder.
  // This pin proves that wall stands for a route — so the anon client can't
  // be constructed in app code, and SUPABASE_JWT_SECRET has no createClient
  // to feed there.
  it("bans @supabase/supabase-js (the anon authenticated client's createClient) inside app/api routes", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
    expect(messages[0].message).toContain(F04_MESSAGE);
  });

  // ── (17) F-RLS-03 ──────────────────────────────────────────────
  // The new authenticatedClient module lives under lib/adapters/supabase/.
  // Like every other adapter it must not be imported from services/usecases
  // (F-TD-11 pattern ban) — wiring composes it. This pins the new surface
  // inside its adapter folder.
  it("bans importing the new authenticatedClient adapter from lib/services (F-TD-11 pattern)", async () => {
    const messages = await lint(
      "lib/services/Foo.ts",
      "import { authenticatedClientForCaller } from '@/lib/adapters/supabase/authenticatedClient'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
    expect(messages[0].message).toContain(FTD11_MESSAGE);
  });

  // ── (18) F-RLS-03 ──────────────────────────────────────────────
  // The authenticated client + requireServiceRole ARE allowed inside their
  // own adapter folder (the one place createClient is permitted). Sanity pin
  // that the override doesn't over-fence the new file.
  it("allows @supabase/supabase-js inside lib/adapters/supabase/authenticatedClient.ts (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/supabase/authenticatedClient.ts",
      "import { createClient } from '@supabase/supabase-js'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (19) F-11 ──────────────────────────────────────────────────
  it("bans resend inside lib/services (services override RESTATES the path)", async () => {
    const messages = await lint(
      "lib/services/OrdersService.ts",
      "import { Resend } from 'resend'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (20) F-11 ──────────────────────────────────────────────────
  it("bans resend inside app/api routes", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import { Resend } from 'resend'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (21) F-11 ──────────────────────────────────────────────────
  it("allows resend inside lib/adapters/resend (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/resend/Mailer.ts",
      "import { Resend } from 'resend'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (22) F-11 ──────────────────────────────────────────────────
  it("reports the shipped resend message text verbatim", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import { Resend } from 'resend'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(RESEND_MESSAGE);
  });

  // ── (23) F-24 ──────────────────────────────────────────────────
  it("bans leaflet inside components (the RouteMap surface this PR fixes)", async () => {
    const messages = await lint(
      "components/RouteMap.tsx",
      "import L from 'leaflet'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (24) F-24 ──────────────────────────────────────────────────
  it("bans react-leaflet inside lib/services (services override RESTATES the path)", async () => {
    const messages = await lint(
      "lib/services/Foo.ts",
      "import { MapContainer } from 'react-leaflet'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (25) F-24 ──────────────────────────────────────────────────
  it("bans leaflet inside app/api routes", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import L from 'leaflet'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (26) F-24 ──────────────────────────────────────────────────
  it("allows leaflet inside lib/adapters/leaflet (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/leaflet/MapCanvas.tsx",
      "import L from 'leaflet'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (27) F-24 ──────────────────────────────────────────────────
  it("allows react-leaflet inside lib/adapters/leaflet (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/leaflet/MapCanvas.tsx",
      "import { MapContainer } from 'react-leaflet'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (28) F-24 ──────────────────────────────────────────────────
  it("reports the shipped leaflet message text verbatim", async () => {
    const messages = await lint(
      "components/RouteMap.tsx",
      "import L from 'leaflet'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(LEAFLET_MESSAGE);
  });

  // ── (29) F-24 ──────────────────────────────────────────────────
  it("reports the shipped react-leaflet message text verbatim", async () => {
    const messages = await lint(
      "components/RouteMap.tsx",
      "import { MapContainer } from 'react-leaflet'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(REACT_LEAFLET_MESSAGE);
  });

  // ── (30) F-24 PR2 ──────────────────────────────────────────────
  it("bans leaflet.markercluster inside components (the MapView surface this PR fixes)", async () => {
    const messages = await lint(
      "components/MapView.tsx",
      "import 'leaflet.markercluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (31) F-24 PR2 ──────────────────────────────────────────────
  it("bans react-leaflet-cluster inside components (the MapView surface this PR fixes)", async () => {
    const messages = await lint(
      "components/MapView.tsx",
      "import MarkerClusterGroup from 'react-leaflet-cluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (32) F-24 PR2 ──────────────────────────────────────────────
  it("bans react-leaflet-cluster inside lib/services (services override RESTATES the path)", async () => {
    const messages = await lint(
      "lib/services/Foo.ts",
      "import MarkerClusterGroup from 'react-leaflet-cluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (33) F-24 PR2 ──────────────────────────────────────────────
  it("bans leaflet.markercluster inside app/api routes", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import 'leaflet.markercluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (34) F-24 PR2 ──────────────────────────────────────────────
  it("allows both cluster libs inside lib/adapters/leaflet/MarkerMapCanvas.tsx (the one allowed plug)", async () => {
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

  // ── (35) F-24 PR2 ──────────────────────────────────────────────
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

  // ── (36) F-24 PR2 ──────────────────────────────────────────────
  it("reports the shipped leaflet.markercluster message text verbatim", async () => {
    const messages = await lint(
      "components/MapView.tsx",
      "import 'leaflet.markercluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(LEAFLET_MARKERCLUSTER_MESSAGE);
  });

  // ── (37) F-24 PR2 ──────────────────────────────────────────────
  it("reports the shipped react-leaflet-cluster message text verbatim", async () => {
    const messages = await lint(
      "components/MapView.tsx",
      "import MarkerClusterGroup from 'react-leaflet-cluster'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(REACT_LEAFLET_CLUSTER_MESSAGE);
  });

  // ── (38) F-22 ──────────────────────────────────────────────────
  it("bans jspdf inside app/pricing (the page surface this PR fixes)", async () => {
    const messages = await lint(
      "app/pricing/page.tsx",
      "import { jsPDF } from 'jspdf'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (39) F-22 ──────────────────────────────────────────────────
  it("bans jspdf-autotable inside app/pricing (the page surface this PR fixes)", async () => {
    const messages = await lint(
      "app/pricing/page.tsx",
      "import autoTable from 'jspdf-autotable'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (40) F-22 ──────────────────────────────────────────────────
  it("bans jspdf inside lib/services (services override RESTATES the path)", async () => {
    const messages = await lint(
      "lib/services/Foo.ts",
      "import { jsPDF } from 'jspdf'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (41) F-22 ──────────────────────────────────────────────────
  it("bans jspdf-autotable inside app/api routes", async () => {
    const messages = await lint(
      "app/api/foo/route.ts",
      "import autoTable from 'jspdf-autotable'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (42) F-22 ──────────────────────────────────────────────────
  it("allows jspdf inside lib/adapters/jspdf (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/jspdf/JsPdfRenderer.ts",
      "import { jsPDF } from 'jspdf'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (43) F-22 ──────────────────────────────────────────────────
  it("allows jspdf-autotable inside lib/adapters/jspdf (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/jspdf/JsPdfRenderer.ts",
      "import autoTable from 'jspdf-autotable'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (44) F-22 ──────────────────────────────────────────────────
  it("reports the shipped jspdf message text verbatim", async () => {
    const messages = await lint(
      "app/pricing/page.tsx",
      "import { jsPDF } from 'jspdf'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(JSPDF_MESSAGE);
  });

  // ── (45) F-22 ──────────────────────────────────────────────────
  it("reports the shipped jspdf-autotable message text verbatim", async () => {
    const messages = await lint(
      "app/pricing/page.tsx",
      "import autoTable from 'jspdf-autotable'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(JSPDF_AUTOTABLE_MESSAGE);
  });

  // ── (46) F-22 (conductor ruling: harden the guard) ─────────────
  // The page imported jspdf DYNAMICALLY (`await import('jspdf')`), which
  // no-restricted-imports CANNOT see (it only catches static `import … from`).
  // A static-only ban left a hole exactly the shape of the pattern we removed:
  // someone could re-add `await import('jspdf')` to app code with lint green.
  // The no-restricted-syntax rule (ImportExpression selector) closes it.
  it("bans DYNAMIC import('jspdf') inside app/pricing (the hole the static ban missed)", async () => {
    const messages = await lint(
      "app/pricing/page.tsx",
      "async function f(){ const { jsPDF } = await import('jspdf') }\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-syntax");
    expect(messages[0].message).toContain(JSPDF_DYNAMIC_MESSAGE);
  });

  // ── (47) F-22 (conductor ruling) ───────────────────────────────
  it("bans DYNAMIC import('jspdf-autotable') inside app/pricing", async () => {
    const messages = await lint(
      "app/pricing/page.tsx",
      "async function f(){ const { default: autoTable } = await import('jspdf-autotable') }\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-syntax");
    expect(messages[0].message).toContain(JSPDF_AUTOTABLE_DYNAMIC_MESSAGE);
  });

  // ── (48) F-22 (conductor ruling) ───────────────────────────────
  // The dynamic ban also bites in services (inherited from the top-level
  // no-restricted-syntax rule — the services override only re-declares
  // no-restricted-imports, so no-restricted-syntax applies there too).
  it("bans DYNAMIC import('jspdf') inside lib/services (top-level rule inherited)", async () => {
    const messages = await lint(
      "lib/services/Foo.ts",
      "async function f(){ const { jsPDF } = await import('jspdf') }\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-syntax");
  });

  // ── (49) F-22 (conductor ruling) ───────────────────────────────
  // The adapter legitimately uses `await import('jspdf')` to keep the lazy
  // load — it MUST NOT be flagged. The override turns no-restricted-syntax
  // off for lib/adapters/jspdf/**.
  it("allows DYNAMIC import('jspdf') + import('jspdf-autotable') inside lib/adapters/jspdf (the lazy-load plug)", async () => {
    const jspdf = await lint(
      "lib/adapters/jspdf/JsPdfRenderer.ts",
      "async function f(){ const { jsPDF } = await import('jspdf') }\n",
    );
    expect(jspdf).toEqual([]);
    const autotable = await lint(
      "lib/adapters/jspdf/JsPdfRenderer.ts",
      "async function f(){ const { default: autoTable } = await import('jspdf-autotable') }\n",
    );
    expect(autotable).toEqual([]);
  });

  // ── (50) F-25 ──────────────────────────────────────────────────
  it("bans web-push inside app/api routes (the cron/notification surfaces this PR fixes)", async () => {
    const messages = await lint(
      "app/api/cron/haccp-alarm/route.ts",
      "import webpush from 'web-push'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (51) F-25 ──────────────────────────────────────────────────
  it("bans web-push inside lib/services (services override RESTATES the path)", async () => {
    const messages = await lint(
      "lib/services/Foo.ts",
      "import webpush from 'web-push'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (52) F-25 ──────────────────────────────────────────────────
  it("bans web-push inside lib/usecases", async () => {
    const messages = await lint(
      "lib/usecases/runHaccpAlarmCheck.ts",
      "import webpush from 'web-push'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].ruleId).toBe("no-restricted-imports");
  });

  // ── (53) F-25 ──────────────────────────────────────────────────
  it("allows web-push inside lib/adapters/web-push (the one allowed plug)", async () => {
    const messages = await lint(
      "lib/adapters/web-push/PushSender.ts",
      "import webpush from 'web-push'\n",
    );
    expect(messages).toEqual([]);
  });

  // ── (54) F-25 ──────────────────────────────────────────────────
  it("reports the shipped web-push message text verbatim", async () => {
    const messages = await lint(
      "app/api/cron/haccp-alarm/route.ts",
      "import webpush from 'web-push'\n",
    );
    expect(messages).toHaveLength(1);
    expect(messages[0].message).toContain(WEB_PUSH_MESSAGE);
  });
});
