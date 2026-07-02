# MFS Global — Document Control Register

**Maintained by:** Hakan Kilic (Managing Partner)  
**Last reviewed:** April 2026  
**Review frequency:** Annually, or whenever legislation, equipment, or procedures change  
**Location:** GitHub — `kilichakan2/MFS-Operations` `/docs/reference/haccp/DOCUMENT_CONTROL.md`

---

## Purpose

This register tracks all controlled documents at MFS Global Ltd. A document is "controlled" if it:
- Governs food safety procedures
- Is referenced in staff training
- Is required for FSA/EHO compliance
- Is used in the HACCP system

When any controlled document is updated, this register must be updated in the same commit.

---

## How to Update

1. Update the document (PDF, form, or code)
2. Increment the version number (V1.0 → V2.0 for major changes, V1.0 → V1.1 for minor corrections)
3. Update this register — version, date, change summary
4. If a training document changes: update the `CURRENT_VERSIONS` constant in `/app/haccp/training/page.tsx`
5. If a HACCP form changes: note which DB table and API route are affected
6. If FSA legislation changes: check all affected documents and update accordingly

---

## 1. Training Documents

These are the documents staff read and sign off against. Version changes require new training records.

| Document | Current Version | Issued | Next Review | Location |
|---|---|---|---|---|
| MFS Butchery & Process Room Training | V2.0 | Nov 2025 | Nov 2026 | `/mnt/project/` + Training register |
| MFS Warehouse Operative Training | V2.0 | Nov 2025 | Nov 2026 | `/mnt/project/` + Training register |
| MFS Health Monitoring Forms | V1.0 | Nov 2025 | Nov 2026 | `/mnt/project/` + People tile |

### What triggers a training document version change?
- Legislation or regulation change (Reg 852/2004, FIR 2014, etc.)
- New equipment introduced (new vacuum packer, MAP machine, etc.)
- CCP limits revised
- New product type added (e.g. poultry)
- Incident or near-miss requiring procedure change
- Annual review identifies gaps

### When a training document version changes:
- [ ] Update PDF and re-upload to project files
- [ ] Update version in the training register form (`CURRENT_VERSIONS` constant in training page)
- [ ] Update this register
- [ ] All staff must re-sign the new version — existing records remain, new record added
- [ ] Supervisor notified to arrange re-training

---

## 2. HACCP Policy Documents

| Document | Current Version | Issued | Next Review | Notes |
|---|---|---|---|---|
| MFS HACCP Policy Handbook | V2.0 | Nov 2025 | Nov 2026 | Referenced in both training documents |

---

## 3. HACCP Digital Forms (MFS Operations App — mfsops.com)

These are the digital forms that replace paper records. All records stored in Supabase (`uqgecljspgtevoylwkep`).

| Section | SOP/CCP Reference | DB Table | API Route | Last Updated |
|---|---|---|---|---|
| Goods In / Delivery | CCP 1 | `haccp_deliveries` | `/api/haccp/delivery` | Apr 2026 |
| Cold Storage Temps | CCP 2 | `haccp_cold_storage_temps` | `/api/haccp/cold-storage` | Apr 2026 |
| Process Room Temps | CCP 3 | `haccp_processing_temps` | `/api/haccp/process-room` | Apr 2026 |
| Daily Diary (Opening/Op/Closing) | SOP 1 | `haccp_daily_diary` | `/api/haccp/process-room` | Apr 2026 |
| Cleaning Log | SOP 2 | `haccp_cleaning_log` | `/api/haccp/cleaning` | Apr 2026 |
| Thermometer Calibration | SOP 3 | `haccp_calibration_log` | `/api/haccp/calibration` | Apr 2026 |
| Mince & Meat Prep | CCP-M | `haccp_mince_log` | `/api/haccp/mince-prep` | Apr 2026 |
| Product Returns | SOP 12 | `haccp_returns` | `/api/haccp/product-return` | Apr 2026 |
| Weekly Review | - | `haccp_weekly_review` | `/api/haccp/reviews` | Apr 2026 |
| Monthly Review | - | `haccp_monthly_review` | `/api/haccp/reviews` | Apr 2026 |
| Health Declarations | SOP 8 | `haccp_health_records` | `/api/haccp/people` | Apr 2026 |
| Return to Work | SOP 8 | `haccp_health_records` | `/api/haccp/people` | Apr 2026 |
| Visitor Log | SOP 8 | `haccp_health_records` | `/api/haccp/people` | Apr 2026 |
| Staff Training Register | - | `haccp_staff_training` | `/api/haccp/training` | Apr 2026 |
| Allergen Training Register | - | `haccp_allergen_training` | `/api/haccp/training` | Apr 2026 |

---

## 4. Critical Temperature Limits (CCP Reference)

Most limits are hardcoded in the app; any change requires a code update AND a training document update.

**Exception — CCP 3 Process Room limits are configurable in the app.** Since Apr 2026 the process-room product-core and room-ambient limits are stored in the database (`haccp_process_room_thresholds`) and editable by an **admin** at `/haccp/admin` → Thresholds. Every change is recorded in an immutable audit log (`haccp_threshold_audit`: who / when / old→new) and the admin is reminded on save to update THIS register (section 4) and retrain staff. The values below are the current approved bands and must be kept in step with the app.

**Exception — CCP 1 Goods In limits are also configurable in the app.** Since Jul 2026 the per-category delivery-intake bands are stored in the database (`haccp_goods_in_thresholds`) and editable by an **admin** at `/haccp/admin` → Thresholds. Every change is recorded in an immutable audit log (`haccp_goods_in_threshold_audit`: who / when / old→new) and the admin is reminded on save to update THIS register (section 4) and retrain staff. The band STRUCTURE (which categories carry an amber band or a temperature CCP at all) is fixed in code — only the numeric limits can be edited.

CCP 1 and CCP 3 use a three-band model: **pass** (≤ target), **amber / conditional accept** (above target, up to the ceiling — corrective action logged), **reject / critical** (above the ceiling — corrective action logged AND management sign-off required).

| CCP | Parameter | Limit | Source |
|---|---|---|---|
| CCP 1 — Goods In | Lamb / beef (fresh red meat) — pass | ≤5°C | See justification (1) below |
| CCP 1 — Goods In | Lamb / beef (fresh red meat) — conditional accept (CA logged) | 5–8°C | See justification (1) below |
| CCP 1 — Goods In | Lamb / beef (fresh red meat) — reject | >8°C | See justification (1) below |
| CCP 1 — Goods In | Offal — pass | ≤3°C | Reg 853/2004 (3°C offal limit) |
| CCP 1 — Goods In | Offal — reject (no amber band) | >3°C | Reg 853/2004 |
| CCP 1 — Goods In | Poultry — pass | ≤4°C | Reg 853/2004 Annex III Sec II (≤4°C) |
| CCP 1 — Goods In | Poultry — conditional accept (CA logged) | 4–5°C | See justification (2) below |
| CCP 1 — Goods In | Poultry — reject | >5°C | See justification (2) below |
| CCP 1 — Goods In | Dairy / chilled other — pass | ≤8°C | UK chill-holding (8°C) |
| CCP 1 — Goods In | Dairy / chilled other — reject (no amber band) | >8°C | UK chill-holding |
| CCP 1 — Goods In | Frozen (incl. frozen beef/lamb) — pass | ≤-18°C | Quick-frozen Foodstuffs Regs 2007 |
| CCP 1 — Goods In | Frozen — conditional accept (CA logged, re-freeze immediately) | -18 to -15°C | QFF Regs 2007 tolerance |
| CCP 1 — Goods In | Frozen — reject | >-15°C | QFF Regs 2007 |
| CCP 1 — Goods In | Dry goods | No temperature CCP — visual / condition check only | — |
| CCP 2 — Cold Storage | Fresh product storage | 0–4°C | Reg 853/2004 |
| CCP 2 — Cold Storage | Frozen product storage | ≤-18°C | Reg 853/2004 |
| CCP 3 — Process Room | Product core — pass | ≤4°C | Reg 853/2004 |
| CCP 3 — Process Room | Product core — amber (CA logged) | 4–7°C | Reg 853/2004 |
| CCP 3 — Process Room | Product core — critical (CA + mgmt sign-off) | >7°C | Reg 853/2004 |
| CCP 3 — Process Room | Ambient room — pass | ≤12°C | Reg 853/2004 |
| CCP 3 — Process Room | Ambient room — amber (CA logged) | 12–15°C | Reg 853/2004 |
| CCP 3 — Process Room | Ambient room — critical (CA + mgmt sign-off) | >15°C | Reg 853/2004 |
| CCP 4 — Final Product | Packaged product pre-dispatch | ≤4°C | Reg 853/2004 |
| SOP 3 — Calibration | Steriliser (knife/tools) | ≥82°C | Industry standard |
| SOP 3 — Calibration | Ice water probe test | 0°C ±1°C | Industry standard |
| SOP 3 — Calibration | Boiling water probe test | 100°C ±1°C | Industry standard |

**Written justifications for the two CCP-1 bands that deviate from the strictest legal reading:**

1. **Red meat reject line at >8°C** — Regulation 853/2004's specific red-meat transport limit is 7°C core; this register's reject line sits 1°C above it. Retained per the general UK chill-holding requirement of 8°C, with the 5–8°C band treated as a conditional accept with mandatory corrective action (place into coldest chiller, halve remaining shelf life, document, review supplier). Decision: Hakan, 2026-07-02.
2. **Poultry 4–5°C grace band** — the legal limit is ≤4°C (Reg 853/2004 Annex III Sec II) with no legal headroom. The 4–5°C band is a documented 1°C grace band for probe/unloading measurement fluctuation, treated as amber with mandatory corrective action; >5°C is a hard reject. Decision: Hakan, 2026-07-02.

*(Historical note: earlier revisions of this table listed "fresh meat receipt ≤4°C" and "frozen meat receipt ≤-12°C". Both were wrong: 4°C is poultry's limit, not red meat's, and -12°C is the QFF retail-cabinet exception, not a receipt limit. Corrected Jul 2026 to the bands the app actually enforces.)*

---

## 5. Legislation & Compliance Reference

| Regulation | Scope | Key Requirements |
|---|---|---|
| Regulation (EC) 852/2004 | General food hygiene | HACCP system, staff training, record keeping |
| Regulation (EC) 853/2004 | Animal products | Temperature limits, traceability, approval |
| Food Information Regulations 2014 | Allergen labelling | 14 major allergens declared, staff awareness |
| Food Safety Act 1990 | General food safety law | Due diligence defence requires documented procedures |

---

## 6. Allergen Register — 14 UK Major Allergens (FIR 2014)

Any new product line must be assessed against these. Allergen training must cover all 14.

1. Celery
2. Cereals containing gluten (wheat, rye, barley, oats)
3. Crustaceans
4. Eggs
5. Fish
6. Lupin
7. Milk
8. Molluscs
9. Mustard
10. Peanuts
11. Sesame
12. Soybeans
13. Sulphur dioxide / sulphites (>10mg/kg)
14. Tree nuts (almonds, hazelnuts, walnuts, cashews, pecans, Brazil nuts, pistachios, macadamia)

---

## 7. Change Log

| Date | Document | Change | Version | Updated by |
|---|---|---|---|---|
| Nov 2025 | Butchery & Process Room Training | Initial issue | V2.0 | Hakan Kilic |
| Nov 2025 | Warehouse Operative Training | Initial issue | V2.0 | Hakan Kilic |
| Nov 2025 | Health Monitoring Forms | Initial issue | V1.0 | Hakan Kilic |
| Nov 2025 | HACCP Policy Handbook | Initial issue | V2.0 | Hakan Kilic |
| Apr 2026 | MFS Operations App | All HACCP digital forms built and deployed | — | Hakan Kilic |
| Jul 2026 | Critical Temperature Limits (section 4) | CCP 3 Process Room moved to a three-band model (pass / amber / critical): Product core pass ≤4°C, amber 4–7°C, critical >7°C; Ambient room pass ≤12°C, amber 12–15°C, critical >15°C. Limits now admin-configurable in the app (audit-logged) — this register remains the approved source of truth. | — | Hakan Kilic |
| Jul 2026 | Critical Temperature Limits (section 4) | CCP 1 Goods In corrected and moved to per-category three-band model. KEY FIX: poultry pass ≤4°C / conditional 4–5°C / reject >5°C (previously the app passed poultry up to 8°C — illegal vs Reg 853/2004 Annex III Sec II). Old rows "fresh ≤4°C" and "frozen ≤-12°C" removed as wrong (4°C is poultry's limit; -12°C is the QFF retail-cabinet exception). Two written deviations recorded (red-meat >8°C reject line; poultry 1°C grace band). Limits now admin-configurable in the app (immutable audit log) — this register remains the approved source of truth. Staff to be retrained on the new poultry bands. | — | Hakan Kilic |

---

## 8. FSA Audit Readiness Checklist

Run through this before any EHO visit or annual review.

**Training:**
- [ ] All staff have signed current version of their role training document
- [ ] Training records are in the app (Training tile) and not expired
- [ ] Allergen awareness training completed and recorded for all food handlers
- [ ] New starters have completed health declaration before first shift

**HACCP Records:**
- [ ] Daily temperature logs complete (cold storage AM/PM, process room AM/PM)
- [ ] Opening, operational, and closing checks logged daily
- [ ] Calibration completed this month
- [ ] Weekly review completed this week
- [ ] Monthly review completed this month
- [ ] All corrective actions resolved (check admin queue)

**Documents:**
- [ ] All documents at current version (check section 1 and 2 above)
- [ ] Temperature limits in the app match this register (section 4)
- [ ] Visitor log entries present for any non-staff in food handling area

---

*This document is version controlled in Git. Changes should be committed with a meaningful message referencing which document or form changed.*
