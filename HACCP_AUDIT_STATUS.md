# HACCP Kiosk — Audit Status

Living tracker for the section-by-section audit before go-live.
Last updated: 2026-04-20

Legend — [x] done on main · [ ] outstanding · [~] in progress

---

## CCP 2 — Cold Storage (current focus)

### Phase A — go-live blockers

- [x] **A2. Wire CCA popup to `haccp_corrective_actions`**
  Captures cause, action (CA-001 verbatim), disposition, recurrence prevention,
  notes. Equipment-failure cause switches action list. One CA row per deviating
  reading, linked via `source_table`/`source_id`. `management_verification_required=true`
  on critical. Server pre-validates CA is supplied and complete before any insert.
  _Merged 2026-04-20 (commits f67056e, 8650da6)._

- [ ] **A1. Restore unique index `(date, session, unit_id)` on `haccp_cold_storage_temps`**
  Dropped for testing, never put back. Stops duplicate submissions.

- [ ] **A3. Server re-derives `unit_type` from DB by `unit_id`**
  Currently trusts client body. Hardening only — low probability of abuse.

- [ ] **A4. Reject POSTs where `date != today UK`**
  HACCP records must be immutable after-the-fact.

- [ ] **A5. Retire Process Room from `haccp_cold_storage_units`**
  Belongs in CCP 3, currently double-logged under two CCPs.
  DB: `UPDATE haccp_cold_storage_units SET active=false WHERE name='Process Room'`.
  Code: remove `unit_type='room'` handling from route.ts + page.tsx + Quick Ref.

- [ ] **A6. Drive chiller thresholds from `unit.max_temp_c`**
  Currently hardcoded — changing `max_temp_c` in DB has no effect. Also resolves
  the "per-unit limit" design question (Option A: unit-level, DB-driven).

### Phase C — later, not blockers

- [ ] Real-time WhatsApp/email alert to Hakan/Ege/Daryl on critical deviations
- [ ] Admin amendment flow (add correction notes to immutable readings)
- [ ] Atomic readings+CA insert via RPC (replaces the `ca_write_failed` flag)

---

## Other CCPs — full audit still to do

- [ ] **CCP 1 — Receipt / Goods In** (`/haccp/delivery`) — audit + CA wire-up
- [ ] **CCP 3 — Processing Room** (`/haccp/process-room`) — audit + CA wire-up; absorb Process Room reading once A5 is done
- [ ] **CCP-M / CCP-MP — Mince & Meat Prep** (`/haccp/mince`) — audit + CA wire-up

## SOPs

- [ ] **SOP 2 — Cleaning** (`/haccp/cleaning`) — audit + CA wire-up
- [ ] **SOP 3 — Calibration** (`/haccp/calibration`) — audit + CA wire-up
- [ ] **SOP 12 — Product Return** (`/haccp/product-return`) — audit + CA wire-up

## Sections not yet built (from handover doc)

- [ ] Dispatch Log UI (DB table exists)
- [ ] People / SOP 8 — health declarations, visitor log, return-to-work
- [ ] Admin HACCP panel (`/haccp/admin`)
- [ ] CCA admin view — resolve flow + management verification queue

---

## Pre go-live checklist

- [ ] Restore unique constraints dropped for testing:
  - `haccp_cold_storage_temps` (covered by A1)
  - `haccp_processing_temps (date, session)`
  - `haccp_daily_diary (date, phase, submitted_by)`
- [ ] Add species constraint to `haccp_mince_log` (first delete `TEST-BATCH-001`)
- [ ] Remove all remaining test/dummy records
- [ ] Export function (PDF/CSV for FSA inspectors)
- [ ] Staff training before first live shift

---

## Reference documents

- `HACCP_Policy_Handbook_V4_1.docx` — in project knowledge
- `HACCP_Checklists_Monitoring_Forms_V4_1.pdf` — uploaded 2026-04-20
- `HACCP_Checklists_-_Corrective_Actions_Reference_V1_1.docx` (CA-001) — uploaded 2026-04-20

## Session log

- **2026-04-20** — CCP 2 audit started. 19 April test data cleared. A2 complete and merged.
