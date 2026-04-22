# MFS Global — Document Control Register

**Maintained by:** Hakan Kilic (Managing Partner)  
**Last reviewed:** April 2026  
**Review frequency:** Annually, or whenever legislation, equipment, or procedures change  
**Location:** GitHub — `kilichakan2/MFS-Operations` `/docs/DOCUMENT_CONTROL.md`

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

These limits are hardcoded in the app. Any change requires a code update AND a training document update.

| CCP | Parameter | Limit | Source |
|---|---|---|---|
| CCP 1 — Goods In | Fresh meat receipt | ≤4°C | Reg 853/2004 |
| CCP 1 — Goods In | Frozen meat receipt | ≤-12°C | Reg 853/2004 |
| CCP 1 — Goods In | Offal receipt | ≤3°C | Reg 853/2004 |
| CCP 2 — Cold Storage | Fresh product storage | 0–4°C | Reg 853/2004 |
| CCP 2 — Cold Storage | Frozen product storage | ≤-18°C | Reg 853/2004 |
| CCP 3 — Process Room | Product during processing | ≤4°C | Reg 853/2004 |
| CCP 3 — Process Room | Ambient room temperature | ≤12°C | Reg 853/2004 |
| CCP 4 — Final Product | Packaged product pre-dispatch | ≤4°C | Reg 853/2004 |
| SOP 3 — Calibration | Steriliser (knife/tools) | ≥82°C | Industry standard |
| SOP 3 — Calibration | Ice water probe test | 0°C ±1°C | Industry standard |
| SOP 3 — Calibration | Boiling water probe test | 100°C ±1°C | Industry standard |

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
