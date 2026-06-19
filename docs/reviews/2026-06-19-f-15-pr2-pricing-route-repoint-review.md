# Guard (code-critic) review — F-15 PR2 (pricing route re-point + email absorption)

- **Date:** 2026-06-19
- **Branch:** `f-15-pr2-pricing-route-repoint` (local, 8 commits; not pushed at review time)
- **Reviewer:** code-critic subagent (FORGE Guard)
- **Verdict:** **BLOCKED — loop back to Render** (1 🔴 blocker + 2 test-quality findings). Everything else verified clean & byte-identical.

---

## 🔴 Blockers

### B1 — List GET drops every agreement's line items (live byte-identity regression)

**Chain:** `app/api/pricing/route.ts:64` (`agreements.map(toAgreementWireDto)`) →
`lib/adapters/supabase/PricingRepository.ts:207` (`listAgreements` maps via `toAgreement`, header-only — `toAgreement` at `:150-173` builds **no `lines` key**) →
`lib/api/pricing/dto.ts:74` (`toAgreementWireDto`: `const lines = "lines" in a ? a.lines : []` → hits the false branch → emits `lines: []` for **every** list row).

**Root cause:** PR1's `PricingRepository.listAgreements` returns `PriceAgreement[]` (header-only by design — port doc says "list all agreement *headers*"). But the OLD list route (`app/api/pricing/route.ts`, pre-diff) selected `price_agreement_lines(...)` and returned `lines: (a.price_agreement_lines ?? []).sort((x,y)=>x.position-y.position).map(shapeLineToMap)` — i.e. **fully populated, position-sorted lines per agreement**. The PR1 port shape was never byte-identical-capable for the list; PR1 shipped the service DARK so it never surfaced. PR2 wired it → the gap surfaced as `lines: []`.

**Live impact** (`app/pricing/page.tsx`, list object reused for detail with NO re-fetch on open at `:121`):
- `:129` — card badge `{agreement.lines.length} product(s)` → **"0 products"** on every card.
- `:730 / :732 / :736` — detail view → **"Products (0)"** / "No products on this agreement".
- `:981` — PDF/print export reads `agreement.lines` → **empty line table**.

Single-agreement GET is fine (`getAgreementById` → `PriceAgreementWithLines`, lines populated). Regression isolated to the **list** endpoint (the default landing screen).

**Fix (byte-identity-preserving):** make the list path carry position-sorted lines — change `listAgreements` to return `PriceAgreementWithLines[]` and have both adapters fetch+map+sort lines (reuse the `getAgreementById` embedded-select + line mapping). Update `PricingService.listAgreements` signature + the contract test. `toAgreementWireDto`'s populated-lines branch already handles the shape. **Loop back to Render** (Order's strategy is sound; this is a contained correctness fix + a PR1-inherited port-shape correction).

---

## Test-quality findings (why B1 shipped green)

### T1 (🟡) — Integration list-GET test passes vacuously on the bug
`tests/integration/pricing.test.ts:174-177`: asserts `Array.isArray(mine!.lines)` then loops `for (const l of mine!.lines)`. With `lines: []` the array check passes and the loop never runs → **green on the bug**. Seeded agreements have 2 lines (`:81-84`); single-GET correctly asserts `toHaveLength(2)` (`:196`). **Fix:** add `expect(mine!.lines).toHaveLength(2)` (or `.length > 0`) to the list-GET test.

### T2 (🟢) — DTO unit test encodes the empty-lines assumption as correct
`tests/unit/api/pricing.dto.test.ts` — case "header-only PriceAgreement (list shape) — lines emitted as []" asserts `lines: []`. The header-only fallback is a fine defensive helper feature, but this test frames it as the *list's real behaviour*. **Fix:** after B1, re-label as "header-only **defensive** fallback" and add a list-with-lines case mirroring wire output.

---

## ✅ Verified clean (no action)

**Byte-identity — the other 4 routes + single-GET + email (PASS):**
- Single GET → `toAgreementWireDto(getAgreementById)`, lines populated, key order/values verbatim.
- PATCH response `{id, reference_number, status, updated_at}`; `'' → null` norm; DB-error→500 + `[pricing PATCH]` log preserved.
- DELETE log `[pricing DELETE] deleted by ${userId}` drops the ref — **Decision R5 accepted**, built correctly (no extra read).
- RBAC owner-read DB-error → 403/404 swallow reproduced in all 4 owner-checks — **Decision R3 / backlog F-TD-24 accepted**.
- `addLine`/`updateLine` → `toLineWireDto` (exact key order, `Number(price)`, `is_freetext=!productId`, `'Unknown'` fallbacks).
- `replaceLines` count = `body.lines.length`; position `?? i` default in adapter.
- Email: both skip-guards in order with verbatim log strings; `is_freetext` uses domain `!productId` (**Decision R4 accepted**); PATCH still `await sendPricingEmail(...).catch(...)` (mailer error swallowed, PATCH stays 200).
- Recipient filter (`active` + role in admin/sales/office + email contains `@`) reproduced. Minor (accepted): recipients now name-sorted (use-case `orderBy:[]` → adapter default `order by name`) vs old unsorted — only the email `to[]` order, invisible to recipients.

**Hexagonal — PASS:** routes shed ALL direct `@supabase/*`/`supabaseService`/`/rest/v1/` (remaining grep hits are doc-comment text). `lib/domain`/`lib/ports` import no adapters. Use-case imports ports + the service type only. Adapters wired solely in `lib/wiring/pricing.ts`. Rip-out **improves** (raw fetch in `pricing-email.ts` gone).

**Depth verdicts:**
- `lib/usecases/pricingActivationEmail.ts` → **DEEP** (composes two domains + owns the recipient filter; not a pass-through).
- `lib/api/pricing/dto.ts` → **DEEP** (concentrates the camelCase↔snake_case + key-order wire contract).
- `lib/wiring/pricing.ts` singleton → wiring, correct.

**Constraints — PASS:** no `.sql`, no `package.json`/lock change, no new method on `lib/ports/*`, no service change.

**Test / lint / type:** `tsc --noEmit` no errors in touched files (pre-existing F-TD-01 nits excluded); eslint clean on all touched files; unit **1908/1908**; pricing integration **20/20** (⚠️ green on B1 — see T1).

---

## Loop-back instruction
Render: (1) B1 — list path carries position-sorted lines (`listAgreements` → `PriceAgreementWithLines[]`, both adapters + service + contract test); (2) T1 — tighten the integration list-GET test; (3) T2 — re-frame the dto header-only case + add a list-with-lines case. Re-run unit + pricing integration. Then re-Guard the delta.

---

## Re-review (delta) — 2026-06-19 — **B1 CLOSED, CLEAR → ANVIL**

Fix delta = 3 commits (`4459b48` B1, `a42bed0` T1, `fe51e16` T2). Re-reviewed `git diff 4459b48~1..HEAD`.

- **B1 CLOSED.** `listAgreements` return widened to `PriceAgreementWithLines[]` (existing method — **no new port method**). Supabase adapter maps via `toAgreementWithLines` using the SAME single embedded `AGREEMENT_COLS` select as `getAgreementById` — **no N+1**; lines position-sorted; per-line wire output matches the old `shapeLineToMap` field-for-field; `isExpired`/joins/`created_at desc` unchanged. Fake adapter mirrors it. Service signature widened (type-only). `app/api/pricing/route.ts` **untouched** (the populated lines flow through `toAgreementWireDto`'s `"lines" in a` branch) → list wire output byte-identical to pre-PR2. No migration.
- **T1 genuine guard:** integration list-GET now asserts `lines.toHaveLength(2)` + per-line key shape — would fail on `lines: []`.
- **T2 honest:** header-only case re-labelled a defensive fallback; new list-with-lines case asserts populated, exact-key-order line DTOs and that the DTO does NOT re-sort (positions `[1,0]` preserved — sorting is the adapter's contract, verified separately).
- **No new findings.** tsc 0, lint 0, unit **1910/1910**, pricing integration **20/20**, Supabase adapter contract **29/29** (incl. the new list-with-lines case on the real DB).

**Verdict: CLEAR — advance to ANVIL.**
