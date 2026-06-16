# Code review — F-TD-22 prevent duplicate usernames (PR #46)

**Date:** 2026-06-16
**Branch:** `feat/f-td-22-unique-usernames` → `main` (PR #46)
**Reviewer:** FORGE Guard (code-critic subagent)
**Verdict:** **SHIP** — no blockers, 2 nits (both non-blocking)

## Scope reviewed
Prevent two case-insensitive-identical usernames coexisting on `users`. Diff:
migration (unique index on `lower(name)`), both adapters' `createUser`
(trim + 23505→ConflictError), shared contract case, admin route 409 mapping,
integration 409 test.

## Test / typecheck results
- Fake adapter contract (`tests/unit/adapters/fake/UsersRepository.test.ts`): 24/24 pass (incl. new case-insensitive dup-rejection case).
- Arch-lint + migration-filename tests: 22/22 pass.
- `tsc --noEmit`: clean (exit 0).
- Supabase contract + integration 409 case: NOT RUN (need local Supabase) — pass by inspection; **ANVIL must execute the live integration tier.**

## Findings

### 🔴 Blockers
None.

### 🟡 Should-fix
None.

### 🔵 Nits
- **`app/api/admin/users/route.ts:99-101`** — 409 branch has a redundant second
  condition `(err as { httpStatus?: number })?.httpStatus === 409`. `ConflictError`
  already has `readonly httpStatus = 409`, so `instanceof ConflictError` alone
  matches. The duck-typed fallback only fires for a non-instance object carrying
  `httpStatus:409` (no such producer today) and slightly widens the net — a future
  plain thrown object with `httpStatus:409` would be silently rebadged "name taken".
  Recommend dropping the second clause. **Harmless today.**
- **`supabase/migrations/20260616120000_unique_username_lower_index.sql:16`** —
  `CREATE UNIQUE INDEX IF NOT EXISTS` is not `CONCURRENTLY`; takes a brief write
  lock during build. `users` is tiny → sub-ms lock, and `CONCURRENTLY` can't run in
  Supabase's transactional migration wrapper anyway. Deliberate trade-off, recorded.

### 🟢 Good
- **Vendor leak contained** (`lib/adapters/supabase/UsersRepository.ts:226-231`):
  `23505` detection fully inside the adapter; throws app-owned `ConflictError`,
  other errors stay `ServiceError` (500 unchanged). Grep confirms no `@supabase/*`
  import outside `lib/adapters/supabase/`. ADR-0002 boundary intact.
- **Trim consistency:** both adapters trim on write (supabase `:215`, fake `:201,213`),
  so `lower(name)` index (not `lower(trim(name))`) is sufficient — no divergence.
  Empty/whitespace-only name caught upstream at route `:53`+`:62` (400) before adapter.
- **Narrow 23505 mapping sound today:** the only insert-violable UNIQUE on `users` is
  this new index (baseline has only `users_pkey` UUID + a CHECK). Coupling noted:
  a future second unique index would require inspecting the constraint name.
- **Login untouched** — old duplicate-name `.single()` 500 becomes unreachable once
  names are unique. Correct not to touch it.
- **Migration hygiene:** 14-digit timestamp ✓, explicit index name
  (`users_lower_name_unique_idx`) ✓, `IF NOT EXISTS` idempotent ✓, rollback +
  verify-first precondition documented in header ✓.

## Depth verdicts (new/touched only)
- `supabase ...UsersRepository.createUser` → **DEEP** (real vendor→domain error translation).
- `fake ...UsersRepository.createUser` → **DEEP** (same invariant in-memory; real contract weight).
- route POST catch → in-scope error→HTTP mapping, fine.
- migration → schema artifact, not a module.
- No PASS-THROUGH or SPECULATIVE SEAM introduced.

## Test-quality (Pocock standard)
- Contract test (`UsersRepository.contract.ts:280-297`): behaviour through the public
  port, asserts identical `ConflictError` type, runs against BOTH adapters, uses
  `toUpperCase()` to prove case-insensitivity specifically. 🟢
- Integration test (`tests/integration/admin-users.test.ts:111-130`): full HTTP surface,
  asserts status 409 + exact body string. Behaviour-based. 🟢

## Handoff
No blockers → ANVIL. ANVIL must run the live Supabase contract + integration 409 case
(not runnable without local DB). Two nits recorded, non-blocking.
