# F-TD-15 residual (b) — Migration-filename reconciliation

**Unit:** F-TD-15 residual (b)
**Date:** 2026-06-15
**Branches from:** `main` @ `855553e` (NOT the current `feat/f-infra-05-preview-cred-sync` branch)
**Baselines on main:** tsc 0 · lint 0 · unit 1595 · integration 126
**FORGE phase:** Order (this plan) → Render → Guard → ANVIL → Ship

---

## Mini-map

```
DOMAIN (core logic)        ← UNCHANGED, not touched
  └─ (no port/adapter change)
supabase/migrations/  ← 4 files renamed (git mv, byte-identical)
tests/unit/migrations/ ← 1 new convention-guard test
CLAUDE.md · BACKLOG.md ← docs codify the rule + log prod divergence
🗣 This unit renames 4 database setup scripts so Supabase stops choking, and adds a tripwire so a bad name can never sneak back in. No app logic moves.
```

---

## 1. Objective

The repo's 4 oldest migration files use a short `YYYYMMDD_NNN_name.sql` name. Supabase's
**preview-branch resync** parser rejects these as malformed on a branch's 2nd+ push, so the
recorded versions show up as "not found in local migrations directory" and the branch flips to
`status=MIGRATIONS_FAILED`. That fail-closed status blocks the preview smoke, F-INFRA-05's live
proof, and F-RLS-04a.

> **🗣 In plain English:** A "migration" is a numbered setup script that builds the database
> tables. Supabase rebuilds a throwaway "preview" copy of the database from these script files
> every time you push code. The first push is forgiving, but on the second push Supabase reads the
> filenames strictly — and 4 of our files have old-style short names it now refuses. When it
> refuses, it marks the whole preview database "broken", which jams up everything downstream that
> waits for a healthy preview.

**This unit:** rename the 4 files to the full 14-digit `YYYYMMDDHHMMSS_name.sql` form (content
untouched), add a test that fails if any migration filename ever drifts back, fix doc references
that point at the old paths, codify the rule in CLAUDE.md, and log the separately-discovered prod
history divergence as new backlog item F-TD-18.

**Explicitly OUT of scope** (reduced spec, Hakan-approved): no change to **prod**
`schema_migrations`; no schema DDL; no application code; no new dependency. Prod is reached only via
`apply_migration` (append-only) and preview branches build from files, never from prod's recorded
history — so prod's history is irrelevant to the bug being fixed here.

> **🗣 In plain English:** We are NOT touching the live production database's internal bookkeeping.
> The original brief wanted to, but we proved the preview branches don't read it, so leaving it
> alone removes all production risk from this change.

---

## 2. Domain terms

- **Migration** — a numbered SQL setup script in `supabase/migrations/`. 🗣 A build step for the
  database; running them in order assembles the whole schema from scratch.
- **`schema_migrations` / "recorded version"** — a table inside each database listing which
  migrations have already run, keyed by the digits at the front of the filename. 🗣 The database's
  checklist of "scripts I've already applied"; the version is the number it tears off the filename.
- **Preview branch** — a temporary throwaway Supabase database Supabase spins up per PR, built by
  re-running the repo's migration files. 🗣 A disposable rehearsal copy of the database for one pull
  request.
- **Resync (2nd+ push)** — when a branch already exists and you push again, Supabase compares the
  branch's recorded versions to the local files and reconciles. 🗣 On the rehearsal copy's second
  rehearsal, Supabase double-checks its checklist against the files — and that stricter check is
  where the old names get rejected.
- **`git mv`** — a rename that Git records as a move, preserving file history. 🗣 Renaming the file
  the careful way, so the change reads as "renamed" not "deleted one, created another".

---

## 3. Compliance / architecture flags

- **Hexagonal verdict: N/A.** This unit touches `supabase/migrations/` (DB build scripts),
  `tests/unit/migrations/` (a test), and two `.md` docs. No `lib/` change, no port added or used,
  no adapter, no vendor SDK import, no `package.json` entry. The rip-out test does not apply (no
  external dependency wiring changes).
  > **🗣 In plain English:** The Lego rules (core logic owns the sockets, vendors plug in) don't
  > apply here because we aren't touching any logic or any vendor connection — just file names, a
  > test, and documentation.
- **No CONTEXT.md / domain-vocabulary impact.**
- **ADR conflicts: none.** ADR-0002 (hexagonal shape) and ADR-0007 (app-minted token + GUC bridge)
  are unaffected. ADR-0007 line 48 *names* one of the files being renamed
  (`20260601_001_fix_session_var_and_audit_security.sql`) in a "where the policy lives" reference —
  see §6, that reference gets updated to the new name.

---

## 4. Exact files to change

### 4a. The 4 renames (git mv only — CONTENT BYTE-IDENTICAL, do NOT edit file bytes)

| From | To |
|------|----|
| `supabase/migrations/20260530_001_order_pipeline_schema.sql` | `supabase/migrations/20260530000000_order_pipeline_schema.sql` |
| `supabase/migrations/20260601_001_fix_session_var_and_audit_security.sql` | `supabase/migrations/20260601000000_fix_session_var_and_audit_security.sql` |
| `supabase/migrations/20260611_001_order_idempotency_keys.sql` | `supabase/migrations/20260611000000_order_idempotency_keys.sql` |
| `supabase/migrations/20260613_001_enable_rls_42_tables.sql` | `supabase/migrations/20260613000000_enable_rls_42_tables.sql` |

**Ordering proof (must hold):** the full directory after rename, sorted, must read:

```
20260101000000_baseline.sql
20260530000000_order_pipeline_schema.sql
20260601000000_fix_session_var_and_audit_security.sql
20260611000000_order_idempotency_keys.sql
20260613000000_enable_rls_42_tables.sql        ← 000000 sorts BEFORE 020000 ✓
20260613020000_harden_security_definer_fns.sql
20260614210221_db_pre_request_guc_bridge.sql
```

`20260613000000` < `20260613020000`, so `enable_rls_42_tables` still runs **before**
`harden_security_definer_fns`. Order preserved — this is the load-bearing invariant.

> **🗣 In plain English:** The new RLS-tables script must still run before the function-hardening
> script (the second one assumes the first already ran). Because midnight (`000000`) is earlier than
> `020000`, the rename keeps that order. If the order flipped, `db:reset` would fail — so this is the
> one thing to double-check after renaming.

The other 3 files (`20260101000000_baseline`, `20260613020000_harden_security_definer_fns`,
`20260614210221_db_pre_request_guc_bridge`) are already 14-digit — **NOT touched.**

> **Implementer note:** use `git mv <old> <new>` for each. Do NOT open the files. Do NOT touch the
> in-content comments that mention sibling files by old name (e.g.
> `20260601000000_...sql` line 12 references `20260530_001_...`, and
> `20260613000000_...sql` line 15 references `20260611_001`). Those are historical prose comments
> inside the migrations; editing them would change the file bytes and break the
> "byte-identical rename" guarantee. They are harmless and explicitly left as-is (judgement call:
> a comment is not a path that must resolve).

### 4b. New test file

- `tests/unit/migrations/filename-convention.test.ts` (new dir + file) — see §5.

### 4c. Docs edited

- `CLAUDE.md` — add the convention line (residual a). See §7.
- `docs/plans/BACKLOG.md` — (i) mark F-TD-15 residual (b) status; (ii) add new F-TD-18 entry. See §8.
- `docs/plans/2026-06-12-sixteen-day-roadmap.md` line 73 — update path. See §6.
- `docs/adr/0007-app-minted-token-and-guc-bridge-for-rls.md` line 48 — update path. See §6.

---

## 5. The lint-guard test (mechanism, location, regex, assertions)

**Mechanism chosen: a Vitest unit test, NOT an ESLint rule.**

> **🗣 In plain English:** ESLint checks the *contents* of TypeScript files; it has no natural way
> to police the *names* of `.sql` files in a folder. The cheapest robust guard that matches how this
> repo already pins conventions is a plain unit test that reads the migrations folder and asserts
> every filename matches the required shape. It runs in the normal `npm test` suite, costs nothing
> extra, and fails loudly the moment a bad name appears.

**Why this matches the repo's idiom:** the project already keeps "lint-mirror" pin tests under
`tests/unit/lint/` (`no-adapter-imports.test.ts`, `no-supabase-sdk.test.ts`) that lock a convention
in place with a test. This is the same pattern, applied to filenames instead of imports. The vitest
config already globs `tests/unit/**/*.test.ts` (`vitest.config.ts:8`), so a file under
`tests/unit/migrations/` is picked up with zero config change.

**Location:** `tests/unit/migrations/filename-convention.test.ts`

**Regex (exact):**

```
/^\d{14}_[a-z0-9_]+\.sql$/
```

> **🗣 In plain English:** "14 digits, then an underscore, then lowercase letters / numbers /
> underscores, ending in `.sql`." `20260613000000_enable_rls_42_tables.sql` passes;
> `20260613_001_enable_rls_42_tables.sql` fails (only 8 leading digits before the underscore).

**What the test does / asserts:**

1. Read the directory `supabase/migrations/` from disk (resolve the path relative to the repo
   root, e.g. via `path.resolve(__dirname, "../../../supabase/migrations")` or
   `process.cwd()` + `"supabase/migrations"`). Filter to `.sql` files only.
2. **Assert the directory is non-empty** (guards against a wrong-path silently passing with zero
   files). Expect `> 0` files.
3. **For every `.sql` filename, assert it matches the regex.** On failure the message must name the
   offending file(s) so the fix is obvious.
4. **A pinned negative case** — assert the regex itself rejects a known-bad name, proving the guard
   has teeth and can't be neutered by accident:
   - `expect("20260613_001_enable_rls_42_tables.sql").not.toMatch(REGEX)` → must NOT match.
   - `expect("20260613000000_enable_rls_42_tables.sql").toMatch(REGEX)` → must match.
5. (Optional, recommended) **Assert no duplicate 14-digit version prefixes** across the directory —
   the original same-day-collision failure mode. Extract the leading 14 digits of each filename and
   assert the set size equals the file count. 🗣 This catches the *root* bug directly: two scripts
   that would claim the same checklist slot.

> **🗣 In plain English:** The test reads the real migrations folder, checks every name fits the
> rule, and also keeps a fixed "this bad name must be rejected" example so nobody can quietly loosen
> the rule and have the test still pass. The optional duplicate check guards against the original
> collision (two scripts grabbing the same version number).

**Standalone behaviour:** because it reads the live folder, this test will FAIL until the 4 renames
land, and PASS once they do. That makes it a real acceptance check, not a tautology.

---

## 6. Grep-reference sweep — every hit, with verdict

Ran `grep -rn -E "20260530_001|20260601_001|20260611_001|20260613_001"` across the repo (excluding
`node_modules`). Verdicts:

### UPDATE (live references — path must resolve)

| File:line | Old reference | Action |
|-----------|---------------|--------|
| `docs/plans/2026-06-12-sixteen-day-roadmap.md:73` | `supabase/migrations/20260613_001_enable_rls_42_tables.sql` | rewrite to `20260613000000_enable_rls_42_tables.sql` (active roadmap — still consulted) |
| `docs/adr/0007-app-minted-token-and-guc-bridge-for-rls.md:48` | `supabase/migrations/20260601_001_fix_session_var_and_audit_security.sql` | rewrite to `20260601000000_fix_session_var_and_audit_security.sql` (ADR is the live policy-location reference) |

### UPDATE (source-code doc-comments that name a now-renamed path)

These are comments inside shipped `.ts` source, not the migration files themselves, so editing them
does NOT violate the byte-identical-rename rule (different files). They point at paths; keep them
resolvable.

| File:line | Old reference | Action |
|-----------|---------------|--------|
| `lib/adapters/supabase/OrdersRepository.ts:48` | `supabase/migrations/20260530_001:170-218` | rewrite prefix to `20260530000000` |
| `lib/adapters/supabase/OrdersRepository.ts:192` | `migration 20260611_001` | rewrite to `20260611000000` |
| `lib/orders/types.ts:7` | `supabase/migrations/20260530_001_order_pipeline_schema.sql` | rewrite to `20260530000000_order_pipeline_schema.sql` |

> **🗣 In plain English:** Three TypeScript files have "see this migration for details" comments
> pointing at the old names. They're comments, not code, but they should still point at a file that
> exists — so we fix the names. Updating these does NOT contradict "don't edit the migration files",
> because these are different (`.ts`) files.

> **Implementer caution:** the line numbers above (`170-218`) are *internal* to the migration and
> are unaffected by the rename — keep them. Only the filename prefix changes.

### LEAVE (historical / archived record — judgement: do not rewrite)

These mention the old names as a record of what happened at the time. Rewriting them would falsify
history and they don't gate any workflow.

- `.claude/checkpoints/2026-06-13-2311.md:16` — checkpoint log (historical).
- `docs/plans/archive/2026-06-07-f-infra-01-test-infrastructure.md:37`
- `docs/plans/archive/2026-06-13-t3-harden-security-definer-fns.md:58,74,75,85,111`
- `docs/plans/archive/2026-06-09-f-td-03-integration-test-runner.md:84`
- `docs/plans/archive/2026-06-09-f-06-orders-supabase-adapters.md:248,470,868`
- `docs/plans/archive/2026-06-11-f-08-orders-route-rewrites.md:69,232,281`
- `docs/plans/archive/2026-06-13-t2-enable-rls.md:35,101,105,106,129,394,411,586`
- `docs/anvil/2026-06-11-f-08-cert.md:6,65,84,102`
- `docs/anvil/2026-06-13-t2-enable-rls-rollback.sql:4`
- `docs/anvil/2026-05-30-order-pipeline-rollback.sql:2`
- `docs/anvil/2026-06-13-t2-enable-rls-cert.md:8`
- `docs/anvil/2026-06-11-f-08-rollback.sql:3`
- `docs/anvil/2026-05-30-order-pipeline-cert.md:100,148`
- `supabase/migrations/20260601000000_fix_session_var_and_audit_security.sql:12` (in-content comment, **MUST leave** — byte-identical rule)
- `supabase/migrations/20260613000000_enable_rls_42_tables.sql:15` (in-content comment, **MUST leave** — byte-identical rule)
- `docs/plans/BACKLOG.md:97,215,219` — these get rewritten anyway by §8's BACKLOG edit, where the
  F-TD-15 entry is updated to reflect completion; line 97 (F-PROD idempotency-sweep) is a historical
  mention, leave it.

> **🗣 In plain English:** The archived plans, cert records, and rollback scripts are a paper trail
> of "what we did on that day". We leave them naming the old files, because that's the truth of what
> existed then, and nothing actually loads those files by reading those docs. The two comments
> *inside* the renamed migrations stay because we promised not to touch those files' bytes.

> **Sweep re-run at Render:** the implementer should re-run the grep at the start of Render to catch
> anything added since this plan was written, and apply the same UPDATE-vs-LEAVE rule.

---

## 7. CLAUDE.md edit (residual a)

Add a short convention line to the **"## Local test infrastructure"** section (CLAUDE.md:78), after
the `db:reset` bullet (line 83) or appended as a one-line standing rule at the end of that section.
Proposed text:

> **Migration filenames must use a full 14-digit timestamp: `YYYYMMDDHHMMSS_name.sql`** (e.g.
> `20260613020000_harden_security_definer_fns.sql`). The older `YYYYMMDD_NNN` form is banned — it
> collides on same-day migrations (the Supabase CLI reads the version from the digits before the
> first underscore) and breaks Supabase preview-branch resync. Enforced by
> `tests/unit/migrations/filename-convention.test.ts`.

> **🗣 In plain English:** We write the rule down where the database commands are documented, name
> the test that enforces it, and explain *why* (same-day collision + preview-branch breakage) so a
> future contributor doesn't "simplify" the name back.

---

## 8. BACKLOG.md edits

### 8a. Update F-TD-15 (line ~212–223)

- Flip **Status** from `IN PROGRESS` to `done (F-TD-15 residual (b) — files renamed to 14-digit,
  convention pinned by tests/unit/migrations/filename-convention.test.ts, CLAUDE.md codified)`.
- Note residual (a) (CLAUDE.md codification) as done in the same unit.
- Note that the **prod `schema_migrations` reconciliation** originally proposed in "Fix shape
  (residual b)" was **descoped** (proven inert — branches build from files, prod is append-only via
  `apply_migration`) and **moved to new item F-TD-18**.

> **🗣 In plain English:** Mark the task done and record that we deliberately dropped the
> "fix production's bookkeeping" part, explaining it was proven harmless, and hand that optional
> tidy-up to a fresh backlog item.

### 8b. Add new entry F-TD-18 (docs-only, in the "Migration hygiene (F-TD-)" section)

```
### F-TD-18 — Prod migration-history reconciliation (optional hygiene)

- **Logged:** 2026-06-15 (split out of F-TD-15 residual (b))
- **What:** Prod `schema_migrations` (project uqgecljspgtevoylwkep) holds ~100 real historical
  records with full-14-digit timestamps and NO baseline row, whereas the repo ships 7 squashed
  migration files. The two histories diverge.
- **Why INERT for our workflow:** Supabase preview branches are built from the repo's migration
  FILES (verified on branch htinhqorvyhajcsvnqgz — it recorded exactly the 7 repo-file versions,
  not prod's ~100). Prod itself is only ever mutated via `apply_migration` (append-only); we never
  run `supabase db push` or `supabase db pull` against prod. So the divergence touches no live
  path — it is NOT on the RLS critical path and does not affect preview-branch health.
- **Optional future fix:** if we ever adopt `db push`/`db pull` against prod, reconcile prod's
  recorded history with the repo (mechanism TBD: `supabase migration repair` vs direct
  `schema_migrations` edit). Own FORGE/ANVIL pass, prod-touching.
- **Priority:** LOW — optional hygiene, off the critical path.
- **Status:** open (no scheduled owner).
```

> **🗣 In plain English:** Production's internal "scripts I've run" list looks very different from
> the 7 files in the repo. We checked and it doesn't matter for anything we do today, so we just
> write it down as a "maybe tidy this up someday" note rather than fixing it now.

---

## 9. Build order (TDD)

1. **Setup:** create the unit branch off `main` @ `855553e` (the conductor does this; the implementer
   confirms `git branch --show-current` is the new feature branch and HEAD is at/above `855553e`).
   ⚠️ Do NOT branch off the current `feat/f-infra-05-preview-cred-sync` branch.
2. **RED:** write `tests/unit/migrations/filename-convention.test.ts` (§5) FIRST. Run
   `npm test` — the per-file assertion FAILS on the 4 short-named files (proves the guard works).
3. **GREEN:** `git mv` the 4 files (§4a). Re-run `npm test` — the convention test now PASSES.
4. Update the 5 live/source references (§6 UPDATE tables): roadmap, ADR-0007,
   `OrdersRepository.ts` ×2, `lib/orders/types.ts`.
5. Edit CLAUDE.md (§7).
6. Edit BACKLOG.md (§8a + §8b).
7. **Local DB proof:** `npm run db:reset` — must apply cleanly from the renamed files.
8. **Full local gates:** `npm run typecheck` (tsc 0), `npm run lint` (0),
   `npm test` (unit ≥ 1596 = 1595 baseline + new test green),
   `npm run test:integration` (126 green).
9. Hand to code-critic (Guard). Implementer STOPS before PR; conductor opens the PR after
   code-critic clears.

> **🗣 In plain English:** Write the tripwire first and watch it catch the bad names, then rename
> the files and watch it go green — that's the test-first discipline. Then fix the doc pointers,
> write the rules down, and run every local check before handing off.

---

## 10. Test matrix / acceptance criteria

| Check | Command | Pass condition |
|-------|---------|----------------|
| Convention guard (new) | `npm test` (the new file) | every migration filename matches `/^\d{14}_[a-z0-9_]+\.sql$/`; pinned bad name rejected; no duplicate version prefixes |
| Local DB rebuild | `npm run db:reset` | applies cleanly from the 4 renamed files; no `schema_migrations_pkey` 23505; ordering intact |
| Unit suite | `npm test` | green, count ≥ 1596 (1595 baseline + ≥1 new) |
| Integration suite | `npm run test:integration` | green at baseline **126** (confirms renamed migrations produce the identical schema) |
| Types | `npm run typecheck` | 0 errors |
| Lint | `npm run lint` | 0 errors |
| **LIVE PROOF (ANVIL / Ship)** | this PR's own **2nd push** to its Supabase preview branch | branch `status ≠ MIGRATIONS_FAILED` after the 2nd push (resync stays healthy) |

### The live proof — call-out for ANVIL/Ship

The real fix is only provable on a Supabase preview branch's **resync (2nd push)**. The existing
PR #39 branch already has the OLD 8-digit versions baked into its recorded history, so it cannot
prove the fix. **This unit's OWN PR is the live test:**

- **Push #1** → Supabase creates/builds the branch fresh from the (now-renamed) files → branch
  builds healthy (first push was always lenient).
- **Push #2** (any follow-up commit to the same PR) → Supabase runs the **strict resync** parser
  against the branch's recorded versions. With the files now full-14-digit, the recorded versions
  are well-formed → resync succeeds → `status` stays healthy (NOT `MIGRATIONS_FAILED`).

ANVIL/Ship must explicitly confirm **"this PR's 2nd push is green on the Supabase branch-action"**
as the acceptance gate for the live behaviour. (If the PR only ever gets one push, the conductor
pushes an empty/trivial follow-up commit to force a 2nd push and observe the resync.)

> **🗣 In plain English:** We can only *prove* the jam is cleared by watching Supabase rebuild the
> rehearsal database a second time and stay healthy. The cleanest way is to use this very PR: push
> once (it builds), push again (the strict re-check must now pass). If there's only one push, force a
> second trivial push so we get to watch the re-check succeed.

### FALLBACK (eject condition)

If renaming alone does **not** heal the resync — i.e. the 2nd push still flips the branch to
`MIGRATIONS_FAILED` — **STOP and eject to re-Frame.** That outcome would mean the resync also reads
something beyond the local files (the prod-divergence theory would return), which is out of this
unit's reduced scope. Do not attempt a prod fix inside this unit; loop back to Frame.

> **🗣 In plain English:** If the rename doesn't fix it, that means our theory was incomplete — stop
> immediately and re-plan rather than improvising a production change we deliberately scoped out.

---

## 11. Risk Assessment

> Scope is deliberately small (4 file renames + 1 test + docs). Risks are correspondingly low, but
> the ordering and byte-identical invariants are load-bearing.

### Concurrency / race conditions
**No material risks in this category.** No runtime code, no shared state, no scheduling. Severity:
none. Must-fix: no.

### Security
**No material risks.** No auth, RLS policy, secret, or permission change. The renamed files contain
the same RLS/security DDL byte-for-byte; renaming changes only *when Supabase thinks it ran them*,
not *what they do*. Severity: none. Must-fix: no.

### Data migration
**Risk R1 — migration ordering inversion.** If a file were renamed to a timestamp that sorts out of
order, `db:reset` would apply DDL against tables/functions that don't exist yet and fail.
*Mitigation:* §4a proves `20260613000000 < 20260613020000`; the optional duplicate-prefix assertion
in the test and the `db:reset` gate both catch an inversion before merge. **Severity: medium.
Must-fix mitigation already in plan (db:reset gate + ordering proof). Not a blocker as planned.**

**Risk R2 — accidental content edit during rename.** If the implementer edits file bytes (e.g. an
editor auto-formats on save, or they "fix" an in-content old-name comment), the migration's
checksum/behaviour could change and the byte-identical guarantee breaks. *Mitigation:* `git mv`
only, never open the files; verify with `git diff --stat` / `git show --stat` that the 4 files show
as pure renames (R100, 0 line changes). **Severity: medium. Must-fix verification: confirm the diff
reads as rename-only before PR. Not a blocker as planned.**

### Business-logic flaws
**No material risks.** No business logic touched; integration suite at baseline 126 confirms the
schema is byte-identical in effect. Severity: none. Must-fix: no.

### Launch blockers
**Risk R3 — the live resync proof fails (fallback path).** If the 2nd-push resync still fails, the
unit's whole premise is wrong and F-RLS-04a stays blocked. *Mitigation:* the explicit FALLBACK
(§10) ejects to re-Frame rather than shipping a non-fix or improvising a prod change. **Severity:
high IF it occurs, but it is a known, planned-for outcome with a clean stop, not an unhandled
blocker.** Must-fix: no (handled by eject).

**Risk R4 — branched from the wrong base.** The implementer's current checkout is
`feat/f-infra-05-preview-cred-sync`, not main. Branching from it would drag F-INFRA-05's WIP into
this PR. *Mitigation:* §9 step 1 + the header both pin the base as `main` @ `855553e`; the implementer
verifies before any work. **Severity: medium. Must-fix verification in plan. Not a blocker as
planned.**

### Risk Assessment headline

**No must-fix blockers.** All identified risks are low-to-medium and already mitigated within the
plan (ordering proof + `db:reset` gate, rename-only diff verification, explicit fallback eject,
base-branch pin). The only high-*impact* item (R3) is a deliberately-planned eject, not an
unhandled hazard.

---

## 12. Rollback

**Rollback = `git revert` the rename commit(s)** (or `git mv` the 4 files back to their old names).
No production blast radius: prod `schema_migrations` is untouched, no schema DDL ran against prod, no
app code or dependency changed. Local `db:reset` and integration both rebuild from whatever files are
present, so reverting fully restores the prior state. The only externally-visible artifact is the
Supabase preview branch for this PR, which is disposable and is torn down with the PR.

> **🗣 In plain English:** Undoing this is as simple as renaming the files back — nothing permanent
> or production-side was changed, so there's no cleanup beyond a normal git revert.
