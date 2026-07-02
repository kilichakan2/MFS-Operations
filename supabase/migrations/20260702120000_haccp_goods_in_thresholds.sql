-- 20260702120000_haccp_goods_in_thresholds.sql
--
-- /haccp/delivery ("Goods In") UI Phase 1 — DB-driven CCP-1 temperature
-- thresholds (the process-room CCP-3 pattern, verified bands).
--
-- Moves the CCP-1 delivery-intake pass/amber/reject limits OUT of the duplicated
-- hardcoded page + service band tables and INTO a table an admin can edit
-- (audit-logged). Seeds the table to the Gate-1-approved LOCKED values —
-- including THE FIX: poultry pass ≤4°C / amber ≤5°C / reject >5°C (previously a
-- hardcoded, illegal ≤8°C pass). DOCUMENT_CONTROL.md §4 is corrected in the
-- same PR, carrying the two written justifications (red meat >8°C vs Reg
-- 853/2004's 7°C transport limit; poultry's documented 1°C grace band).
--
-- ADDITIVE migration: CREATE TABLE + seed + CREATE POLICY + GRANT only — no DROP
--   TABLE / TRUNCATE / ALTER TYPE / DROP COLUMN / DROP NOT NULL → NO PITR gate.
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS, seed guarded by NOT EXISTS on
--   category, every policy preceded by DROP POLICY IF EXISTS → `npm run
--   db:reset` and preview-branch re-syncs are re-runnable.
--
-- DELIBERATE DIVERGENCES from haccp_process_room_thresholds (both spec-locked):
--   (a) pass_max_c / amber_max_c are NULLABLE — NULL pass_max = no temperature
--       CCP (dry goods); NULL amber_max = no amber band (pass_max is the hard
--       reject line).
--   (b) NO `active` column — the process-room Guard lesson: fixed regulatory
--       rows must never be toggle-off-able, so the toggle does not exist at all.
--
-- RLS DIVERGENCE (deliberate): the 30-table HACCP pattern
--   (20260625120000_haccp_authenticated_rls_policies.sql) gates every command on
--   current_user_is_active() and leaves fine-grained admin-only at the route
--   edge. Here the WRITES are tightened to is_admin() AT THE DATABASE because
--   the thresholds are a regulatory (food-safety) control — defense-in-depth
--   beyond the route's isAdmin gate. Reads stay open to any active staff member
--   (the delivery GET + server band derivation run as the staff caller).
--
-- 14-digit timestamp filename — mandatory (the YYYYMMDD_NNN short form is
--   banned: it collides on same-day migrations and breaks preview-branch
--   resync).

-- ── 1) The thresholds table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.haccp_goods_in_thresholds (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    category text NOT NULL,
    label text NOT NULL,
    pass_max_c numeric(4,1),
    amber_max_c numeric(4,1),
    position integer DEFAULT 0 NOT NULL,
    -- An amber band requires a pass line beneath it and must sit at or above it
    -- (amber == pass is allowed and means "amber band empty").
    CONSTRAINT haccp_goods_in_thresholds_band_check
      CHECK (amber_max_c IS NULL OR (pass_max_c IS NOT NULL AND amber_max_c >= pass_max_c)),
    CONSTRAINT haccp_goods_in_thresholds_category_key UNIQUE (category)
);

ALTER TABLE public.haccp_goods_in_thresholds OWNER TO postgres;

-- ── 2) Seed the 11 category rows (Gate-1-approved LOCKED bands) ──────────────
-- Legacy keys (red_meat, mince_prep) are not selectable on the screen but are
-- still gradeable by the service — they get rows so fail-closed resolution
-- never finds a hole (risk R1).
INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'lamb', 'Lamb', 5.0, 8.0, 1
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'lamb');

INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'beef', 'Beef', 5.0, 8.0, 2
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'beef');

INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'offal', 'Offal', 3.0, NULL, 3
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'offal');

INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'frozen', 'Frozen', -18.0, -15.0, 4
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'frozen');

INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'frozen_beef_lamb', 'Frozen Beef/Lamb', -18.0, -15.0, 5
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'frozen_beef_lamb');

-- THE FIX: poultry law = ≤4°C (Reg 853/2004 Annex III Sec II); 4–5°C is the
-- documented 1°C grace band (amber, CA logged); >5°C rejects. WAS ≤8°C pass.
INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'poultry', 'Poultry', 4.0, 5.0, 6
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'poultry');

INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'dairy', 'Dairy / Chilled', 8.0, NULL, 7
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'dairy');

INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'chilled_other', 'Chilled Other', 8.0, NULL, 8
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'chilled_other');

INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'dry_goods', 'Dry Goods', NULL, NULL, 9
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'dry_goods');

INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'red_meat', 'Red meat (legacy)', 5.0, 8.0, 10
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'red_meat');

INSERT INTO public.haccp_goods_in_thresholds (category, label, pass_max_c, amber_max_c, position)
SELECT 'mince_prep', 'Mince / prep (legacy)', 4.0, NULL, 11
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_goods_in_thresholds WHERE category = 'mince_prep');

-- ── 3) Immutable audit table (who / when / old→new) ─────────────────────────
-- A dedicated, purpose-built log (NOT the generic audit_log): it carries
-- old→new pass/amber cleanly and makes the FSA-facing "who changed a CCP limit,
-- when, from what to what" query trivial. Immutable — no UPDATE/DELETE policy.
CREATE TABLE IF NOT EXISTS public.haccp_goods_in_threshold_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    threshold_id uuid NOT NULL,
    changed_by uuid NOT NULL,
    changed_at timestamptz DEFAULT now() NOT NULL,
    old_pass_max_c numeric(4,1),
    new_pass_max_c numeric(4,1),
    old_amber_max_c numeric(4,1),
    new_amber_max_c numeric(4,1),
    summary text
);

ALTER TABLE public.haccp_goods_in_threshold_audit OWNER TO postgres;

-- ── 4) Grants (new tables — baseline's blanket grant does NOT cover them) ────
-- RLS still constrains what each role can actually do.
GRANT ALL ON TABLE public.haccp_goods_in_thresholds TO authenticated;
GRANT ALL ON TABLE public.haccp_goods_in_thresholds TO service_role;
GRANT ALL ON TABLE public.haccp_goods_in_threshold_audit TO authenticated;
GRANT ALL ON TABLE public.haccp_goods_in_threshold_audit TO service_role;

-- ── 5) RLS: read = active staff; write = admin only (defense-in-depth) ───────
ALTER TABLE public.haccp_goods_in_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS haccp_goods_in_thresholds_select ON public.haccp_goods_in_thresholds;
DROP POLICY IF EXISTS haccp_goods_in_thresholds_insert ON public.haccp_goods_in_thresholds;
DROP POLICY IF EXISTS haccp_goods_in_thresholds_update ON public.haccp_goods_in_thresholds;
DROP POLICY IF EXISTS haccp_goods_in_thresholds_delete ON public.haccp_goods_in_thresholds;

CREATE POLICY haccp_goods_in_thresholds_select ON public.haccp_goods_in_thresholds
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_goods_in_thresholds_insert ON public.haccp_goods_in_thresholds
  FOR INSERT WITH CHECK ( public.is_admin() );
CREATE POLICY haccp_goods_in_thresholds_update ON public.haccp_goods_in_thresholds
  FOR UPDATE USING ( public.is_admin() )
             WITH CHECK ( public.is_admin() );
CREATE POLICY haccp_goods_in_thresholds_delete ON public.haccp_goods_in_thresholds
  FOR DELETE USING ( public.is_admin() );

-- ── 6) RLS: audit table — admin read + admin insert; immutable (no upd/del) ──
ALTER TABLE public.haccp_goods_in_threshold_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS haccp_goods_in_threshold_audit_select ON public.haccp_goods_in_threshold_audit;
DROP POLICY IF EXISTS haccp_goods_in_threshold_audit_insert ON public.haccp_goods_in_threshold_audit;

CREATE POLICY haccp_goods_in_threshold_audit_select ON public.haccp_goods_in_threshold_audit
  FOR SELECT USING ( public.is_admin() );
CREATE POLICY haccp_goods_in_threshold_audit_insert ON public.haccp_goods_in_threshold_audit
  FOR INSERT WITH CHECK ( public.is_admin() );
-- NO UPDATE / DELETE policy → RLS-enabled + no policy = deny for authenticated →
-- the audit trail is immutable.
