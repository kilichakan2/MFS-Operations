# FORGE Guard — Code Review: F-17 PR1 (Complaints + Compliments domain foundation)

- **PR:** #62
- **Branch:** `f-17-pr1-complaints-compliments-foundation` → `main`
- **Diff:** 22 files, +2234 / -0
- **Date:** 2026-06-23
- **Reviewer:** code-critic (FORGE Guard, sole review authority)

## Verdict: SHIP

No blockers. One 🟡 should-fix (latent byte-identity drift PR2 must handle). Four 🟢 notes.

## Tooling
| Check | Result |
|---|---|
| `npm run lint` | PASS (exit 0) |
| `tsc --noEmit` | PASS |
| `npx vitest run` | PASS — 2033/2033, 118 files |
| New F-17 tests | 45 service (34 complaints + 11 compliments) + 4 wiring = 49, all green |

## Section 1 — Guardrail conformance (hard acceptance criteria)
| Guardrail | Status | Evidence |
|---|---|---|
| `app/api/**` diff EMPTY | PASS | zero `app/` files in diff |
| No migration / schema change | PASS | zero `supabase/migrations/` in diff |
| No email-helper edits | PASS | `complaint-email.ts` / `compliment-email.ts` untouched |
| Wiring MASTER-KEY only | PASS | `lib/wiring/complaints.ts:31` + `compliments.ts:31` import `supabase*Repository`; no `*ForCaller`/`authenticatedClient`/`dbTokenMinter` |
| Services FACTORIES only | PASS | only `create*Service` exported; no `export const` in services |
| `@supabase/*` only in `lib/adapters/supabase/` | PASS | only the two new supabase adapters import it (type-only) |
| domain/ports import no adapters | PASS | ports import `@/lib/domain` only; domain imports nothing |
| Zero new `package.json` entries | PASS | `package.json` not in diff |

## Section 2 — Byte-identity readiness for PR2
- **SELECT column lists — verbatim match** against all 8 routes (`ALL_COMPLAINT_COLS`, `ALL_NOTE_COLS`, `OPEN_COLS`, `DETAIL_COLS` incl. `resolvedBy:users!...` alias, `EMAIL_CTX_COLS`, `COMPLIMENT_COLS`, `listActiveRecipients`). ✅
- **Validation cascades + exact strings** match routes byte-for-byte (`validateCreate` `Missing: …` join; `complaint_id required`/`resolution_note required`/`body required`). ✅
- **Resolution-check payload** honoured (open ⇒ 3 nulls; resolved ⇒ all 3 set), `resolveOpen` atomic with `.eq('status','open')`. ✅
- **Duplicate path** `23505 → {duplicate:true}` 200, no throw. ✅ (see W1)
- **`category` raw-enum** carried as-is; `.replace(/_/g,' ')` stays at route edge. ✅

### 🟡 W1 — `screen2/sync` duplicate detection narrower in adapter than route
`lib/adapters/supabase/ComplaintsRepository.ts:304` catches only `error.code === '23505'`; live route `app/api/screen2/sync/route.ts:90` uses `httpStatus === 409 || text.includes('23505')` (broader net). If PR2's client surfaces a duplicate as a non-`23505` code, the adapter throws `ServiceError` (→ 500) instead of returning `duplicate:true` (→ 200). The offline queue replays inserts, so a 500 makes the client retry forever.
**Not a PR1 blocker** (nothing consumes it; Fake models the happy duplicate path). **PR2 MUST** assert the duplicate-replay path end-to-end against the real DB and broaden the adapter check if needed.

### 🟢 G1 — `detail/complaint:41` returns `received_via.replace(/_/g,' ')` (a 2nd display transform). Domain carries raw `receivedVia`; PR2 must apply `.replace` at the route edge for it too.
### 🟢 G2 — `ComplaintsRepository.ts:249` synthesises `status:'open'` for `listOpen` (select omits column). Correct/derived; documented in-code.

## Section 3 — Hexagonal depth
| Module | Verdict | Reasoning |
|---|---|---|
| `ComplaintsRepository` (port) | DEEP | 7 ops; parallel complaints+notes fetch w/ in-adapter grouping, to-one join coercion, 23505→duplicate, customer-name closure, resolve-only-if-open |
| `ComplimentsRepository` (port) | DEEP enough | 3 ops; join + limit-100 + active-only ordering |
| `ComplaintsService` | THIN-but-justified | reads pass-through, but 3 `validate*` cascades lift exact route logic to testable unit; mirrors CashService |
| `ComplimentsService` | THIN-but-justified | one `validateCreate`; matches repo template |

No SPECULATIVE SEAM — every port method maps 1:1 to a real PR2 route op.
**Boundary decisions SOUND:** Decision 1 (customer-name resolved in port, matches Cash) ✅; Decision 2 (audit_log write left at route, per `OrdersRepository.ts:541` precedent, logged as F-TD-31) ✅.

## Section 4 — The three deviations (all FAITHFUL-TO-INTENT)
- **(a)** `validateResolve` + `validateNote` added — plan prose covered resolve+note required-field checks; cleaner expression, fully tested, no invented behaviour.
- **(b)** customer-name lookup → private closure `resolveCustomerName` — removes duplication, behaviour matches `screen2/sync:103`, `'Unknown'` on miss.
- **(c)** descending-id tie-break in Fake sort — same-millisecond ties only (Postgres leaves these unspecified); test-determinism, no production change.

## Section 5 — Fake vs Supabase parity
PASS — Fake enforces `complaints_description_check` (≥5 trimmed), `complaints_resolution_check`, `complaint_notes_body_check`, `compliments_body_check`, resolve-only-open, active-only ordered recipients. Tests run against Fake only → real-DB CHECK enforcement is PR2's integration job (acceptable for introduce-only). 🟢 G3: Fake validates only the resolved-with-missing-note direction (the open-with-non-null direction is unconstructable via the port).

## Section 6 — Test quality
Strong. Tests assert real branches through the public surface: full validateCreate cascade order, duplicate-replay, resolution-check both directions, open-vs-resolved persistence, resolve-only-if-open, findEmailContext shape+miss, note trimming+author, newest-first ordering+note grouping, `'Unknown'` fallbacks; compliments body-required, null-recipient, limit-100, active-only ordered. Wiring smokes pin method surface + no-shared-state factory contract. 🟢 G4: deferring per-adapter integration to PR2 is correct (Cash precedent), with W1 as the required PR2 assertion.

## Handoff
No blockers → ANVIL. Carry forward to PR2: **W1** (duplicate-replay must return 200 `duplicate:true`, not 500 — assert against real DB) and **G1** (`receivedVia` route-edge transform). F-TD-31 (AuditLog port) logged for later.
