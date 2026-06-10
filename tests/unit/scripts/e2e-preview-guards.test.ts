/**
 * tests/unit/scripts/e2e-preview-guards.test.ts
 *
 * F-INFRA-02 — "guard the guards": black-box tests for scripts/e2e-preview.mjs.
 *
 * The script is the Gate-4 preview smoke wrapper. Its entire value is that it
 * fails CLOSED: any URL that is not unambiguously a Vercel PREVIEW deployment
 * of this project must be refused before a single network request or
 * Playwright process is started. These tests spawn the real script as a child
 * process with hostile inputs and assert each refusal:
 *
 *   - exits non-zero
 *   - prints the right refusal message class to stderr
 *   - never reaches the "running @critical specs" launch line (proof the
 *     refusal happened BEFORE any fetch / Playwright spawn)
 *   - returns near-instantly (no network round-trip is needed to refuse)
 *
 * The child runs with a temp-dir cwd (so the repo's gitignored .env.e2e.local
 * can never leak a real bypass secret into the test) and a minimal env (no
 * BASE_URL, no VERCEL_AUTOMATION_BYPASS_SECRET unless a test sets one).
 */

import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve(__dirname, "../../../scripts/e2e-preview.mjs");

// Generous wall-clock ceiling for a refusal. A real Playwright launch or any
// network round-trip would blow well past this; a fail-closed refusal is just
// node start-up + argv parsing.
const REFUSAL_MS = 5_000;
const KILL_MS = 15_000;

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

function runScript(
  args: string[],
  extraEnv: Record<string, string> = {},
): RunResult {
  // Isolated cwd: dotenv resolves '.env.e2e.local' against cwd, so a temp
  // dir guarantees the developer's real secrets file is never loaded.
  const cwd = mkdtempSync(join(tmpdir(), "anvil-e2e-preview-guard-"));
  const started = Date.now();
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd,
    timeout: KILL_MS,
    encoding: "utf8",
    env: {
      // Minimal env: PATH only (needed if the script ever shells out), plus
      // whatever the individual test injects. Crucially NO BASE_URL and NO
      // VERCEL_AUTOMATION_BYPASS_SECRET unless the test provides them.
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test", // project ProcessEnv augmentation requires it; the script never reads it
      ...extraEnv,
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    durationMs: Date.now() - started,
    timedOut:
      result.error?.name === "Error" && /ETIMEDOUT/.test(String(result.error)),
  };
}

function expectFailClosedRefusal(run: RunResult, messageClass: RegExp): void {
  // Refusal must exit non-zero.
  expect(run.status).not.toBeNull();
  expect(run.status).not.toBe(0);
  // The right refusal message, on stderr, with the script's prefix.
  expect(run.stderr).toContain("[e2e-preview]");
  expect(run.stderr).toMatch(messageClass);
  // Proof the refusal happened BEFORE any fetch / Playwright spawn: the
  // launch banner is printed immediately before spawning Playwright, so a
  // refused run must never produce it.
  expect(run.stdout).not.toContain("running @critical specs");
  expect(run.stderr).not.toContain("running @critical specs");
  // No network round-trip is needed to refuse — it must be near-instant.
  expect(run.timedOut).toBe(false);
  expect(run.durationMs).toBeLessThan(REFUSAL_MS);
}

// A URL that legitimately matches the project's Vercel preview pattern —
// used to prove the secret guard fires even when the URL itself is fine.
// The scope slug must be the project's exact pinned Vercel scope: a URL
// with any other scope slug is refused by the hostname guard (see the
// foreign-scope test below).
const VALID_PREVIEW_URL =
  "https://mfs-operations-git-foo-hakan-kilics-projects-2c54f03f.vercel.app";

describe("scripts/e2e-preview.mjs fail-closed guards (black-box)", () => {
  it("refuses the production hostname mfs-operations.vercel.app", () => {
    const run = runScript(["https://mfs-operations.vercel.app"]);
    expectFailClosedRefusal(run, /looks like PRODUCTION/);
  });

  it("refuses any hostname containing -git-main- (production alias)", () => {
    const run = runScript([
      "https://mfs-operations-git-main-hakan-kilics-projects-2c54f03f.vercel.app",
    ]);
    expectFailClosedRefusal(run, /looks like PRODUCTION/);
  });

  it("refuses a plain http:// URL — preview smokes are https-only", () => {
    const run = runScript([
      "http://mfs-operations-git-foo-hakan-kilics-projects-2c54f03f.vercel.app",
    ]);
    expectFailClosedRefusal(run, /https-only/);
  });

  it("refuses a hostname outside vercel.app (does not match the preview pattern)", () => {
    const run = runScript(["https://evil-lookalike.example.com"]);
    expectFailClosedRefusal(
      run,
      /does not match this project's Vercel preview/,
    );
  });

  it("refuses a vercel.app hostname that is not this project's preview pattern", () => {
    const run = runScript([
      "https://someone-elses-app-git-feat-x-scope.vercel.app",
    ]);
    expectFailClosedRefusal(
      run,
      /does not match this project's Vercel preview/,
    );
  });

  it("refuses a preview-shaped vercel.app URL from a FOREIGN Vercel scope slug", () => {
    // Looks exactly like one of our previews except the scope slug is not
    // this project's pinned slug — must be refused by the hostname guard.
    const run = runScript([
      "https://mfs-operations-git-foo-other-scope.vercel.app",
    ]);
    expectFailClosedRefusal(
      run,
      /does not match this project's Vercel preview/,
    );
  });

  it("refuses a URL containing the production Supabase project ref", () => {
    const run = runScript([
      "https://mfs-operations-git-foo-hakan-kilics-projects-2c54f03f.vercel.app/?ref=uqgecljspgtevoylwkep",
    ]);
    expectFailClosedRefusal(run, /looks like PRODUCTION/);
  });

  it("refuses an unparseable URL string (fail closed, not crash)", () => {
    const run = runScript(["not a url at all"]);
    expectFailClosedRefusal(run, /not a valid URL/);
  });

  it("refuses a valid preview URL when VERCEL_AUTOMATION_BYPASS_SECRET is missing", () => {
    const run = runScript([VALID_PREVIEW_URL]);
    expectFailClosedRefusal(run, /bypass secret missing/);
  });

  it("refuses a valid preview URL when the bypass secret is too short to be real", () => {
    const run = runScript([VALID_PREVIEW_URL], {
      VERCEL_AUTOMATION_BYPASS_SECRET: "short",
    });
    expectFailClosedRefusal(run, /bypass secret missing/);
  });

  it("refuses to run with no URL argument and prints usage", () => {
    const run = runScript([]);
    expectFailClosedRefusal(run, /no preview URL given/);
    expect(run.stderr).toContain("Usage: npm run test:e2e:preview");
  });

  it("never prints the bypass secret in any refusal output", () => {
    const secret = "super-secret-value-that-must-never-leak-0123456789";
    const run = runScript(["https://mfs-operations.vercel.app"], {
      VERCEL_AUTOMATION_BYPASS_SECRET: secret,
    });
    expect(run.status).not.toBe(0);
    expect(run.stdout).not.toContain(secret);
    expect(run.stderr).not.toContain(secret);
  });
});
