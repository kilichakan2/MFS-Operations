/**
 * tests/unit/ci/preview-smoke-workflow.test.ts
 *
 * F-INFRA-03 — the regression guard that pins the CI preview-smoke gate so it
 * cannot silently rot. There is NO yaml parser in the dep tree (deliberate — see
 * the plan's "do NOT add a yaml parser" note), so these are raw-text / regex
 * assertions over `.github/workflows/preview-smoke.yml`, the same posture as the
 * F-27 / F-RLS-final lint guards in `tests/unit/lint/*`.
 *
 * Each assertion guards a way the blocking gate could silently break:
 *   1. The file exists at all.
 *   2. It triggers on `pull_request` (opened/synchronize/reopened) — the same
 *      deterministic event preview-cred-sync.yml keys off.
 *   3. It runs the smoke with `--unprotected` (protection is OFF this sprint —
 *      F-INFRA-02). This is the EXACT line F-INFRA-04 will later remove; if a
 *      future edit drops the flag without re-enabling protection, this goes RED.
 *   4. It is fail-closed on readiness — references `/api/auth/team` and a finite
 *      timeout, not an unbounded / swallowed wait (the F-INFRA-06 anti-pattern).
 *   5. No `|| true` / `continue-on-error: true` that would green-skip a failure.
 *   6. Permissions are least-privilege (`contents: read`, no write scopes).
 *   7. Only first-party `actions/*` actions (no third-party marketplace action).
 *   8. The job key is `smoke` — the documented required-check context. A rename
 *      must fail LOUD so branch protection is updated in lockstep (otherwise the
 *      required check silently never blocks).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const ROOT = process.cwd();
const WORKFLOW_PATH = join(ROOT, ".github", "workflows", "preview-smoke.yml");

function readWorkflow(): string {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

describe("preview-smoke CI workflow (F-INFRA-03)", () => {
  it("1. the workflow file exists", () => {
    expect(existsSync(WORKFLOW_PATH)).toBe(true);
  });

  it("2. triggers on pull_request (opened, synchronize, reopened)", () => {
    const yaml = readWorkflow();
    expect(yaml).toMatch(/^on:/m);
    expect(yaml).toMatch(/pull_request:/);
    // The three PR event types the smoke cares about (NOT `closed` — nothing to
    // smoke on close). Order-independent.
    for (const type of ["opened", "synchronize", "reopened"]) {
      expect(yaml).toContain(type);
    }
    expect(yaml).not.toMatch(/types:.*\bclosed\b/);
  });

  it("3. runs the smoke with --unprotected (the F-INFRA-04 touch point)", () => {
    const yaml = readWorkflow();
    expect(yaml).toContain("test:e2e:preview");
    expect(yaml).toContain("--unprotected");
  });

  it("4. is fail-closed on readiness — polls /api/auth/team with a finite timeout", () => {
    const yaml = readWorkflow();
    expect(yaml).toContain("/api/auth/team");
    // A finite readiness budget must exist (a number of seconds/minutes), never
    // an unbounded loop. The workflow pins a 12-minute (720s) ceiling.
    expect(yaml).toMatch(/READINESS_TIMEOUT|720|12 ?min/i);
  });

  it("5. no green-skip — no `|| true` or `continue-on-error: true` swallowing a failure", () => {
    const yaml = readWorkflow();
    expect(yaml).not.toContain("|| true");
    expect(yaml).not.toMatch(/continue-on-error:\s*true/);
  });

  it("6. least-privilege permissions — contents: read, no write scopes", () => {
    const yaml = readWorkflow();
    expect(yaml).toMatch(/permissions:\s*\n\s*contents:\s*read/);
    expect(yaml).not.toMatch(/:\s*write\b/);
  });

  it("7. only first-party actions/* actions (no third-party marketplace action)", () => {
    const yaml = readWorkflow();
    const uses = [...yaml.matchAll(/^\s*-?\s*uses:\s*(\S+)/gm)].map((m) => m[1]);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) {
      expect(u.startsWith("actions/")).toBe(true);
    }
  });

  it("8. the job key is `smoke` — the documented required-check context", () => {
    const yaml = readWorkflow();
    // The job key sits directly under `jobs:` indented two spaces. Pinning it
    // means a rename fails loud → branch-protection context must be updated too.
    expect(yaml).toMatch(/^jobs:\s*\n\s{2}smoke:/m);
  });
});
