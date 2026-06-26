# Code-critic review — F-20 Admin PR1 (Geocoder seam + Customers re-point)

**Date:** 2026-06-26
**PR:** #80 · branch `feat/f20-pr1-geocoder-customers`
**Reviewer:** code-critic (FORGE Guard phase, sole review authority)
**Verdict:** **CLEAR-WITH-NITS** — no blockers. One should-fix behaviour regression (W1) sent back to Render; two cosmetic nits carried to ANVIL.

---

## Flagged-item rulings

### Flagged 1 — `customers/[id]` PATCH returns 404 on missing id (was implicit 500): **KEEP** ✅
Old code used Supabase `.single()` → PGRST116 on no match → route's `if (error) return {error}, 500`. So the OLD behaviour was an **implicit 500**, never a 200. New repo uses `.maybeSingle()` → `null` → typed **404 "Customer not found"**. Path is unreachable from the admin UI; both old and new are error responses (never success); 404 is strictly more correct and consistent with the port's typed-null contract. Reverting would *add* code to make an unreachable path worse. **Kept.**

### Flagged 2 — byte-identical response shapes: **CONFIRMED** ✅
Verified against route code + exact-key-set tests (`Object.keys(body).sort()`, not subsets):
- `customers` GET → `{id,name,postcode,lat,lng,active,created_at}`; owned extras `geocoded_at`/`is_approximate_location` NOT leaked (test seeds them, asserts absent — `admin-customers.route.test.ts:95-106`).
- `customers/[id]` PATCH → that row + `{_geocoded,_approximate,_warning}`; `_warning:undefined` omitted from JSON.
- `geocode-all` → completion `{message,total_input,geocoded,approximate,failed,failed_list}`; early-return omits `total_input` (matches old). Both key sets pinned.

---

## 🔴 Blockers
None.

## 🟡 Warnings

### W1 — postcode PATCH returns 500 + drops the save on a geocoder transport failure (old: saved + 200 + warning) — **SHOULD-FIX → Render**
`lib/adapters/postcodes/Geocoder.ts:109-116` + `app/api/admin/customers/[id]/route.ts:79,118-120`

`geocode()` throws `GeocoderError` when exact transport-fails then outcode cleanly misses (L109), or the outcode round-trip itself transport-fails (L116). PATCH calls `geocoder.geocode(postcode)` at L79 **before** the DB write; its only catch is the generic `{error:String(err)},500` (L118-120).
OLD `geocodePostcode` swallowed network errors (`catch { fall through }`) → returned `null` → route saved the postcode with null coords and returned **200 + `_warning:"Postcode saved but could not be geocoded — will retry on next sync"`**.

Divergence under a postcodes.io outage:
- OLD: postcode persisted, 200 + warning, retries next sync.
- NEW: GeocoderError before the write → **500, postcode NOT saved** (admin loses the edit).

The worse direction; contradicts the behaviour-preserving spec. Route-local fix: map `GeocoderError → coords = null` in the route's postcode branch (restore save-then-warn). geocode-all path does NOT have this issue (its 500-on-bulk-failure matches old).

### W2 — geocode-all exact-bulk failure error *body* changed (status unchanged) — cosmetic, carry to ANVIL/ops
`app/api/admin/geocode-all/route.ts:91-92`. Old: `{error:"postcodes.io error: <status>"}`; new: generic `{error:"Server error"}`. Status identical (500); only the diagnostic message is less specific. Non-blocking.

---

## 🔵 Depth / architecture
- `Geocoder` port + postcodes.io adapter → **DEEP** ✅ — two-method interface hides the two-pass exact→outcode fallback, `approximate` computation, vendor mapping, not-found-vs-transport-failure discipline. Real seam (deletion test concentrates complexity).
- `CustomersService` → **SHALLOW (thin pass-through), accepted** — exists to keep `app/**` off `lib/adapters/**`; per the rubric not a depth blocker; mirrors `UsersService`. Correct call.
- postcodes.io `fetch` is the single owner in `lib/adapters/postcodes/Geocoder.ts`; old inline fetches gone. No speculative seam / pass-through introduced.

## 🟢 Test quality
- Strong: all three route tests assert exact key sets; `admin-customers.route.test.ts:95-97` proves owned extras stripped.
- Strong: fallback genuinely exercised (`postcodes/Geocoder.test.ts:62-75` exact-miss→outcode-hit asserts `/outcodes/S70` + `approximate:true`; bulk test 140-164 verifies mixed-case normalisation + outcode round-trip only for misses); shared contract runs against real + fake.
- Strong: guard-swap test proves old `?secret` → 403, non-admin → 403, missing identity → 401, admin → 200; error mapping matches `admin/users` precedent.
- **Gap:** W1's throw-path is untested (route tests only mock resolve/null, never reject). ANVIL must add a "geocoder transport failure on postcode PATCH" case to lock the chosen W1 behaviour.

---

## Hexagonal check — PASS ✅
- No `app/**` import of `lib/adapters/**`; no `lib/domain`/`lib/ports` import of adapters.
- postcodes.io `fetch` in exactly one file; vendor JSON mapped to `GeocodeResult` inside adapter; Supabase rows → `CustomerAdminView` inside repo. No leak.
- Services export factories only; singletons in `lib/wiring/{customers,geocoder}.ts`.
- Rip-out: swap geocoder or DB = one adapter + one wiring line each. PASS.
- No new `package.json` entry. Lint pin `no-adapter-imports` green; ESLint + tsc clean on touched modules.

## Suite
- Affected unit suite (9 files): **99/99 passing**. ESLint clean. `tsc --noEmit` clean.
- Integration (`tests/integration/adapters/supabase/CustomersRepository.test.ts`): **deferred — local Supabase down; NOT run. ANVIL must run it** (only unverified surface).

---

## Conductor disposition
- **W1 → Render** (route-local fix: restore save-then-warn on geocoder transport failure + add throw-path test). Re-run Guard on the touched file.
- **W2 → accept** (cosmetic, carry to ANVIL notes).
- **ANVIL:** run the deferred integration suite + add the W1 throw-path test.
