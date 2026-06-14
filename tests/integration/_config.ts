/**
 * tests/integration/_config.ts
 *
 * Single source of truth for the integration-test server port + base
 * URL. Imported by _globalSetup.ts (which boots the server),
 * _setup.ts (whose api() helper calls it) and _assertStack.ts (which
 * probes it) — so the booted server and the tests can never disagree
 * on the URL.
 *
 * The runner always boots its OWN server on a dedicated port (3100 by
 * default) and never reuses an already-running one: a foreign server's
 * Supabase wiring cannot be verified from outside, and a dev server on
 * port 3000 is typically wired to .env.local (production). Override
 * the port with INTEGRATION_PORT if 3100 is taken.
 */

export const INTEGRATION_PORT =
  Number.parseInt(process.env.INTEGRATION_PORT ?? "", 10) || 3100;

export const INTEGRATION_BASE_URL = `http://localhost:${INTEGRATION_PORT}`;

/**
 * Shared cron secret for the integration suite (F-TD-09 I4).
 *
 * The purge route (app/api/cron/purge-idempotency-keys) authenticates
 * with `Authorization: Bearer ${process.env.CRON_SECRET}`. The spawned
 * dev server and the test that calls it must agree on this value, so —
 * exactly like the port/URL above — it lives here as the single source
 * of truth rather than in the (harness-shielded, optional) env file.
 *
 * `_globalSetup.ts` injects this into the spawned server's environment,
 * and the I4 test reads it to build the Bearer header. A real CRON_SECRET
 * already present in the environment wins (so a developer can still
 * override locally); otherwise this throwaway value is used. It never
 * leaves the local test process — production cron uses the real secret.
 */
export const INTEGRATION_CRON_SECRET =
  process.env.CRON_SECRET && process.env.CRON_SECRET.length > 0
    ? process.env.CRON_SECRET
    : "anvil-test-cron-secret-f-td-09";
