# Guard (code-critic) review — F-13 PR1 Users-domain foundation

**PR:** #43 · branch `f-13-pr1-users-domain-foundation`
**Date:** 2026-06-15
**Reviewer:** code-critic subagent (FORGE Guard — sole review authority for this PR)
**Verdict:** ✅ **SHIP** — no blockers; hand to ANVIL.

## Scope reviewed
Pure hexagonal extraction of the Users domain, zero behaviour change, no route edited.
Role→domain (ARCH-FU-01), expanded UsersRepository port + Supabase(service-role)+Fake
adapters + shared contract, UsersService (composes UsersRepository + PasswordHasher),
lib/wiring/users.ts, dead-param removal (ARCH-FU-03), round-trip test pattern + OrdersService
retrofit (ARCH-FU-04), cross-service-import ESLint ban + pin (F-TD-05). No migration, no new dep.

## Test / lint / typecheck
| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `npm run lint` | 0 / 0 |
| Affected unit subset (7 files) | 102/102 |
| Full unit suite | 1712/1712 (90 files) |
| Leak-test mutation probe (injected `pinHash` into Fake `toSummary`) | 7 tests failed → guard bites → restored clean |

Integration suite (real Supabase adapter contract incl. `users_auth_check` firing) deferred to
ANVIL — needs Docker / `db:up`, unavailable in the review context.

## Security R2 verdict — PASS
Hashes never leak past the adapter on hash-free reads. Confirmed four ways:
- **(a) Type-level:** `UserSummary` (lib/domain/User.ts:43-54) has no hash field; `UserCredential`
  (:71-79) is the only hash-bearing shape → a hash on a summary read is a compile error.
- **(b) Runtime:** `assertNoHashFields` (lib/ports/__contracts__/UsersRepository.contract.ts:48-52)
  runs on every UserSummary-returning method (findUserById :103, findUserByName :128,
  listUsersByRoles :154, listAllUsers :205, createUser :266, updateUser :313) + a Fake quarantine
  case. Proven to fail under mutation.
- **(c) Adapter projection:** Supabase `SUMMARY_COLS` (adapters/supabase/UsersRepository.ts:51-52)
  has no hash columns; only `CREDENTIAL_COLS` (:55-56) adds them, used solely by the two
  `*Credential*` methods. No `select('*')` anywhere. Fake builds summaries with no hash key.
- **(d)** Credential methods are the only hash door and PR1 calls them from nothing (consumed by
  login PR3 + kds-pin PR2 only).

## Architecture depth — all PASS, no introduced shallowness
- **UsersRepository port** — DEEP. 9 methods, each mapped 1:1 to a committed PR2/PR3 route consumer
  (verified against the plan's route table); the two-return-type credential quarantine is real
  hidden behaviour, not pass-through. Not speculative.
- **UsersService** — DEEP enough. Owns the real decisions (plaintext→hash via PasswordHasher +
  column-by-role selection, UsersService.ts:62-65,166-191; `authTypeForName` non-enumeration
  posture :153-157). Thin read delegations acceptable (single call surface for routes, mirrors
  OrdersService).
- **Adapters** — faithful twins, both pass the shared contract; vendor columns mapped to camelCase
  at the boundary, no vendor type crosses.
- **Rip-out test** — PASS (swap DB = 1 new adapter + 1 wiring edit; domain/service/routes untouched).

## Rulings on the 4 implementer-flagged deviations
1. **Role.test.ts at tests/unit/domain/** — ✅ acceptable; it runs, observability Role exports
   deleted, UserSummary.role tightened to the union, repo-wide grep shows zero stray
   observability-Role imports, tsc 0 proves no orphan.
2. **F-TD-05 glob skips same-dir `./OtherService`** — 🔵 acceptable documented gap. Alias form
   (`@/lib/services/*`, the codebase's universal style) IS caught; cross-dir relative caught;
   same-dir bypass exists only to keep the `lib/services/index.ts` barrel re-export legal, and
   `next lint` (TS parser) runs the real rule tree-wide. A UsersService→OrdersService alias import
   would be caught.
3. **Three contract assertions changed to Postgres truth** — ✅ schema-faithfulness, not weakened.
   Real `users_auth_check` (baseline.sql:1282): admin ⇒ password_hash NOT NULL, non-admin ⇒
   pin_hash NOT NULL. Re-hash cases respect it (PIN user re-sets PIN; admin re-sets password).
   Role-enum grouping + timestamptz instant-compare are correct Postgres reflections the Fake mirrors.
4. **No wiring smoke test** — 🔵 acceptable; mirrors orders.ts precedent (parts list, no logic,
   guarded by tsc).

## Zero-behaviour-change — PASS
- All 7 user-touching routes byte-identical (`git diff` over app/api/auth/** + app/api/admin/users/**
  empty).
- Only app/** edit: app/api/orders/[id]/route.ts:72 drops trailing `caller.userId!` from
  `editOrder(...)` — true no-op (param was unused `_callerUserId`, OrdersService.ts:434). ARCH-FU-03.
- No package.json change.

## Lower-severity findings
- 🔵 **findUserByName matching semantics differ between twins** — Supabase uses `ilike`
  (adapters/supabase/UsersRepository.ts:126), Fake uses exact lowercase equality
  (adapters/fake/UsersRepository.ts:152-158). `ilike` treats `%`/`_` as wildcards; the Fake doesn't.
  Identical for all committed consumers (literal names, no wildcards). Would diverge silently only
  if a future caller passed a name containing a SQL wildcard. → recommend a one-line port-doc note
  that names are treated as literals. (Carried to BACKLOG as the PR1 residual.)
- 🟢 Test quality strong — round-trip retrofit genuinely round-trips; leak test proven-falsifiable;
  ESLint pin loads the real config from disk (deleting the rule breaks the test); all assertions go
  through the port/service public surface.

## Handoff to ANVIL
ANVIL must run what the review context could not: `npm run test:integration` for the Supabase
UsersRepository contract against the real local Postgres (write-case cleanup + `users_auth_check`
firing). Everything statically verifiable is green.
