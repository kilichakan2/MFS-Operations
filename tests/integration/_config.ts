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
