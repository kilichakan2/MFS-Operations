# ANVIL Clearance Certificate

Date: 2026-06-15
App: MFS-Operations
Branch: feat/f-td-15-migration-filename-reconciliation
PR: #40

Status: ✅ CLEARED FOR PRODUCTION — pure migration-filename renames (byte-identical),
no production migration, no PITR gate. All local layers green AND the cloud
preview-branch path proven live (first-create + second-push resync both healthy with the
renamed 14-digit filenames). Conductor finalized after the Supabase provisioning outage
that blocked the live proof cleared and was confirmed external.

---

## Production ship record

**SHIPPED 2026-06-15.** PR #40 squash-merged to `main` → `b3f3901` (merged 14:22 UTC),
feature branch deleted (preview branch `uiiubqaxnjvjaoqicvau` torn down with it — no
orphaned branch). **No migration applied to prod** — this unit changes repo filenames only;
prod `schema_migrations` (`uqgecljspgtevoylwkep`) was deliberately untouched. Vercel
auto-deploy is a behavioural no-op (no runtime code changed). Rollback if ever needed =
`git revert b3f3901` (or `git mv` the 4 files back) — no prod-side cleanup.

**Deferred follow-up:** prod `schema_migrations` version divergence reconciliation =
**BACKLOG F-TD-18** (optional; gated — must be done before any future move to a diff-based
`db push`/`db pull` prod workflow; inert under the current append-only `apply_migration`
workflow).

---

## Scope — what this certificate covers

F-TD-15 renames 4 migration files from the banned short `YYYYMMDD_NNN` form to the full
14-digit `YYYYMMDDHHMMSS` form, **byte-identical content** (git blob hashes verified on all
4), order preserved. It adds a unit guard (`tests/unit/migrations/filename-convention.test.ts`),
codifies the rule in CLAUDE.md, and repoints live references (ADR-0007, roadmap,
`OrdersRepository.ts` + `lib/orders/types.ts` comments). **No SQL changed. No schema DDL.
No production migration applied.**

🗣 This unit only changes the *names* of four database-recipe files so the cloud tool can
read them; not a single line of the recipes themselves changed. The point of the unit is
to stop preview databases from failing on a PR's second push.

| Change / path | Risk tier | Layers required | Layers run |
| --- | --- | --- | --- |
| 4 × `git mv` short → 14-digit migration filenames (byte-identical) | Med (DB tooling) | Unit + DB apply (local) + cloud preview resync | ✅ all run |
| `tests/unit/migrations/filename-convention.test.ts` (convention guard) | Low | Unit | ✅ Unit |
| CLAUDE.md / ADR-0007 / roadmap / source-comment repoints | Low (docs) | Unit (build) | ✅ |

**Not run under the efficiency dial:** None relevant. The change touches no app runtime
code path, so no integration/E2E behaviour smoke was required beyond the existing suite,
which ran green. The load-bearing proof for THIS unit is the cloud preview-branch resync,
which ran live (below).

---

## Test Results

| Layer | Status | Notes |
| --- | --- | --- |
| Unit (Vitest) | ✅ 1599/1599 | main baseline 1595 + 4 new filename-convention guard assertions. |
| Typecheck (`tsc --noEmit`) | ✅ 0 errors | Matches main baseline. |
| Lint (`next lint`) | ✅ 0 warnings/errors | Matches main baseline. |
| DB apply — local (`db:reset`) | ✅ green | All 7 migrations applied in correct order, no `schema_migrations_pkey` (23505) collision — the exact failure the short form caused. |
| Integration (Vitest, LOCAL Supabase) | ✅ 126/126 | Unchanged from baseline; renames do not alter runtime behaviour. |
| **Cloud preview branch — 1st create** | ✅ FUNCTIONS_DEPLOYED / ACTIVE_HEALTHY | Branch `uiiubqaxnjvjaoqicvau` (PR #40) built fresh and applied all 7 migrations **by their renamed 14-digit names** in order; T2 (RLS: 42 enabled, none FORCE) + T3 (security-definer guards) NOTICEs passed. Run `621bd778…`. |
| **Cloud preview branch — 2nd-push resync** | ✅ stays FUNCTIONS_DEPLOYED | Second push (commit `2b31772`) triggered a fresh resync run `56695c57…` → **"All migrations are up to date"**, zero errors, branch never entered `MIGRATIONS_FAILED`. GitHub "Supabase Preview" check → COMPLETED / SUCCESS. **This is the exact scenario that drove the short-name branch to `MIGRATIONS_FAILED`; with 14-digit names it passes.** |
| Guard (code-critic) | ✅ SHIP | 0 blockers / 0 warnings; renames byte-identical via blob-hash; 1 🔵 pre-existing stale comment in `scripts/strip-order-pipeline.py:4` (non-resolving, optional). Review: `docs/reviews/2026-06-15-f-td-15-migration-filename-reconciliation-review.md`. |

🗣 Every rung is green — and crucially the real cloud step that used to break (the second
push) was reproduced and beaten with the renamed files.

---

## Live proof — the blocker and its resolution

The cloud preview-branch proof was initially blocked by a **Supabase provisioning outage**
(org `pgzocjhhmrbxwqlncfjd`, region `eu-west-2`): two fresh preview branches (`zzqmapgdkyhzseyfcfck`,
`nuswjiyarfnxikueyxku`) stalled at `CREATING_PROJECT` for 20–50+ min each, with empty
branch-action logs and `get_project` → "Project not found" (the underlying DB instance was
never built). This was confirmed **external and independent of F-TD-15** three ways:

1. **Structural** — the failure stage (`CREATING_PROJECT`) runs *before* any migration file
   is read; our renames are only consulted two stages later.
2. **Control test** — a fresh provision of an unrelated PR (#39, none of the F-TD-15 renames)
   stalled identically, then recovered. An innocent branch failing the same way exonerates
   the diff.
3. **Account ruled out** — org is Pro with branching enabled, branch-cost query responds,
   spend cap / billing confirmed clean by Hakan; not a quota/payment gate.

The outage cleared ~14:00 UTC. PR #40's branch was recreated (delete orphan + PR
close/reopen — empty commits are *skipped* by Supabase when no migration diff is present,
so reopen is the reliable trigger) and built clean, then the 2nd-push proof ran green.

---

## Migration / production impact

**No production migration.** This unit applies nothing to prod (`uqgecljspgtevoylwkep`).
The 4 files are renamed in the repo only; prod's `schema_migrations` already holds these
migrations under their original (short) recorded version strings.

PITR confirmed: **N/A** — no destructive op, no schema change, nothing applied to prod.

Rollback = `git revert` the rename commit(s) (or `git mv` the 4 files back). No prod blast
radius; local + preview rebuild from whatever files are present. (See plan §12.)

> ⚠️ **Known, deferred divergence (F-TD-18):** prod's `schema_migrations` version strings
> were recorded under the OLD short form, so after this merge the repo's 14-digit filenames
> differ from prod's recorded versions. This is **INERT under the current workflow** because
> prod migrations are applied one-by-one via Supabase MCP `apply_migration`, never via a
> diff-based `db push` sync. **Do NOT run a diff-based prod migration sync against the
> renamed files** — that would see them as new and try to re-apply. Reconciling prod's
> recorded history is logged as **BACKLOG F-TD-18** (optional; not actioned here).

🗣 The cloud tool now reads our recipe files correctly going forward, but the *old log* of
what's already been cooked in prod still lists the short names. That mismatch is harmless as
long as we keep adding new prod recipes one at a time (which we do) — just don't ask the tool
to "sync everything at once," and it stays harmless. Fixing the old log is a separate optional
chore (F-TD-18).

---

## Merge Sequence (Gate 4 — ship)

1. **No migration step** — nothing to apply to prod.
2. Squash-merge PR #40 → `main`. Vercel auto-deploys (no runtime code changed; deploy is a
   no-op for behaviour).
3. Post-merge: confirm the preview branch `uiiubqaxnjvjaoqicvau` tears down with the PR (no
   orphaned branches), and that main's filename-convention guard is green on CI.

---

## Verdict

✅ **CLEARED FOR PRODUCTION.** All required layers green: unit 1599/1599, tsc 0 / lint 0,
local `db:reset` 7-in-order with no collision, integration 126/126, code-critic SHIP, and —
the load-bearing proof for this unit — the cloud preview-branch path verified live:
first-create healthy with the 14-digit names, and the second-push resync ("All migrations
are up to date") staying off `MIGRATIONS_FAILED`, which is precisely the bug F-TD-15 fixes.

No production migration, no PITR gate, byte-identical renames. The only prod-side note is the
inert, deferred `schema_migrations` version divergence (F-TD-18) — harmless under the manual
`apply_migration` workflow. Ready for the Gate 4 ship (squash-merge; no migration-first step).
