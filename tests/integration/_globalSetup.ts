/**
 * tests/integration/_globalSetup.ts
 *
 * Vitest globalSetup for the integration suite (F-TD-03). Makes
 * `npm run test:integration` self-contained AND production-safe:
 *
 *   1. Loads .env.test.local and refuses to run unless its
 *      NEXT_PUBLIC_SUPABASE_URL points at LOCAL Supabase
 *      (never the production project).
 *   2. Probes local Supabase (fast-fail if the stack is down).
 *   3. Boots `next dev` on a dedicated port (3100) with the local
 *      Supabase env passed EXPLICITLY — Next.js never overrides env
 *      vars already present in the process environment, so the
 *      spawned server cannot pick up .env.local's production values.
 *   4. Runs a DB identity probe: a sentinel user planted in the LOCAL
 *      database must be visible through the booted server's
 *      /api/auth/kds-pin route. If it isn't, the server is reading
 *      some other database — abort before any test traffic flows.
 *      (Probe direction matters: we write locally and READ through
 *      the server. Never probe by writing through the server — a
 *      mis-wired write would land in production.)
 *   5. Returns a teardown that removes the sentinel and kills the
 *      server's whole process group, with an exit-handler backstop so
 *      Ctrl-C never orphans the server.
 *
 * The runner ALWAYS boots its own server on INTEGRATION_PORT and never
 * reuses an existing one — see tests/integration/_config.ts.
 */

import { spawn, type ChildProcess } from "child_process";
import { connect } from "net";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import { parse } from "dotenv";
import bcrypt from "bcryptjs";
import {
  INTEGRATION_PORT,
  INTEGRATION_BASE_URL,
  INTEGRATION_CRON_SECRET,
} from "./_config";

const REPO_ROOT = resolve(__dirname, "../..");
const ENV_FILE = resolve(REPO_ROOT, ".env.test.local");
const NEXT_BIN = resolve(REPO_ROOT, "node_modules/.bin/next");
const PROD_REF = "uqgecljspgtevoylwkep";
const READY_TIMEOUT = 90_000; // first dev-mode compile is slow; bump to 120s if it flakes
const POLL_INTERVAL = 500;
const LOG_TAIL = 100; // ring buffer: last N lines of server output

// ── helpers ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Layer-1 guard: .env.test.local exists and points at LOCAL Supabase. */
function loadAndGuardEnv(): { supabaseUrl: string; serviceKey: string } {
  if (!existsSync(ENV_FILE)) {
    throw new Error(
      `.env.test.local not found at ${ENV_FILE}. ` +
        "Integration tests need it to wire the spawned dev server to LOCAL Supabase. " +
        "Create it with NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321 and the " +
        "local SUPABASE_SERVICE_ROLE_KEY (from `supabase status`).",
    );
  }

  const parsed = parse(readFileSync(ENV_FILE));
  const supabaseUrl = parsed.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = parsed.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const sessionSecret = parsed.SESSION_SECRET ?? "";

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      `.env.test.local is missing ${!supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : "SUPABASE_SERVICE_ROLE_KEY"}. ` +
        "Both are required to boot the integration dev server against local Supabase.",
    );
  }
  if (!sessionSecret) {
    throw new Error(
      ".env.test.local is missing SESSION_SECRET. The spawned dev server and " +
        "the test signing helper must share one secret or every fabricated " +
        "session bounces at the middleware (T1). Add any stable random string " +
        "≥32 bytes, e.g. from `openssl rand -base64 48`.",
    );
  }
  if (supabaseUrl.includes(PROD_REF)) {
    throw new Error(
      `⛔ .env.test.local's NEXT_PUBLIC_SUPABASE_URL points at the PRODUCTION project (${PROD_REF}). ` +
        "Integration tests must never touch production. Point it at http://localhost:54321.",
    );
  }
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(supabaseUrl)) {
    throw new Error(
      `.env.test.local's NEXT_PUBLIC_SUPABASE_URL is ${supabaseUrl} — not localhost/127.0.0.1. ` +
        "Integration tests only run against the local Supabase stack. " +
        "Set NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321.",
    );
  }

  // Populate this process's env too: _setup.ts (imported dynamically
  // below) reads these at module load. SESSION_SECRET reaches both the
  // vitest process (signing helper) and the spawned dev server (via
  // the `...process.env` spread in the spawn env).
  process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
  process.env.SESSION_SECRET = sessionSecret;

  return { supabaseUrl, serviceKey };
}

/**
 * D1 guard: the dedicated port must be free — we never reuse a server.
 * Probes by CONNECTING on both loopback families (a listen-probe on one
 * family misses servers bound dual-stack to the other, e.g. `python3 -m
 * http.server`, which binds IPv6).
 */
function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((res) => {
    const sock = connect({ host, port });
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      sock.destroy();
      res(ok);
    };
    sock.once("connect", () => done(true));
    sock.once("error", () => done(false));
    sock.setTimeout(1_000, () => done(false));
  });
}

async function assertPortFree(port: number): Promise<void> {
  const occupied =
    (await canConnect("127.0.0.1", port)) || (await canConnect("::1", port));
  if (occupied) {
    throw new Error(
      `Port ${port} is in use. The integration runner always boots its own server ` +
        "and never reuses one (it cannot verify a foreign server's Supabase wiring). " +
        "Free the port or set INTEGRATION_PORT.",
    );
  }
}

async function fetchStatus(
  url: string,
  timeoutMs: number,
): Promise<number | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "manual",
    });
    return res.status;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ── globalSetup ─────────────────────────────────────────────────────

export default async function globalSetup(): Promise<() => Promise<void>> {
  // 1. Env file guard (before anything is spawned)
  const { supabaseUrl, serviceKey } = loadAndGuardEnv();

  // 2. Local Supabase must be up (reuse the suite's own probe).
  //    Dynamic import: _setup.ts validates env at module load, so it
  //    must only be imported after loadAndGuardEnv() has populated it.
  const { assertLocalStackReachable, getServiceClient, TEST_PREFIX } =
    await import("./_setup");
  await assertLocalStackReachable();

  // 3. The dedicated port must be free
  await assertPortFree(INTEGRATION_PORT);

  // 4. Spawn `next dev` wired explicitly to local Supabase.
  //    Explicit env beats .env.local: Next.js never overwrites vars
  //    already present in the child's environment.
  const child: ChildProcess = spawn(
    NEXT_BIN,
    ["dev", "-p", String(INTEGRATION_PORT)],
    {
      cwd: REPO_ROOT,
      detached: true, // own process group — we kill the whole group
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        PORT: String(INTEGRATION_PORT),
        // F-TD-09 I4: the purge cron route validates Bearer ${CRON_SECRET}.
        // Inject the shared test secret so the I4 200-path can authenticate.
        // A real CRON_SECRET in this process's env wins (INTEGRATION_CRON_SECRET
        // already prefers it); otherwise the throwaway test value is used.
        CRON_SECRET: INTEGRATION_CRON_SECRET,
      },
    },
  );

  const logTail: string[] = [];
  const capture = (chunk: Buffer) => {
    for (const line of chunk.toString().split("\n")) {
      if (!line.trim()) continue;
      logTail.push(line);
      if (logTail.length > LOG_TAIL) logTail.shift();
    }
  };
  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  let childExited = false;
  child.once("exit", () => {
    childExited = true;
  });

  let killed = false;
  const killServer = async (): Promise<void> => {
    if (killed) return;
    killed = true;
    if (childExited || child.pid === undefined) return;
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      /* group already gone */
    }
    const deadline = Date.now() + 5_000;
    while (!childExited && Date.now() < deadline) await sleep(100);
    if (!childExited) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* group already gone */
      }
    }
  };

  // Backstop: never orphan the server, even on Ctrl-C / hard exits.
  // process.kill is synchronous, so this is exit-handler safe.
  const exitBackstop = () => {
    if (!childExited && child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* group already gone */
      }
    }
  };
  process.once("exit", exitBackstop);
  process.once("SIGINT", exitBackstop);
  process.once("SIGTERM", exitBackstop);

  // Sentinel bookkeeping for the identity probe (deleted in every path)
  const supa = getServiceClient();
  let sentinelId: string | null = null;
  const deleteSentinel = async (): Promise<void> => {
    if (!sentinelId) return;
    await supa.from("users").delete().eq("id", sentinelId);
    sentinelId = null;
  };

  // Everything after the spawn must kill the child before throwing.
  try {
    // 5. Poll readiness
    const readyUrl = `${INTEGRATION_BASE_URL}/login`;
    const deadline = Date.now() + READY_TIMEOUT;
    let ready = false;
    while (Date.now() < deadline) {
      if (childExited) {
        throw new Error(
          `Integration dev server exited before becoming ready.\n` +
            `--- last server output ---\n${logTail.join("\n")}`,
        );
      }
      const status = await fetchStatus(readyUrl, 2_000);
      if (status !== null && status < 500) {
        ready = true;
        break;
      }
      await sleep(POLL_INTERVAL);
    }
    if (!ready) {
      throw new Error(
        `Integration dev server not ready at ${readyUrl} after ${READY_TIMEOUT / 1000}s.\n` +
          `--- last server output ---\n${logTail.join("\n")}`,
      );
    }

    // 6. DB identity probe: plant a sentinel in the LOCAL DB, then read
    //    it back THROUGH the booted server. Proves the server's Supabase
    //    wiring without writing anything through the server.
    const pin = String(Math.floor(10_000_000 + Math.random() * 90_000_000)); // random 8 digits
    const name = `${TEST_PREFIX}sentinel-${Math.random().toString(36).slice(2, 10)}`;
    const hash = await bcrypt.hash(pin, 10);
    const { data: sentinel, error: insErr } = await supa
      .from("users")
      .insert({ name, role: "butcher", active: true, pin_hash: hash })
      .select("id")
      .single();
    if (insErr || !sentinel) {
      throw new Error(
        `Identity probe could not insert its sentinel user in the local DB: ${insErr?.message}`,
      );
    }
    sentinelId = sentinel.id;

    const probeRes = await fetch(`${INTEGRATION_BASE_URL}/api/auth/kds-pin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const probeBody = (await probeRes.json().catch(() => null)) as {
      id?: string;
    } | null;
    if (probeRes.status !== 200 || probeBody?.id !== sentinelId) {
      throw new Error(
        "⛔ Spawned dev server is not reading the local Supabase database — refusing to run tests. " +
          "Check .env.test.local. " +
          `(identity probe: HTTP ${probeRes.status}, id ${probeBody?.id ?? "none"} vs sentinel ${sentinelId})`,
      );
    }
    await deleteSentinel();
  } catch (err) {
    await deleteSentinel().catch(() => {
      /* best effort */
    });
    await killServer();
    throw err;
  }

  // 7. Teardown
  return async () => {
    await deleteSentinel().catch(() => {
      /* best effort */
    });
    await killServer();
  };
}
