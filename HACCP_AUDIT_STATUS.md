# HACCP Kiosk — Audit Status

Living tracker for the section-by-section audit before go-live.
Last updated: 2026-04-21

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
- [ ] **Adaptive CA popup redesign** — CCP 2 CA popup uses the old pattern
  (pick action from list, full 5-option disposition, generic recurrence list).
  Needs same Batch 3 treatment as CCP 1. **Revisit after CCP 1 go-live.**

---

## Other CCPs — full audit still to do

- [ ] **CCP 1 — Receipt / Goods In** (`/haccp/delivery`) — audit + CA wire-up
- [x] **CCP 3 — Processing Room** (`/haccp/process-room`) — Phase B complete

  - [x] **B1. Unique index `(date, session)` on `haccp_processing_temps`**
    `idx_haccp_pt_unique` applied. One temperature session per day. API
    converts Postgres 23505 into a clean 409 "already submitted for today".
    _Merged 2026-04-20._
  - [x] **B2. Unique index `(date, phase)` on `haccp_daily_diary`**
    `idx_haccp_dd_unique` applied. One diary phase (opening/operational/
    closing) per day. Clean 409 on duplicate. _Merged 2026-04-20._
  - [x] **B3. Temps POST — today-only date guard**
    Server rejects any date != today (Europe/London) with 400. Historical
    dates still viewable via GET date picker. _Merged 2026-04-20._
  - [x] **B4. Diary POST — today-only date guard**
    Same pattern as B3 for the diary path. _Merged 2026-04-20._
  - [x] **B5. Temps CCA popup wired to `haccp_corrective_actions`**
    Popup captures cause, action (CA-001 verbatim, switches by cause +
    breached channel), disposition, recurrence prevention, notes. One CA
    row per breached channel (product and/or room — up to 2 rows per
    submission), linked via `source_id`. `ccp_ref='CCP3'`.
    `management_verification_required=true` for any product breach or
    room >15°C. _Merged 2026-04-20._
  - [x] **B6. Diary issues write CA rows (quick version)**
    When issues=true, one CA row is written per failed check item.
    `source_table='haccp_daily_diary'`, `ccp_ref='SOP1-{phase}'`.
    `action_taken` carries the `what_did_you_do` free text.
    `product_disposition` and `recurrence_prevention` left null in this
    quick version. _Merged 2026-04-20._

  - [ ] **B6 follow-up — structured diary CA (revisit)**
    Current quick version does not capture structured cause, disposition,
    or recurrence prevention for diary issues. Full version needs an
    action-picker UI per failed check item mapped to CA-001's SOP1 / SOP2
    / SOP3 action lists (~6 issue types). Estimated 90 min once scoped.
  - [ ] **B7. DB-driven CCP 3 limits** (deferred — 4°C/12°C are fixed
    legal limits under EC 853/2004, unlikely to change)
  - [ ] **Adaptive CA popup redesign** — CCP 3 CA popup (cold-storage +
    process-room) uses the old pattern (pick action from list, shared cause,
    full 5-option disposition picker, generic 6-option recurrence list).
    Needs same Batch 3 treatment as CCP 1: action server-derived, cause
    relevant to scenario, disposition pre-filled/limited, recurrence
    cause-aware. **Revisit after CCP 1 go-live.**

- [~] **CCP 1 — Goods In / Delivery Intake** (`/haccp/delivery`)
  — audit complete, Batches 1+2+3 merged. See **`HACCP_CCP1_AUDIT.md`**.
  - [x] **C11** clean 409 on delivery_number race condition
  - [x] **C2** supplier_id resolved from chip UUID
  - [x] **C1** CCA popup wired to haccp_corrective_actions (two-track)
  - [x] **C8** traceability mandatory on every submission
  - [x] Batch code DDMM-CC-N + ISO alpha-2 country codes
  - [x] **C6** contamination_type enum (uncovered / contaminated_faecal /
    packaging_damaged / missing_docs). DB column added. Sub-picker shown
    for yes + yes_actioned. Required before CCA popup opens.
  - [x] **Adaptive CA popup** — action_taken server-derived per CA-001
    protocol; causes split per track; disposition pre-filled + locked/limited
    by scenario; recurrence cause-aware (3-4 options per cause).
  - [ ] Phase D items (C5, C12, C13, C15, C16, C17)
  - [ ] Phase E enhancements (photos, NCR, supplier dashboard, etc.)

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
- [ ] **S1 — Suppliers admin CRUD** (`/haccp/admin/suppliers`) — add/edit/deactivate
  approved suppliers. Currently edit via SQL only. Part of Admin HACCP panel.

---

## Pre go-live checklist

- [ ] Restore unique constraints dropped for testing:
  - ~~`haccp_cold_storage_temps`~~ (done — A1)
  - ~~`haccp_processing_temps (date, session)`~~ (done — B1)
  - ~~`haccp_daily_diary (date, phase, submitted_by)`~~ (done — B2, scoped to `(date, phase)` per design call)
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

- **2026-04-20** — CCP 2 audit started. 19 April test data cleared. A2 (CCA wiring) complete and verified on prod — test submission produced 4 linked CA rows with correct mgmt_verify flags. A1 (unique index) complete. A5 (Process Room retirement) complete — CCP 2 now covers 4 units. A3 (server-derived unit_type) + A4 (today-only date guard) complete. A6 (DB-driven thresholds) complete. **CCP 2 Phase A fully closed out.** CCP 3 audit started. B1 + B2 (unique indexes), B3 + B4 (today-only guards), B5 (temps CCA wiring) and B6 quick-version (diary CA writes) all complete. B6 full structured version deferred to follow-up. **CCP 3 Phase B closed out.** CCP 1 audit complete — findings + phased plan written to `HACCP_CCP1_AUDIT.md`. No code changes yet; awaiting decisions on 3 open questions.
