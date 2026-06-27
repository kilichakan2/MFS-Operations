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
 *   9. No inline `node <<'NODE'` heredoc mixes `require(` with top-level `await`.
 *      Node >=20.19 (actions/setup-node node-version: 20) throws
 *      ERR_AMBIGUOUS_MODULE_SYNTAX (exit 1) before running a single line of such
 *      a script, making the step crash every time and the gate permanently RED.
 *      This is the exact defect the F-INFRA-03 Guard caught: assertions 1–8 all
 *      passed while the discover heredoc was 100% un-runnable. (F-INFRA-03 Guard.)
 *  10. The discover heredoc READS the preview host from Vercel's API-provided
 *      field (`branchAlias`, fallback `url`) — it does NOT construct the host by
 *      string-interpolating the branch name into a `-git-…` template. F-INFRA-03
 *      ANVIL caught this live: on a long branch the glued host's first DNS label
 *      was 82 chars (>63 limit), never resolved, and the readiness poll timed out
 *      for the full 12-min budget → gate permanently RED. (F-INFRA-03 ANVIL.)
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
    // Scan only the actual permissions block (top-level `permissions:` up to the
    // next top-level key) for any granted `write` scope — comment prose elsewhere
    // mentioning "no statuses: write" must not trip this.
    const block = yaml.match(/^permissions:\n((?:[ \t]+.*\n?)*)/m)?.[1] ?? "";
    expect(block).not.toMatch(/:\s*write\b/);
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
    // The job key sits under `jobs:` indented two spaces (comment lines may
    // intervene). Pinning it means a rename fails loud → the branch-protection
    // required-check context must be updated in lockstep.
    expect(yaml).toMatch(/^jobs:\n/m);
    expect(yaml).toMatch(/^ {2}smoke:\s*$/m);
    // …and there must be exactly ONE top-level job (a 2-space-indented `<key>:`
    // line that is not itself nested), so the reported check context is stable.
    const jobKeys = [...yaml.matchAll(/^ {2}([a-z0-9_-]+):\s*$/gim)]
      .map((m) => m[1])
      // exclude known 2-space keys that are NOT job keys (none expected, but be
      // defensive: `steps`/`with`/`env` are deeper-indented so won't match).
      .filter((k) => k === "smoke");
    expect(jobKeys).toEqual(["smoke"]);
  });

  it("9. inline node heredocs must not mix require() with top-level await (ERR_AMBIGUOUS_MODULE_SYNTAX)", () => {
    // F-INFRA-03 Guard: the original discover heredoc mixed top-level `await`
    // with `require('node:fs')`. Node >=20.19 (the version setup-node installs)
    // rejects that combination as ambiguous module syntax and exits 1 BEFORE
    // running any code, so the step crashed every run and the gate was
    // permanently RED — yet invariants 1–8 stayed green. This guards the whole
    // defect class without a yaml parser: extract every `node <<'NODE' … NODE`
    // heredoc and assert that within any single block, `require(` and a
    // top-level `await ` never coexist. The heredocs are small, so this raw
    // proxy (require present ⇒ await absent) is sound for this file.
    const yaml = readWorkflow();
    const heredocs = [...yaml.matchAll(/<<'NODE'\n([\s\S]*?)\n\s*NODE/g)].map(
      (m) => m[1],
    );
    expect(heredocs.length).toBeGreaterThan(0);
    for (const block of heredocs) {
      const hasRequire = /\brequire\(/.test(block);
      const hasAwait = /\bawait\s/.test(block);
      expect(hasRequire && hasAwait).toBe(false);
    }
  });

  it("10. discover step reads Vercel's branchAlias/url, never constructs the host from the branch name", () => {
    // F-INFRA-03 ANVIL: the discover step used to glue the branch into a
    // `mfs-operations-git-${sanitised}-${SCOPE}.vercel.app` template. On this
    // branch that made an 82-char first DNS label (>63 limit) that never
    // resolved, so the readiness poll timed out for 12 min and the gate was
    // permanently RED. The fix reads the API-provided host. Pin both halves:
    // the API field must be referenced, and the old constructed template must be
    // gone.
    const yaml = readWorkflow();
    // Must read Vercel's own alias field.
    expect(yaml).toContain("branchAlias");
    // Must NOT reconstruct the host from the branch via a -git- template…
    expect(yaml).not.toMatch(/`mfs-operations-git-\$\{/);
    // …and the old `aliasHost` construction variable must be gone.
    expect(yaml).not.toContain("aliasHost");
  });
});
