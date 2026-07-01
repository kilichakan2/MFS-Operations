-- 20260701120000_haccp_process_room_thresholds.sql
--
-- /haccp/process-room UI Phase 1 — DB-driven CCP-3 temperature thresholds.
--
-- Moves the CCP-3 process-room pass/amber/critical limits OUT of hardcoded page +
-- service logic and INTO a table an admin can edit (audit-logged). Seeds the table
-- to the Gate-1-approved values (Product core 4/7, Room ambient 12/15) so nothing
-- changes on day one; DOCUMENT_CONTROL.md §4/§7 is updated in the same PR to match.
--
-- ADDITIVE migration: CREATE TABLE + seed + CREATE POLICY + GRANT only — no DROP
--   TABLE / TRUNCATE / ALTER TYPE / DROP COLUMN / DROP NOT NULL → NO PITR gate.
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS, seed guarded by NOT EXISTS on name,
--   every policy preceded by DROP POLICY IF EXISTS → `npm run db:reset` and
--   preview-branch re-syncs are re-runnable.
--
-- RLS DIVERGENCE (deliberate): the 30-table HACCP pattern
--   (20260625120000_haccp_authenticated_rls_policies.sql) gates every command on
--   current_user_is_active() and leaves fine-grained admin-only at the route edge.
--   Here the WRITES are tightened to is_admin() AT THE DATABASE because the
--   thresholds are a regulatory (food-safety) control — defense-in-depth beyond
--   the route's isAdmin gate. Reads stay open to any active staff member (the
--   process-room GET + server band derivation run as the staff caller).
--
-- 14-digit timestamp filename — mandatory (the YYYYMMDD_NNN short form is banned:
--   it collides on same-day migrations and breaks preview-branch resync).

-- ── 1) The thresholds table (mirrors haccp_cold_storage_units shape) ─────────
CREATE TABLE IF NOT EXISTS public.haccp_process_room_thresholds (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    name text NOT NULL,
    target_temp_c numeric(4,1) NOT NULL,
    max_temp_c numeric(4,1) NOT NULL,
    active boolean DEFAULT true NOT NULL,
    position integer DEFAULT 0 NOT NULL,
    CONSTRAINT haccp_process_room_thresholds_band_check CHECK (target_temp_c <= max_temp_c),
    CONSTRAINT haccp_process_room_thresholds_name_key UNIQUE (name)
);

ALTER TABLE public.haccp_process_room_thresholds OWNER TO postgres;

-- ── 2) Seed the two measurement points (Gate-1-approved bands) ───────────────
INSERT INTO public.haccp_process_room_thresholds (name, target_temp_c, max_temp_c, position)
SELECT 'Product core', 4.0, 7.0, 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.haccp_process_room_thresholds WHERE name = 'Product core'
);

INSERT INTO public.haccp_process_room_thresholds (name, target_temp_c, max_temp_c, position)
SELECT 'Room ambient', 12.0, 15.0, 2
WHERE NOT EXISTS (
  SELECT 1 FROM public.haccp_process_room_thresholds WHERE name = 'Room ambient'
);

-- ── 3) Immutable audit table (who / when / old→new) ─────────────────────────
-- A dedicated, purpose-built log (NOT the generic audit_log): it carries old→new
-- target/max cleanly and makes the FSA-facing "who changed a CCP limit, when,
-- from what to what" query trivial. Immutable — no UPDATE/DELETE policy.
CREATE TABLE IF NOT EXISTS public.haccp_threshold_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    threshold_id uuid NOT NULL,
    changed_by uuid NOT NULL,
    changed_at timestamptz DEFAULT now() NOT NULL,
    old_target_temp_c numeric(4,1),
    new_target_temp_c numeric(4,1),
    old_max_temp_c numeric(4,1),
    new_max_temp_c numeric(4,1),
    summary text
);

ALTER TABLE public.haccp_threshold_audit OWNER TO postgres;

-- ── 4) Grants (new tables — baseline's blanket grant does NOT cover them) ────
-- RLS still constrains what each role can actually do.
GRANT ALL ON TABLE public.haccp_process_room_thresholds TO authenticated;
GRANT ALL ON TABLE public.haccp_process_room_thresholds TO service_role;
GRANT ALL ON TABLE public.haccp_threshold_audit TO authenticated;
GRANT ALL ON TABLE public.haccp_threshold_audit TO service_role;

-- ── 5) RLS: read = active staff; write = admin only (defense-in-depth) ───────
ALTER TABLE public.haccp_process_room_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS haccp_process_room_thresholds_select ON public.haccp_process_room_thresholds;
DROP POLICY IF EXISTS haccp_process_room_thresholds_insert ON public.haccp_process_room_thresholds;
DROP POLICY IF EXISTS haccp_process_room_thresholds_update ON public.haccp_process_room_thresholds;
DROP POLICY IF EXISTS haccp_process_room_thresholds_delete ON public.haccp_process_room_thresholds;

CREATE POLICY haccp_process_room_thresholds_select ON public.haccp_process_room_thresholds
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_process_room_thresholds_insert ON public.haccp_process_room_thresholds
  FOR INSERT WITH CHECK ( public.is_admin() );
CREATE POLICY haccp_process_room_thresholds_update ON public.haccp_process_room_thresholds
  FOR UPDATE USING ( public.is_admin() )
             WITH CHECK ( public.is_admin() );
CREATE POLICY haccp_process_room_thresholds_delete ON public.haccp_process_room_thresholds
  FOR DELETE USING ( public.is_admin() );

-- ── 6) RLS: audit table — admin read + admin insert; immutable (no upd/del) ──
ALTER TABLE public.haccp_threshold_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS haccp_threshold_audit_select ON public.haccp_threshold_audit;
DROP POLICY IF EXISTS haccp_threshold_audit_insert ON public.haccp_threshold_audit;

CREATE POLICY haccp_threshold_audit_select ON public.haccp_threshold_audit
  FOR SELECT USING ( public.is_admin() );
CREATE POLICY haccp_threshold_audit_insert ON public.haccp_threshold_audit
  FOR INSERT WITH CHECK ( public.is_admin() );
-- NO UPDATE / DELETE policy → RLS-enabled + no policy = deny for authenticated →
-- the audit trail is immutable.
