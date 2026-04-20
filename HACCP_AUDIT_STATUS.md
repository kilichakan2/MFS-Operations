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

- [x] **A1. Restore unique index `(date, session, unit_id)` on `haccp_cold_storage_temps`**
  Re-applied as `idx_haccp_cst_unique`. Stops duplicate submissions at the DB level.
  API converts Postgres `23505` into a clean 409 "session already submitted".
  _Merged 2026-04-20._

- [x] **A3. Server re-derives `unit_type` from DB by `unit_id`**
  Server fetches active units and uses the stored `unit_type` in `tempStatus()`;
  client-supplied value is ignored. Readings for unknown/inactive units are
  rejected with 400. Also removed a duplicate units fetch in the CA block.
  _Merged 2026-04-20._

- [x] **A4. Reject POSTs where `date != today UK`**
  Server guard returns 400 "Readings may only be submitted for today's date"
  if the submitted date isn't today in Europe/London. Past dates can still
  be viewed via the date picker (GET), just not submitted to.
  _Merged 2026-04-20._

- [x] **A5. Retire Process Room from `haccp_cold_storage_units`**
  Process Room deactivated in CCP 2; stays in CCP 3 where it belongs.
  All `unit_type='room'` handling stripped from route.ts, page.tsx,
  `getCorrectiveAction()`, `getActionList()`, unit tile target line,
  and Quick Ref panel. CCP 2 now covers 4 units: Lamb, Dispatch, Dairy
  Fridges + Freezer. _Merged 2026-04-20._

- [x] **A6. Drive chiller thresholds from `unit.max_temp_c`**
  Pass/amber/critical logic now unified: pass ≤ `target_temp_c`, amber between
  target and `max_temp_c`, critical above `max_temp_c`. Both server and client
  read thresholds from DB per unit — changing a unit's limits takes effect
  instantly, no redeploy. Chiller targets aligned to CA-001 (3→5°C) as part
  of this. Unit tile now shows the actual per-unit target/max. Generic copy
  replaces "above 8°C" references. _Merged 2026-04-20._

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
  - ~~`haccp_cold_storage_temps`~~ (done — A1)
  - `haccp_processing_temps (date, session)`
  - `haccp_daily_diary (date, phase, submitted_by)`
- [ ] Add species constraint to `haccp_mince_log` (first delete `TEST-BATCH-001`)
- [ ] Remove all remaining test/dummy records
- [ ] Export function (PDF/CSV for FSA inspectors)
- [ ] Staff training before first live shift

---

## Document Control

- [ ] **Document Control Register itself is stale** (reprint as V1.1)
  Register V1.0 (Nov 2025) lists HB-001 V4.0, MF-001 V4.0, CA-001 V1.0 —
  the actual documents in use are V4.1 / V4.1 / V1.1. Version History Log
  and Annual Review Sign-Off tables are both blank. Needs updated reprint
  with version bumps logged and at least one review sign-off recorded.

- [ ] **Reconcile `haccp_documents` app tables against paper register**
  App has `haccp_documents`, `haccp_document_versions`, `haccp_document_reviews`.
  Need to verify rows match the Document Control Register exactly and that
  the `/haccp/documents` screen shows the correct current versions.

- [ ] **Source docs still outstanding for upcoming audits:**
  - `MMP-001` HACCP Policy — Mince & Meat Preparations (needed for CCP-M / CCP-MP audit)
  - `MMP-HA-001` M&MP Hazard Analysis & Flowchart (needed for CCP-M / CCP-MP audit)
  - `MMP-MF-001` Mince & Meat Preparations Monitoring Forms (needed for CCP-M / CCP-MP audit)
  - `HM-001` Health Monitoring Forms (needed for SOP 8 People)

---

## Reference documents

- `HACCP_Policy_Handbook_V4_1.docx` — in project knowledge
- `HACCP_Checklists_Monitoring_Forms_V4_1.pdf` — uploaded 2026-04-20
- `HACCP_Checklists_-_Corrective_Actions_Reference_V1_1.docx` (CA-001) — uploaded 2026-04-20
- `MFS_Document_Control_Register_V1_0.docx` — uploaded 2026-04-20

## Session log

- **2026-04-20** — CCP 2 audit started. 19 April test data cleared. A2 (CCA wiring) complete and verified on prod — test submission produced 4 linked CA rows with correct mgmt_verify flags. A1 (unique index) complete. A5 (Process Room retirement) complete — CCP 2 now covers 4 units. A3 (server-derived unit_type) + A4 (today-only date guard) complete. A6 (DB-driven thresholds) complete. **CCP 2 Phase A fully closed out.**
