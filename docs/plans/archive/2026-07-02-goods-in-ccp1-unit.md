# Goods In (CCP 1) unit — kit rebuild + DB-driven verified thresholds — LOCKED SPEC

**Status:** Gate 1 APPROVED 2026-07-02 (FORGE standard lane). Requirements-audit gate passed same day.
**Screen:** `app/haccp/delivery/page.tsx` (route stays `/haccp/delivery`; all visible labels become "Goods In").
**Tier:** B (ADR-0014) — build straight on the kit, judge on live preview. No Claude Design mockup.

## 1 · Scope A — kit rebuild on the colour-pairing system

Recompose the screen from `components/ui/` + semantic tokens ONLY (token-purity: add `/haccp/delivery` to the guard SCREENS list). Pairing law per `docs/plans/archive/2026-07-01-colour-pairing-system-unit2.md` (§4 matrix, §11 locked decisions).

- `ScreenHeader` bold-navy (real `<header>`, `surface` prop) — no logo (F-TD-43 closed: logo-less accepted). Keep back-to-hub, Quick ref, Handbook (HB-001) actions.
- Kit `NumberPad` replaces the hand-rolled Numpad (cold-storage precedent); full-screen temp entry keeps the live pass/amber/reject verdict + guidance copy.
- Kit `Modal` (sheet) for: CCA popup, delivery detail, Quick reference.
- Kit `Badge`/`StatusPill`/`Banner` for statuses, SOP 5B banner, flash confirmation.
- **Green/amber caging:** green/amber ONLY on temperature verdict tiles + pass/warn/fail badges. Current chrome greens are ILLEGAL and must be repainted: "No — all clear" contam button, "Same as born in"/"Same as slaughter" chips, "N logged" counter, green flash banner, green "No allergens" filled button. Primary actions = orange-500 + ink-900 per pairing law; "something is wrong" = Mediterranean Red family only. EXCEPTION recorded 2026-07-02 (Hakan): the two amber Quick-reference explainer boxes and the CCA urgent track header stay amber — verdict-adjacent informational furniture, explicit exception to the caging law (review 🔵5).
- Category chips: map raw Tailwind palette colours to brand category colours via tokens (brand PDF is source of truth).
- ALL existing behaviour KEPT (full inventory read 2026-07-02): category-first form (9 categories drive suppliers/BLS/temp limits), category-filtered supplier chips + Other free text, meat-only BLS block (born/reared country pickers 14 curated + ISO search, slaughter/cut site codes with same-as shortcuts, live DDMM-CC-N batch preview), contamination 3-way + 4 types + notes, SALSA 1.4.2 allergen check (14 allergens, auto-CA on meat/poultry categories only), two-track CCA popup (read-only CA-001 protocol steps, cause, disposition locked-to-Reject on fail, cause-aware recurrence, shared notes), Today/This-week/Last-week log + detail sheet, SOP 5B banner, Quick ref sheet, Handbook link, Europe/London stamping, `ca_write_failed` warning path.
- Labels-only rename: "Goods In" in header/copy; keep "CCP 1 — Delivery Intake" subtitle sense. NO route/middleware/API changes for the rename.

## 2 · Scope B — DB-driven CCP-1 temperature thresholds (CCP-3 pattern, verified bands)

**Verified against live legislation 2026-07-02** (Reg 853/2004 Annex III Sec I & II on legislation.gov.uk; Quick-frozen Foodstuffs (England) Regs 2007; UK chill-holding 8°C):

| Category | Pass (target) | Amber (conditional accept, CA logged) | Reject | Basis + notes |
|---|---|---|---|---|
| lamb, beef (fresh red meat) | ≤5 | 5–8 | >8 | **Hakan's locked decision 2026-07-02: keep >8** (general UK chill-holding 8°C as rationale). NOTE: Reg 853/2004 specific red-meat transport limit is 7°C core — this band sits 1°C above it; register must carry the written justification. |
| offal | ≤3 | — | >3 | Reg 853 (3°C). Unchanged. |
| poultry | ≤4 | 4–5 | >5 | Law = ≤4°C (Annex III Sec II), no legal headroom. **Hakan's locked decision: 1°C documented grace band** for probe/unloading fluctuation — register must carry the written justification. WAS ≤8 pass (illegal) — big fix. |
| dairy, chilled_other | ≤8 | — | >8 | UK chill-holding. Unchanged. |
| frozen, frozen_beef_lamb | ≤-18 | -18 to -15 | >-15 | QFF Regs 2007 tolerance. Unchanged. |
| dry_goods | no temp CCP | — | — | Unchanged. |

(`red_meat` and `mince_prep` legacy keys exist in calcStatus but are not selectable on this screen — carry their rows for band-resolution completeness: red_meat = lamb/beef bands; mince_prep = ≤4/>4 as today.)

Implementation mirrors `haccp_process_room_thresholds` EXACTLY:
- New table `haccp_goods_in_thresholds` (per category: target_max + legal_max semantics, nullable amber where no band) + immutable `haccp_goods_in_threshold_audit` (who/when/old→new).
- Admin edit DOUBLE-LOCKED: route `isAdmin` + DB RLS `is_admin()`; pgTAP proves non-admin write DENIED.
- Resolution FAIL-CLOSED (missing/deactivated row must never grade against a looser ruler; no on/off toggle for fixed points — process-room Guard lesson).
- Admin UI: extend `/haccp/admin` → Thresholds with a Goods In section; on-save reminder to update DOCUMENT_CONTROL §4 + retrain.
- Migration filename: full 14-digit timestamp `YYYYMMDDHHMMSS_name.sql`. Additive only (expect no PITR gate, verify at ANVIL).
- Seed values = the locked table above.

## 3 · Scope C — single-source the band rule

New `lib/domain/goodsIn.ts` (processRoom.ts twin): band resolution + status derivation (pass/urgent/fail semantics preserved — DB values in, verdict out). Client `calcStatus` AND the daily-checks service's `temp_status` derivation both import it. Kill the duplicate. Server remains authoritative on persist.

## 4 · Register updates (same PR)

`docs/reference/haccp/DOCUMENT_CONTROL.md` §4: correct CCP-1 rows (current "fresh ≤4 / frozen ≤-12" are wrong — -12 is the QFF retail-cabinet exception, not receipt; 4 is poultry's limit, not red meat's). Write the new bands + the TWO written justifications (red-meat >8 vs Reg 853 7°C; poultry 4–5 grace band) + note thresholds are now app-configurable (admin, audited) like CCP-3. §7-style retrain reminder applies.

## 5 · Hard guards

- Printer-port label printing UNTOUCHED (`PrintLabelStrip`, `buildDeliveryInput`, `getPrinter` — PRs #98–#105). Byte-preserve the print flow.
- Hub alarm logic untouched (`lib/haccp-alarm-status.ts`, `hooks/useHACCPAlarm.ts`).
- Server hexagon respected (F-19 daily-checks service; route stays thin).
- i18n stays EN (F-UI-I18N-01 separate task).
- HACCP safety-critical → exhaustive @critical browser-tap E2E + full ANVIL matrix on prod-build preview.
- Cert `Branch:` line bare (no backticks) + literal "CLEARED FOR PRODUCTION".
- F-TD-42 (admin green chrome) is NOT this unit — only the new Goods In section of /haccp/admin follows the pairing law; the rest of that screen repaints on its own turn.

## 6 · Supplier-facing behaviour changes (Hakan walked in knowing)

- Poultry 4–8°C deliveries that passed until now: 4–5 → amber w/ CA; >5 → reject.
- Red meat: unchanged (>8 reject kept).
