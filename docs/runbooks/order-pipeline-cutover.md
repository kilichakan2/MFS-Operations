# Order pipeline cutover — runbook

**Purpose:** Replace the WhatsApp meat-orders group with the mfsops.com order pipeline, without disrupting deliveries to 100+ customers.

**Strategy:** 4-week phased rollout with parallel running. Sales reps double-enter for 2 weeks while the team builds muscle memory; then mfsops becomes primary with WhatsApp as fallback for 2 weeks; then WhatsApp is retired.

**Owner:** Hakan (final say on cutover decisions).
**Operator:** Office team (Yusuf primary, Emre backup).

---

## Pre-cutover checklist

Tick everything off before Week 1 begins.

- [ ] All 6 sub-branches of `feat/order-pipeline` merged into the integration branch
- [ ] ANVIL run on the integration branch — green
- [ ] PR `feat/order-pipeline` → `main` opened
- [ ] Smoke-tested by Hakan on Vercel preview for ≥24 hours
- [ ] Sales reps (Mehmet, Omer, Abdel) each placed at least one test order in preview
- [ ] Office team (Yusuf, Emre) each printed at least one picking list in preview
- [ ] Adeel (butcher) has tapped Done on at least one line in preview
- [ ] Production-room hardware (24" touchscreen + mini-PC) installed and powered, pointing at `https://mfsops.com/kds`
- [ ] All butcher PINs verified working (check `users.pin_hash IS NOT NULL` for each)
- [ ] If using `warehouse` role for KDS: Daz has been told he can sign in
- [ ] Vercel env vars set:
  - `NEXT_PUBLIC_ORDER_PIPELINE_ENABLED=true`
  - `NEXT_PUBLIC_ORDER_CUTOVER_START=<Monday of Week 1>`
  - `NEXT_PUBLIC_ORDER_CUTOVER_END=<Sunday of Week 4>`
- [ ] PR merged to main, Vercel production deploy successful
- [ ] Production smoke test by Hakan (place a real order, print, mark done, all from production URL)

---

## Week 1-2 — Parallel running

**Goal:** Sales reps learn the system. Butchers continue working off WhatsApp printouts. Office watches for any data discrepancies between WhatsApp and mfsops.

**Sales rep behaviour:**
- Place every order in **both** WhatsApp **and** mfsops
- The order in WhatsApp is the source of truth for cutting — butchers work off the WhatsApp screenshot as today
- The mfsops entry is "shadow"; office reviews it but doesn't print it

**Office behaviour:**
- At end of each day: spot-check 5 random orders by opening mfsops `/orders` and comparing against the WhatsApp thread
- Note any discrepancies in a daily log (a shared Notion page or Slack channel works)
- Print picking lists from mfsops for **2-3 orders per day only** — confirm the printed sheet matches the BarcodeX-generated one. Don't use the mfsops sheet for actual cutting yet.

**Butcher behaviour:**
- Work off WhatsApp printouts from office as today
- KDS screen on the wall will start populating — they can watch, but no need to tap anything yet
- Adeel signs in to KDS each morning with his PIN to get used to it

**Monitoring (daily, Hakan or office):**
- Count of orders entered in WhatsApp (manual count from thread)
- Count of orders in mfsops: `select count(*) from orders where created_at::date = current_date`
- Target: parity by end of Week 2 (90%+ of WhatsApp orders also in mfsops)

**Decision gate — end of Week 2:**
- If <80% parity: extend Week 1-2 by another week before progressing
- If 80%+ parity AND no major discrepancies: proceed to Week 3-4
- If any safety/data issues: pause, set `NEXT_PUBLIC_ORDER_PIPELINE_ENABLED=false`, regroup

---

## Week 3-4 — mfsops is primary, WhatsApp is fallback

**Goal:** mfsops is now the system of record. WhatsApp is for emergencies only.

**Sales rep behaviour:**
- Place every order in **mfsops first**
- If mfsops is down/slow: post to WhatsApp as fallback, then enter into mfsops when it's back. Note "fallback" in the order's notes field.
- WhatsApp meat-orders group is read-only for normal operations; sales reps only post if they need to flag a system problem

**Office behaviour:**
- Print picking lists from **mfsops only**
- BarcodeX is still used for the invoice (data entry from scale tickets, as today)
- If you spot an order in WhatsApp that didn't get into mfsops: copy it into mfsops yourself and tell the sales rep

**Butcher behaviour:**
- Work off mfsops-printed picking lists (paper) and the KDS screen
- Tap Done per line on KDS as you weigh and label each item
- If KDS is down: keep working off the paper sheet, office will reconcile at end of day

**Monitoring:**
- Every order should be in mfsops within 2 hours of being taken
- Office reviews `/orders` first thing each morning to make sure overnight orders are in
- Spot-check 2-3 picking lists per day against actual deliveries — any weight discrepancies get flagged

**Decision gate — end of Week 4:**
- All orders flowing through mfsops cleanly for ≥7 days running
- No "missed orders" incidents
- Office, sales, and butchers all comfortable with the new flow

→ **Proceed to retirement** (Week 5)

---

## Week 5+ — WhatsApp retired

**Operational changes:**
- WhatsApp meat-orders group is muted and labelled "retired — use mfsops"
- After 2 more weeks (Week 7), the group is archived
- Old WhatsApp messages remain searchable in case of historical disputes

**Ongoing monitoring (first 3 months):**
- Weekly review at the team meeting: any near-misses or workarounds?
- Quarterly review by Hakan: are the printed picking sheets matching the digital orders 99%+?

---

## Emergency rollback

If something goes badly wrong at any point during weeks 1-4:

**Soft pause** (preserves data, hides UI):
1. In Vercel dashboard, set `NEXT_PUBLIC_ORDER_PIPELINE_ENABLED=false`
2. Redeploy (Vercel does this automatically on env-var change)
3. Within ~1 minute: `/orders` and `/kds` pages show "paused" notices
4. Sales reps revert to WhatsApp-only
5. Office reverts to BarcodeX-only for picking lists
6. Data already in mfsops is preserved — orders aren't deleted, just hidden

**Hard rollback** (revert the feature):
1. In Vercel dashboard, redeploy a commit from before `feat/order-pipeline` was merged
2. mfsops `/orders` and `/kds` routes return 404
3. Same revert procedure as soft pause for the team

**Data preservation:**
- The `orders`, `order_lines`, `order_audit_log` tables in Supabase remain even if the UI is disabled. No data loss from a rollback.
- If you need to fully unwind: keep the tables but stop writing to them. Schema can stay; it's a few KB and harmless.

---

## Known-limits / followups (not for v1)

These are deferred to follow-on work after the cutover is stable. None block Week 1.

1. **Customer notifications** — WhatsApp pings to customers when their order is confirmed/ready. The credit-control app already has the WhatsApp Business plumbing — can be wired to fire on order state changes in a future sprint.
2. **Realtime updates** — the dashboard and KDS currently poll. If polling load becomes an issue (>50 active orders), switch to Supabase realtime channels (needs an RLS rework to accommodate anon-key reads).
3. **Driver visibility** — drivers don't currently see orders in mfsops. If/when delivery routing moves into mfsops, drivers should get a read-only "today's deliveries" view.
4. **Customer-facing portal** — customers self-serving orders is a much larger feature, not contemplated here.
5. **BarcodeX retirement** — the long-term destination is mfsops + Xero direct invoice generation, with BarcodeX retired entirely. The Fresho transition is the planned path. Out of scope for this cutover.

---

## Reference

- **Frame spec:** [`docs/plans/2026-05-30-order-pipeline-kds-frame.md`](../plans/2026-05-30-order-pipeline-kds-frame.md)
- **Implementation plan:** [`docs/plans/2026-05-30-order-pipeline-kds-implementation.md`](../plans/2026-05-30-order-pipeline-kds-implementation.md)
- **Sub-branches:** SB1 schema, SB2 capture, SB3 dashboard, SB4 picking-print, SB5 KDS, SB6 cutover (this one)
- **Live URLs:** `/orders` (office dashboard) · `/orders/new` (sales) · `/orders/[id]` (read-only) · `/kds` (production room)
