# F-13 PR2 — Guard (code-critic) review

**Date:** 2026-06-15
**Branch / PR:** `feat/f-13-pr2-repoint-user-routes` / #44
**Phase:** FORGE Guard (code-critic subagent)
**Verdict:** ✅ **SHIP-READY — no blockers. Handed to ANVIL.**

---

## What was reviewed
Pure re-pointing of 6 non-login user routes onto the `usersService` singleton
(`@/lib/wiring/users`) built introduce-only in PR1. Must be behaviour byte-identical:
same JSON body keys/casing + same HTTP status codes, zero port/service/migration/dependency
churn, login route untouched.

Diff (`git diff main...feat/f-13-pr2-repoint-user-routes`): 6 route files MODIFY-only +
`docs/plans/BACKLOG.md` (F-TD-20) + `tests/integration/_setup.ts` (+`"PATCH"`) +
`tests/integration/admin-users.test.ts` (new).

## Toolchain results (exact)
| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors ✓ |
| `npm run lint` | 0 warnings / 0 errors ✓ |
| `npm test` (unit) | 1712 / 1712 passed (90 files) ✓ |
| `npm run test:integration` | 163 / 163 passed (16 files) ✓ — local Supabase up |
| kds-pin regression (R-MF-3 net) | valid→200 / invalid→401 / malformed→400 unchanged ✓ |
| new `admin-users.test.ts` | 3 / 3 passed ✓ |

## Per-route behaviour-parity verdict
| Route | Parity | Notes |
|---|---|---|
| `auth/type` POST | OK | `400 'Name required'` kept; inactive→`'pin'`; outer catch→`{authType:'pin'}` (R-M-2). |
| `auth/team` GET | OK | Projects `{id,name,role,secondary_roles}`; activeOnly + orderBy:['name']; roles unchanged. |
| `auth/kds-pin` POST | OK | Reads `pinHash`, `if(!pinHash) continue`, activeOnly:true, roles `['butcher','warehouse']`; 500 `{error:'Server error'}` preserved (R-MF-3). |
| `auth/haccp-team` GET | OK | Projects `{id,name,role,secondary_roles}`; orderBy:['role','name'] preserved. |
| `admin/users` GET+POST | OK | `toAppUser` emits exact 8-field snake_case; created_at asc; admin guard + 3 validation guards + secondary_roles filter kept; POST→201. |
| `admin/users/[id]` PATCH+DELETE | OK | `null→500 {error:'User not found'}` (R-MF-1); credential `{plaintext,role}`; admin guard kept; DELETE→200 `{success:true}`. |

Benign nuances checked & cleared (not findings): create-with-blank-email (`email:null` vs
omit → both stored NULL, column nullable no-default); empty `secondary_roles` (`[]` both paths).

## Must-fix risks — satisfied
- **R-MF-1** (PATCH missing id stays 500): SATISFIED — `app/api/admin/users/[id]/route.ts:84-86` maps `null→500`; pinned by a real test PATCHing a missing UUID asserting 500. F-TD-20 logged with the correct 404-fix shape.
- **R-MF-2** (no camelCase leak): SATISFIED — read routes project snake_case; test asserts snake_case present AND camelCase absent against a non-empty result set (non-tautological).
- **R-MF-3** (kds-pin hash path): SATISFIED — `pinHash` read, null-skip + activeOnly + role filter kept; existing kds cases pass unchanged.

## Security
- No hash leak: routes 2/3/5/6/7 receive hash-free `UserSummary`; route 4 receives `UserCredential` but returns only `{id,name,role}`.
- No PIN/hash logged: error logs carry only `ServiceError`/`String(err)`, never plaintext.
- Admin guards intact (403 on POST/PATCH/DELETE). Hashing stays server-side (service + adapter, column-by-role + clear-other).

## Hexagonal compliance
PASS and a strict improvement. All 6 routes dropped `@supabase/*` / `@/lib/adapters/**`
(grep-empty); all import `usersService` from `@/lib/wiring/users`; kds-pin keeps the allowed
`passwordHasher` wiring import. `lib/**`, `package.json`, migrations untouched. Rip-out cost
for Users drops from "6 routes + adapter + wiring" to "adapter + wiring".

## Findings (graded)
- 🟢 Test quality strong — `admin-users.test.ts` pins all three must-fix risks with real,
  non-tautological assertions; creates no rows (reads + PATCHes a guaranteed-missing id);
  no seed-row pollution.
- 🟢 Error-path 500-body text drift (PostgREST → `ServiceError` string) — accepted/documented
  in plan (R-M-1); error-path only, status codes preserved.
- 🔵 Pre-existing (out of scope): `GET /api/admin/users` has no admin-role guard — unchanged
  from `main`. Future ticket, not PR2's remit.

## Scope discipline
Login route `app/api/auth/login/route.ts` byte-for-byte untouched. No `lib/**` edit, no
`package.json` change, no migration, no new port/service method. One BACKLOG entry (F-TD-20).
