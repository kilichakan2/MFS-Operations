/**
 * tests/e2e/_previewProbe.ts
 *
 * F-INFRA-02 — remote-only Playwright globalSetup: the DB identity
 * probe. Before ANY spec runs against a remote preview deployment,
 * four escalating checks must prove the deployed server is reading a
 * disposable, seed-born database — never production. One failure
 * aborts the whole run (fail closed): no fallback, no retry, no spec
 * executes.
 *
 * Checks (read-through-the-server, modelled on F-TD-03's D4 rule —
 * read through the deployed app, never write business data):
 *   1. Gate:     GET /login answers < 500 with the bypass headers
 *                (401 = bypass secret wrong — distinct error).
 *   2. Seeded:   GET /api/auth/team (public) lists ANVIL-TEST-sales.
 *   3. Hash:     POST /api/auth/kds-pin with E2E_PIN_BUTCHER returns
 *                ANVIL-TEST-butcher — the DB holds the exact bcrypt
 *                hash this repo's seed.sql plants (sets no cookies,
 *                writes nothing).
 *   4. Sentinel: log in as ANVIL-TEST-sales, GET /api/reference with
 *                the session cookies, and require the fixed-UUID
 *                seed-sentinel customer row. That UUID exists only in
 *                databases created from supabase/seed.sql — production
 *                can never contain it. (Login's only write is
 *                last_login_at on the ANVIL-TEST user — fixture-scoped.)
 *
 * Secrets discipline: PIN values and the bypass secret are never
 * included in any log or error message.
 */

import type { FullConfig } from "@playwright/test";

export const SENTINEL_ID = "a417e57e-0000-4e2e-a000-000000000001";
export const SENTINEL_NAME = "ANVIL-TEST-SEED-SENTINEL";

interface ProbeEnv {
  bypassSecret?: string;
  pinSales?: string;
  pinButcher?: string;
}

function fail(check: string, detail: string): never {
  throw new Error(
    `Preview DB identity probe FAILED at ${check}.\n` +
      `${detail}\n` +
      "Most likely causes: Supabase preview branch missing / Supabase-Vercel " +
      "integration not wired / preview still pointing at prod credentials / " +
      "PIN-hash drift between .env.e2e.local and supabase/seed.sql / bypass " +
      "secret wrong. Fix the environment — never weaken this probe. " +
      "No spec has run and nothing was written. See docs/runbooks/preview-smoke.md.",
  );
}

function bypassHeaders(secret: string | undefined): Record<string, string> {
  if (!secret) return {};
  return {
    "x-vercel-protection-bypass": secret,
    "x-vercel-set-bypass-cookie": "true",
  };
}

/**
 * The probe itself — exported as a plain function taking a base URL so
 * it can be exercised against the local stack without faking remote
 * mode (step-3 dry runs).
 */
export async function probePreviewDb(
  baseUrl: string,
  env: ProbeEnv,
): Promise<void> {
  const base = baseUrl.replace(/\/$/, "");
  const headers = bypassHeaders(env.bypassSecret);

  if (!env.pinSales || !env.pinButcher) {
    fail(
      "preconditions",
      "E2E_PIN_SALES and/or E2E_PIN_BUTCHER are not set — load them from the gitignored .env.e2e.local.",
    );
  }

  // ── Check 1: gate ──────────────────────────────────────────────
  const gate = await fetch(`${base}/login`, { headers, redirect: "manual" });
  if (gate.status === 401) {
    fail(
      "check 1 (gate)",
      `GET /login returned 401 — Vercel rejected the bypass: the VERCEL_AUTOMATION_BYPASS_SECRET in .env.e2e.local is wrong or was rotated.`,
    );
  }
  if (gate.status >= 500) {
    fail(
      "check 1 (gate)",
      `GET /login returned HTTP ${gate.status} — the deployment is not healthy.`,
    );
  }

  // ── Check 2: seeded users ──────────────────────────────────────
  const team = await fetch(`${base}/api/auth/team`, { headers });
  if (team.status !== 200) {
    fail(
      "check 2 (seeded users)",
      `GET /api/auth/team returned HTTP ${team.status} (expected 200).`,
    );
  }
  const teamBody = (await team.json()) as Array<{ name?: string }>;
  if (
    !Array.isArray(teamBody) ||
    !teamBody.some((u) => u?.name === "ANVIL-TEST-sales")
  ) {
    fail(
      "check 2 (seeded users)",
      "GET /api/auth/team does not list ANVIL-TEST-sales — the database behind this deployment was NOT born from supabase/seed.sql.",
    );
  }

  // ── Check 3: hash identity ─────────────────────────────────────
  const kds = await fetch(`${base}/api/auth/kds-pin`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ pin: env.pinButcher }),
  });
  if (kds.status !== 200) {
    fail(
      "check 3 (hash identity)",
      `POST /api/auth/kds-pin returned HTTP ${kds.status} (expected 200) — the butcher PIN hash in this database does not match E2E_PIN_BUTCHER (PIN-hash drift, or wrong database).`,
    );
  }
  const kdsBody = (await kds.json()) as { name?: string };
  if (kdsBody?.name !== "ANVIL-TEST-butcher") {
    fail(
      "check 3 (hash identity)",
      "POST /api/auth/kds-pin matched a user other than ANVIL-TEST-butcher — fixture state is wrong.",
    );
  }

  // ── Check 4: seed sentinel (strongest) ─────────────────────────
  const login = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "ANVIL-TEST-sales",
      credential: env.pinSales,
    }),
  });
  if (login.status !== 200) {
    fail(
      "check 4 (seed sentinel)",
      `POST /api/auth/login as ANVIL-TEST-sales returned HTTP ${login.status} (expected 200) — sales PIN hash does not match E2E_PIN_SALES (PIN-hash drift, or wrong database).`,
    );
  }
  const setCookies = login.headers.getSetCookie();
  const cookieHeader = setCookies
    .map((c) => c.split(";")[0])
    .filter((c) => c.startsWith("mfs_"))
    .join("; ");
  if (!cookieHeader.includes("mfs_session=")) {
    fail(
      "check 4 (seed sentinel)",
      "Login succeeded but no mfs_session cookie was set — cannot read /api/reference.",
    );
  }

  const ref = await fetch(`${base}/api/reference`, {
    headers: { ...headers, Cookie: cookieHeader },
    redirect: "manual",
  });
  if (ref.status !== 200) {
    fail(
      "check 4 (seed sentinel)",
      `GET /api/reference returned HTTP ${ref.status} (expected 200).`,
    );
  }
  const refBody = (await ref.json()) as {
    customers?: Array<{ id?: string; name?: string }>;
  };
  const sentinel = (refBody.customers ?? []).find((c) => c?.id === SENTINEL_ID);
  if (!sentinel || sentinel.name !== SENTINEL_NAME) {
    fail(
      "check 4 (seed sentinel)",
      `The seed sentinel row (id ${SENTINEL_ID}) is NOT visible through this deployment. Only databases created from this repo's seed.sql contain it — this deployment may be reading PRODUCTION or an unseeded database.`,
    );
  }

  console.log(
    "[previewProbe] all 4 DB identity checks passed — deployment is reading a seed-born preview database.",
  );
}

/**
 * Playwright globalSetup entry point (remote mode only — wired in by
 * playwright.config.ts when BASE_URL is a non-localhost host).
 */
export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseUrl = config.projects[0]?.use?.baseURL ?? process.env.BASE_URL;
  if (!baseUrl) {
    fail("preconditions", "BASE_URL is not set — remote probe cannot run.");
  }
  await probePreviewDb(baseUrl, {
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET,
    pinSales: process.env.E2E_PIN_SALES,
    pinButcher: process.env.E2E_PIN_BUTCHER,
  });
}
