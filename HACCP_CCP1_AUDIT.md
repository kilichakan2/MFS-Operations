# CCP 1 — Goods In / Delivery Intake Audit

> **Route:** `/haccp/delivery` → `/api/haccp/delivery`
> **DB tables:** `haccp_deliveries`, `haccp_suppliers`
> **Audit date:** 2026-04-20
> **Status:** Audit complete, awaiting implementation sign-off

This is the first CCP in the traceability chain. Every downstream record
(mince, meat prep, dispatch, returns) ties back to a `batch_number` that
originates here. Changes in this section ripple everywhere — treat with
more caution than CCP 2 / 3 changes.

---

## Reference documents

- HB-001 HACCP Policy Handbook V4.1 — CCP 1 section
- MF-001 HACCP Checklists & Monitoring Forms V4.1 — CCP 1 form page 3
- CA-001 HACCP Corrective Actions Reference V1.1 — CCP 1 section
- Retained EU Reg 178/2002 Article 18 — one-up / one-down traceability
- Retained EU Reg 852/2004 Article 5 — HACCP obligation
- Retained EU Reg 853/2004 Annex III Section I — meat of animal origin,
  chilling + transport + cutting plant rules
- Retained EU Reg 1760/2000 + UK Compulsory Beef Labelling Scheme
  (enforced post-Brexit by RPA via Bovine Info Exchange)
- Handbook SOP 5B — urgent placement procedures (cross-referenced from CCP 1)

---

## Where things stand

### Data on 2026-04-20

- 8 deliveries logged total; 0 have `supplier_id` populated — all using
  legacy text `supplier` field
- 2 of the 8 have `corrective_action_required = true`
- `haccp_corrective_actions` rows with `ccp_ref='CCP1'`: **0**
- 4 active approved suppliers (Pickstock, Dunbia, Kepak, Heartshead Meats)
- Existing test delivery with `supplier='Test Supplier'` — not in approved list

### Schema snapshot — `haccp_deliveries`

Has the right shape but several fields are nullable that shouldn't be, and
the FK to suppliers exists but is never filled.

Key fields:
- `supplier` (text), `supplier_id` (uuid, nullable, FK) — **both exist,
  only the text field is populated**
- `product_category` CHECK ∈ (red_meat, offal, mince_prep, frozen)
- `temperature_c` + `temp_status` CHECK ∈ (pass, urgent, fail)
- `covered_contaminated` CHECK ∈ (no, yes, yes_actioned)
- `born_in`, `reared_in`, `slaughter_site`, `cut_site` — all nullable
- `batch_number` — nullable; server-built as `DDMM-COUNTRYCODE-SITE-N`
- `delivery_number` — int, UNIQUE(date, delivery_number) enforced
- `corrective_action_required` — flag, not linked to `haccp_corrective_actions`

Indexes: date, supplier_id, batch_number, submitted_by, + unique(date, delivery_number).

### Code shape

- **Server** (`route.ts`) — 189 lines. Validates required fields, computes
  status + batch number server-side, counts today's rows for delivery_number,
  inserts the row. No CA row writes. No supplier_id resolution.
- **Client** (`page.tsx`) — 1048 lines. Form with supplier chips + "Other",
  category picker, numpad, country-of-origin pickers, slaughter/cut site
  inputs. CCAPopup is **acknowledgement-only** — displays required actions
  per CA-001, user clicks "Confirm", no structured capture of cause,
  disposition, recurrence prevention, notes.

---

## Findings

Scoring the same way as CCP 2 / CCP 3 — critical = go-live blocker.

### 🔴 Critical (go-live blockers)

**C1. CCA popup is acknowledgement-only — no CA row written**

Same pattern gap as CCP 2 pre-A2 and CCP 3 pre-B5. Two existing deviations
in DB, zero CA rows for CCP1. The popup displays CA-001 required actions
and asks the user to confirm they've been taken — but captures nothing
structured. Regulatory text (MF-001 overview): records must identify
*cause of deviation*, *action taken*, *product disposition*, *measures to
prevent recurrence*. None of that is stored.

**C2. `supplier_id` never populated — approved supplier chain is broken**

Every delivery in DB has `supplier_id = NULL`. The approved supplier list
(`haccp_suppliers`) exists, the form even displays those suppliers as
chips — but the server inserts only the text name. An FSA inspector
running `SELECT COUNT(*) FROM haccp_deliveries WHERE supplier_id IS NULL`
gets 100%. The approved supplier programme (a preventive measure under
Reg 852/2004 Art 5 HACCP) is documentarily invisible. This also blocks
any supplier-performance dashboarding later (C-perf item below).

**C3. "Other" supplier option bypasses approved list entirely**

The form has a chip labelled "Other" that lets the user type any
supplier name free-text. That breaks the approved supplier programme at
the point of receipt. Options:
- Disable "Other" entirely (strict)
- Keep "Other" but require admin/manager role + reason + auto-flag for
  review (pragmatic — handles occasional emergency/new suppliers)
- Keep "Other" but force the new supplier through a *provisional* state
  until an approval workflow signs them off (cleanest, more dev work)

Today's 8 deliveries include one `"Test Supplier"` — a real example of
this failure mode (test data, but proves the pattern).

### 🟠 High

**C6. Contamination is a single tri-state, not classified per CA-001**

`covered_contaminated` is `no | yes | yes_actioned`. CA-001 defines four
*distinct* contamination/docs deviation types, each with its own action
list:
- Product uncovered / contaminated (minor exposure)
- Product contaminated (faecal / wool / hide) — trim + dispose as Cat 2/3 ABP
- Packaging damaged
- Missing documentation

Today all of these get collapsed into one generic "yes" flag. The popup
shows a single contam action list (the faecal/wool/hide one). Three of
the four deviation categories are therefore guided wrong.

**C8. Traceability fields are optional for red meat**

`born_in`, `reared_in`, `slaughter_site`, `cut_site` are nullable on the
schema and not enforced by the form for `red_meat` category. The UK
Compulsory Beef Labelling Scheme (retained Reg 1760/2000, RPA enforced)
mandates *born in / reared in / slaughtered / cut* for **beef**, linked
to an EC establishment approval number. Missing these fields:
- 5 of 8 existing deliveries have NULL `born_in`
- 5 of 8 have NULL `slaughter_site`
- Even where populated, site numbers are inconsistently formatted
  ("1234", "GB1234", "GB 1234") — should be `GB XXXX EC` format

For lamb/mutton the scheme is voluntary — nice-to-have rather than legal.
For beef it's a legal requirement. The code should at minimum enforce
traceability fields on red_meat submissions (beef-inclusive).

### 🟡 Medium

**C4. Handbook vs CA-001 — conflicting chilled meat temperature limits**

- HB-001 CCP 1: "Fresh meat core ≤7°C" (this matches Reg 853/2004
  Annex III — carcase at end of slaughterhouse chilling)
- CA-001 CCP 1: "Chilled meat ≤8°C legal maximum, target ≤5°C"
  (this matches the FSA wholesale/retail receipt figure)
- App uses CA-001 figures: 5/8 for red meat

Not a bug — it's a documentation gap. 7°C applies to carcases leaving
the slaughterhouse; 8°C applies to onward transport/receipt (there's a
2°C tolerance for transport per 853/2004). Recommend clarifying in
handbook V4.2.

**C5. Handbook's "urgent placement" threshold (7.2°C) not surfaced**

Handbook CCP 1: "If temperature exceeds 7.2°C at intake → Urgent placement
into chiller required. Cross-reference: SOP 5B for urgent placement
procedures." The code uses a 5/8 banding; 7.2°C falls into `urgent`
(conditional accept) — operationally same outcome but the SOP 5B
cross-reference isn't shown to the user.

**C11. Delivery number race condition (saved by unique index, but leaky)**

POST handler does `COUNT today` + 1 to assign delivery_number. Two
simultaneous submissions race. Saved by `uq_haccp_deliveries_date_num`
unique index (23505 on conflict), but the error surfaces as raw Postgres.
Should catch 23505 and return a friendly "Another delivery was logged
just now — please retry" + ideally auto-retry once.

**C12. Knife sterilisation ≥82°C not captured**

Handbook CCP 1: "Sterilise knife after checking each delivery (≥82°C)".
No field on the form. Easy add: boolean checkbox "Probe sterilised ≥82°C
after check" on every delivery submit.

**C14. Dual supplier storage — legacy text + unused FK**

Related to C2. The text `supplier` column and the `supplier_id` FK both
exist. Text is the source of truth today. Migration needed: backfill
supplier_id from text where the name matches an approved supplier; keep
supplier as denormalised cache; require either supplier_id OR an
explicit `other_supplier_name` at insert time.

**C15. No transport vehicle temperature record**

Reg 853/2004 Annex III Section I Ch. V requires documented transport
conditions. At receipt the delivery vehicle's chilled/frozen compartment
temperature should ideally be recorded alongside product core temp. Not
captured today.

**C16. HMC halal certificate reference not captured**

MFS operates HMC-certified. Halal chain of custody requires supplier HMC
cert verification at receipt for halal product. Not FSA — but
operationally a gap for the business. A `hmc_cert_ref` text field on
halal deliveries would close it.

### 🟢 Low / informational

**C13. No supplier notification log**

CA-001 for temp >8°C: "Notify supplier in writing within 24 hours." No
field to record supplier-notified / when / by whom. Could be a follow-up
record on deviating deliveries.

**C17. EC approval number format not validated**

`slaughter_site` and `cut_site` accept any text. Should ideally validate
against the UK approval number format (`GB XXXX EC` pattern) or at least
warn on submission if format looks off.

**C7. Temp-pass + contam-only still opens the popup (correct, but flag)**

If `temp_status=pass` and `covered_contaminated=yes`, popup opens
showing only contam actions — works correctly. Flagging this is expected
behaviour, not a bug. Included so next reviewer doesn't mistake it for
one.

### 💡 Enhancement ideas (not strictly defects)

**P1. Photo capture on deviation.** CA-001 for reject: "Photograph
product and temperature reading." App should support attaching a photo
(Supabase Storage) to a deviating delivery record.

**P2. Auto-generated NCR.** CA-001 for reject: "Complete
Non-Conformance Report." An NCR record with supplier details + deviation
summary could be auto-drafted server-side and queued for supplier
follow-up.

**P3. Supplier performance dashboard.** Handbook: "Review supplier
approval status if repeated failures." No visibility today. A rolling
90-day rate of urgent/fail deliveries per supplier would surface
underperformers automatically.

**P4. Species tag on delivery.** Mince and meat prep logs have
`product_species`; deliveries don't. For downstream kill-date rules it'd
be cleaner to capture species at receipt (beef/lamb/chicken/mixed)
rather than inferring from product name.

**P5. CHED / import documentation reference.** For imports, a Common
Health Entry Document reference should be captured. MFS imports from
AUS / NZ / IRL / BRA — this is relevant.

---

## Proposed plan — Phases C + D

Numbering starts at C to continue the letter series (A = CCP 2, B = CCP 3).

### Phase C — blockers before go-live

| # | Task | Effort | Depends on |
|---|---|---|---|
| C1 | Wire CCA popup → `haccp_corrective_actions`. Port the CCP 2 A2 shape. Cause + action + disposition + recurrence + notes. Two deviation tracks (temp / contamination) with CA-001 verbatim action lists. One CA row per active deviation track. | 90 min | — |
| C2 | Resolve supplier_id server-side from the chip selection. When "Other" is not used, require supplier_id to be populated before insert. | 20 min | — |
| C3 | Gate "Other" supplier behind admin role + mandatory reason + auto-flag in notes. | 20 min | C2 |
| C6 | Classify contamination per CA-001: `uncovered`, `contaminated_faecal`, `packaging_damaged`, `missing_docs`. DB enum migration. Form adds a second picker when `yes/yes_actioned` chosen. Popup switches action list by type. | 60 min | — |
| C8 | Require born_in + slaughter_site + cut_site for `red_meat` category at form-level and server-level. Enforce `GB XXXX EC` format validation. | 30 min | — |
| C11 | Catch 23505 on `uq_haccp_deliveries_date_num` → clean 409 with retry guidance (optionally auto-retry once). | 10 min | — |

**Total Phase C: ~3.5 hours**

### Phase D — improvements

| # | Task | Effort |
|---|---|---|
| C12 | Add "Probe sterilised ≥82°C" boolean to the form + DB column. | 15 min |
| C5 | Surface 7.2°C urgent-placement trigger + SOP 5B cross-reference in the popup. | 15 min |
| C14 | Data migration: backfill `supplier_id` on historical rows from text name; keep text as denormalised cache. | 20 min |
| C15 | Add `vehicle_temp_c` column + field on form. | 15 min |
| C16 | Add `hmc_cert_ref` text column + field (shown for red_meat / offal / mince_prep). | 15 min |
| C13 | Add `supplier_notified_at` + `supplier_notified_by` for deviating deliveries; optional follow-up field after CA submit. | 30 min |
| C17 | Regex validation on slaughter_site / cut_site (warn not block). | 10 min |

**Total Phase D: ~2 hours**

### Phase E — enhancements (after CCP 1 basics settle)

| # | Task |
|---|---|
| P1 | Photo capture on deviation (Supabase Storage) |
| P2 | Auto-draft NCR on reject |
| P3 | Supplier performance dashboard (rolling 90d) |
| P4 | Species tag on delivery |
| P5 | CHED / import docs for non-UK deliveries |

### Documentation follow-ups (out of app scope)

| | |
|---|---|
| C4 | Raise handbook vs CA-001 temperature-limit clarification with Hakan; note in Document Control Register when HB-001 V4.2 goes out. |
| | Confirm CCP 1 process with Darrel/Daryl — especially C3 "Other" supplier gating. |

---

## Open questions before implementation

1. **C3 — how strict on "Other" supplier?** My vote: keep it, but admin-role-only + mandatory reason, auto-flag for management verification. Strict-disable would break the occasional emergency substitute supplier.

2. **C6 — enum migration on existing data.** There are 2 existing deviation rows with `covered_contaminated='yes_actioned'`. Proposing default-migrate all existing `yes/yes_actioned` → `contaminated_faecal` (most common + matches the single action list the popup currently shows). Or wipe and start fresh pre-go-live. Depends on whether any of the 8 delivery rows are "real" or test.

3. **C8 — retrospective enforcement.** Existing historical rows have null traceability. Not backfilling — just enforcing going forward. OK?

4. **Order to tackle.** My suggestion:
   - **First batch:** C1 + C2 + C11 (core CA + supplier chain). ~2h.
   - **Second batch:** C3 + C6 + C8 (contam + traceability + supplier gating). ~2h.
   - **Third batch:** Phase D items (hardening + improvements). ~2h.

---

## Session log

- **2026-04-20** — Audit complete. Schema + current data reviewed. 8
  deliveries in DB, 0 with supplier_id, 2 deviations with 0 linked CA rows.
  18 findings across 4 severities + 5 enhancement ideas. No code
  changes made.
