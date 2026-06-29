# Per-Table Expand-Contract RLS Plan — 2026-06-12

**Unit:** F-RLS-02 (docs only). **Author:** sprint Day 1.
**Depends on:** F-RLS-01 audit (`docs/reference/security/rls-audit-2026-06-12.md`).
**Governing decision:** ADR-0004. **Migration tooling:** Supabase MCP
`apply_migration` only — never `supabase db push` (standing constraint).

This plan turns the audit's 42 RLS-off tables (plus the 13 already-enabled-but-
bypassed tables) into a per-table migration sequence. Each table moves through
the same six expand-contract steps with a defined rollback point at every step.
The work is sliced by bounded context and rides the matching Lego domain unit
(roadmap rule: "each domain's RLS migration rides in the same day as its domain
unit").

---

## 1. The six-step expand-contract sequence (per table)

ADR-0004 §Consequences fixes this at six steps. Expand-contract means each step
is independently deployable and reversible — production is never in a broken
state between steps.

| Step                                | Action                                                                               | Reversible by                  | Breaks prod if skipped-checked?                                                                                            |
| ----------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| **1. Enable RLS**                   | `ALTER TABLE … ENABLE ROW LEVEL SECURITY`                                            | `DISABLE ROW LEVEL SECURITY`   | No (service-role still bypasses; anon now denied — this is the security win and is safe because the app uses service-role) |
| **2. Add policy**                   | `CREATE POLICY` for each operation, keyed to the role model                          | `DROP POLICY`                  | No (policies inert while app is service-role)                                                                              |
| **3. Switch reads**                 | point the table's read path at the per-request authenticated client (F-RLS-03)       | revert the adapter wiring line | Yes if policy is wrong — **gate: round-trip read test must pass first**                                                    |
| **4. Switch writes**                | point insert/update/delete at the authenticated client                               | revert wiring line             | Yes if write policy is wrong — **gate: write-path integration test**                                                       |
| **5. Remove service-role fallback** | delete the service-role code path for this table                                     | git revert                     | No (reads/writes already on authenticated client)                                                                          |
| **6. Retire helper**                | drop any table-specific shim; confirm only `requireServiceRole()` admin paths remain | git revert                     | No                                                                                                                         |

**Critical ordering guarantee:** Step 1 (enable RLS) is safe to ship _ahead_ of
steps 3–6 because the app's service-role client bypasses RLS — so enabling RLS
immediately closes the anon/PostgREST exposure (audit Finding 2) **without
touching the app's behaviour**. This means the security win (T2) can land per
domain _before_ the authenticated-client cutover is fully done. Steps 3–4 are
where the app starts actually relying on the policy and where a wrong policy
breaks production; they are gated on tests.

**Per-step deploy discipline:** steps 1–2 in one migration (DB-only, no app
change); steps 3–4 in the matching app PR (one table or one tight group at a
time); steps 5–6 in a cleanup PR once the slice is proven. Every migration file
carries its own `-- ROLLBACK` block.

---

## 2. Policy templates by access pattern

The audit groups tables into four access patterns. Each gets a reusable policy
shape. `app.current_user_id` is the session GUC the authenticated client will
set per request (F-RLS-03); `is_admin()` already exists (switch it to a safe
definition — see §4).

**Pattern A — read-all-authenticated, write-admin** (reference/master data:
`customers`, `products`, `hub_sentinels`, `customer_road_times`,
`haccp_suppliers`, `haccp_sop_content`, `haccp_product_specs`):

```sql
CREATE POLICY <t>_select ON <t> FOR SELECT
  USING (current_setting('app.current_user_id', true) <> '');
CREATE POLICY <t>_write ON <t> FOR ALL
  USING (is_admin()) WITH CHECK (is_admin());
```

**Pattern B — role-gated** (operational data scoped to a role set:
`routes`, `route_stops`, `cash_*`, `cheque_records`, `price_agreement*`, most
`haccp_*`): policy `USING (current_user_role() = ANY(ARRAY['office','admin',…]))`
matching that table's `middleware.ts` allow-list. Add a `current_user_role()`
SQL helper (reads the GUC, looks up `users.role`).

**Pattern C — user-owned-or-admin** (`complaints`, `discrepancies`, `visits`,
`visit_notes`, `complaint_notes`, `compliments`): policy
`USING (user_id = current_setting('app.current_user_id',true)::uuid OR is_admin())`.
Mirrors the policies already on `complaints`/`visits`/`discrepancies`.

**Pattern D — special-category personal data** (`haccp_health_records`,
`haccp_staff_training`, `haccp_allergen_training`): tightest — admin + the
specific HACCP-manager roles only, never read-all. Treat as GDPR Art.9; document
the lawful basis alongside the policy.

---

## 3. Slice schedule (aligns to roadmap F-RLS-04a…i)

Each slice = steps 1–2 (DB migration) + steps 3–4 (app cutover in the domain PR)

- steps 5–6 (cleanup). Tables already RLS-enabled (§3a of the audit) skip steps
  1–2 and only need steps 3–4 (start using their existing policies via the
  authenticated client).

| Slice                                | Roadmap day | Tables                                                                                                                                                   | Pattern                  | Steps needed                                                                                        |
| ------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| **F-RLS-04a Orders**                 | Day 4       | orders, order_lines, order_audit_log, order_idempotency_keys                                                                                             | existing role-keyed      | 3–6 (RLS already on); also wire `SET app.current_user_id` to fix audit `user_id` NULL               |
| **F-RLS-04b Users**                  | Days 5–6    | users                                                                                                                                                    | self-or-admin (exists)   | 3–6; never expose `pin_hash`/`password_hash`                                                        |
| **F-RLS-04c Routes**                 | Day 8       | routes, route_stops, customer_road_times, hub_sentinels                                                                                                  | B / A                    | 1–6                                                                                                 |
| **F-RLS-04d Pricing**                | Day 9       | price_agreements, price_agreement_lines                                                                                                                  | B                        | 1–6; **also revoke anon EXECUTE on `replace_agreement_lines` + SECURITY INVOKER** (audit Finding 3) |
| **F-RLS-04e Cash**                   | Day 10      | cash_entries, cash_months, cheque_records                                                                                                                | B (office/admin)         | 1–6                                                                                                 |
| **F-RLS-04f Complaints/Compliments** | Day 11      | complaint_notes, compliments (+ existing complaints)                                                                                                     | C                        | 1–6 for notes/compliments; 3–6 for complaints                                                       |
| **F-RLS-04g Visits**                 | Day 12      | visit_notes (+ existing visits, discrepancies)                                                                                                           | C                        | 1–6 for visit_notes; 3–6 for the rest                                                               |
| **F-RLS-04h HACCP**                  | Days 13–14  | all 30 `haccp_*` RLS-off tables                                                                                                                          | B, D for health/training | 1–6; biggest slice, split by sub-domain                                                             |
| **F-RLS-04i Admin**                  | Day 15      | any remaining; `push_subscriptions` policy cleanup                                                                                                       | —                        | 3–6                                                                                                 |
| **F-RLS-final**                      | Day 16      | retire service-role from user-facing paths; `requireServiceRole()` for admin; tighten F-04/F-27 lint to forbid service-role imports outside `lib/admin/` | —                        | global step 5–6 sweep                                                                               |

**Independent of the slices (pull forward — audit recommendation):**

- **T1 unsigned cookie** — sign/encrypt `mfs_session`. Auth track, not an RLS
  migration. Highest severity; does not need the authenticated client.
- **T3 `replace_agreement_lines` RPC** — revoke `EXECUTE` from anon/authenticated
  now; can ship ahead of the Pricing slice.
- **Step-1-only fast pass (optional):** because enabling RLS is safe under
  service-role, a single migration could enable RLS on all 42 tables immediately
  to close T2 exposure, _then_ add policies per slice. Recommended — it shrinks
  the risk window from "until Day 16" to "Day 1–4". Gate it on a smoke that every
  domain still works through service-role (it will — service-role bypasses RLS).

---

## 4. Cross-cutting fixes folded into the track

- **`is_admin()` / audit triggers / `replace_agreement_lines` (SECURITY DEFINER):**
  revoke `EXECUTE` from `anon` and `authenticated`, or switch to `SECURITY
INVOKER`. Do this in the slice that owns each function (audit triggers → Orders
  slice; `replace_agreement_lines` → Pricing slice; `is_admin()` → first slice
  that introduces `current_user_role()`).
- **`function_search_path_mutable`:** add `SET search_path = public, pg_temp` to
  `set_updated_at`, `replace_agreement_lines`, `haccp_search`,
  `generate_order_reference` in their owning slices.
- **`app.current_user_id` plumbing:** F-RLS-03 introduces the authenticated
  client that issues `SET LOCAL app.current_user_id = <verified uuid>` per
  request. This is the prerequisite for steps 3–4 of every slice and also fixes
  the audit-attribution gap (T6).
- **`push_subscriptions` dormant `auth.uid()` policy:** the app doesn't use
  Supabase Auth, so `auth.uid()` is always null and the policy is a no-op.
  Replace with the `app.current_user_id` pattern in F-RLS-04i.
- **`extension_in_public` (`pg_net`):** move to a dedicated schema; low priority,
  schedule into F-RLS-final or defer to BACKLOG.

---

## 5. Rollback path (every slice)

Each `apply_migration` file ships with a paired rollback. Standard reversals:

- **Steps 1–2:** `DROP POLICY … ; ALTER TABLE … DISABLE ROW LEVEL SECURITY;` —
  instantly returns the table to the pre-slice state. Safe because the app was
  service-role and never depended on the policy yet.
- **Steps 3–4:** revert the single wiring line that points the table's read/write
  at the authenticated client back to the service-role client. App behaviour
  returns to baseline; RLS stays enabled (still safe — service-role bypasses).
- **Steps 5–6:** `git revert` of the cleanup PR restores the service-role
  fallback code.

**Halt rule (ADR-0004):** any RLS regression halts _that lane_, not the sprint.
A slice that fails its step-3/4 gate rolls back to step 2 (RLS on, policy
present, app still service-role) — a safe resting state that keeps the T2
security win while the policy is fixed.

---

## 6. Test gates per slice

- **Before step 3 (reads):** a round-trip read test (ARCH-FU-04 pattern) proving
  the authenticated client reads exactly the rows the policy intends — for an
  in-role user, an out-of-role user (denied), and admin.
- **Before step 4 (writes):** an integration test proving insert/update/delete
  succeed in-role and are denied out-of-role at the DB layer (not just the route).
- **After step 1 on each table:** a negative test that a raw anon PostgREST
  request to the table now returns 0 rows / permission denied (proves T2 closed).
- **Slice exit:** `get_advisors(security)` re-run shows the slice's tables off the
  `rls_disabled_in_public` list and no new ERROR lints introduced.
