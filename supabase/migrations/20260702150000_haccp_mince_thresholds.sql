-- 20260702150000_haccp_mince_thresholds.sql
--
-- /haccp/mince ("Mince & Meat Prep") UI Phase 1 — DB-driven CCP-M thresholds
-- (the goods-in CCP-1 / process-room CCP-3 pattern, verified bands).
--
-- Moves the CCP-M1/MP1 temperature limits (6 channels) AND the CCP-M2
-- per-species kill-day limits OUT of the duplicated hardcoded page + service
-- band tables and INTO a table an admin can edit (audit-logged). Seeds the
-- table to the Gate-1-approved LOCKED values (Reg 853/2004 Annex III Sec V
-- Ch III, verified 2026-07-02). DOCUMENT_CONTROL.md §4 gains the CCP-M rows,
-- the four amber-band justifications and the vac-pack deviation in the same PR.
--
-- ⚠️ AMBER IS DISPLAY-ONLY (deliberate divergence from goods-in's
--   conditional-accept amber): a reading between pass_max and amber_max shows
--   a WARNING colour but corrective action still fires on ANYTHING above
--   pass_max — the persisted pass booleans, the 400-requires-CA validation and
--   the CA-register writes are all blind to the amber band
--   (lib/domain/mincePrep.ts `minceTempPass`).
--
-- ADDITIVE migration: CREATE TABLE + seed + CREATE POLICY + GRANT only — no DROP
--   TABLE / TRUNCATE / ALTER TYPE / DROP COLUMN / DROP NOT NULL → NO PITR gate.
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS, seed guarded by NOT EXISTS on key,
--   every policy preceded by DROP POLICY IF EXISTS → `npm run db:reset` and
--   preview-branch re-syncs are re-runnable.
--
-- DELIBERATE DIVERGENCES from haccp_goods_in_thresholds (both spec-locked):
--   (a) columns are pass_max / amber_max (no `_c` suffix) — kill-day rows are
--       in DAYS, not °C; the `kind` column carries the unit.
--   (b) `kind` CHECK ('temp' | 'kill_days') + the kill-binary CHECK: kill-day
--       rows structurally CANNOT grow an amber band (grading is binary).
-- Shared with goods-in: NO `active` column — the process-room Guard lesson:
--   fixed regulatory rows must never be toggle-off-able, so the toggle does
--   not exist at all.
--
-- RLS DIVERGENCE (deliberate): the 30-table HACCP pattern
--   (20260625120000_haccp_authenticated_rls_policies.sql) gates every command on
--   current_user_is_active() and leaves fine-grained admin-only at the route
--   edge. Here the WRITES are tightened to is_admin() AT THE DATABASE because
--   the thresholds are a regulatory (food-safety) control — defense-in-depth
--   beyond the route's isAdmin gate. Reads stay open to any active staff member
--   (the mince-prep GET + server band derivation run as the staff caller).
--
-- 14-digit timestamp filename — mandatory (the YYYYMMDD_NNN short form is
--   banned: it collides on same-day migrations and breaks preview-branch
--   resync).

-- ── 1) The thresholds table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.haccp_mince_thresholds (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    key text NOT NULL,
    label text NOT NULL,
    kind text NOT NULL,
    pass_max numeric(4,1),
    amber_max numeric(4,1),
    position integer DEFAULT 0 NOT NULL,
    CONSTRAINT haccp_mince_thresholds_key_key UNIQUE (key),
    CONSTRAINT haccp_mince_thresholds_kind_check
      CHECK (kind IN ('temp','kill_days')),
    -- An amber band requires a pass line beneath it and must sit at or above it
    -- (amber == pass is allowed and means "amber band empty").
    CONSTRAINT haccp_mince_thresholds_band_check
      CHECK (amber_max IS NULL OR (pass_max IS NOT NULL AND amber_max >= pass_max)),
    -- Kill-day grading is BINARY — a kill_days row structurally cannot carry an
    -- amber band.
    CONSTRAINT haccp_mince_thresholds_kill_binary_check
      CHECK (kind = 'temp' OR amber_max IS NULL)
);

ALTER TABLE public.haccp_mince_thresholds OWNER TO postgres;

-- ── 2) Seed the 9 rows (Gate-1-approved LOCKED values) ───────────────────────
-- Temp channels: amber is a 1°C DISPLAY-ONLY grace band for probe/handling
-- fluctuation during active production — CA still fires above pass_max
-- (divergence from goods-in's conditional-accept amber; register §4
-- justifications (4)–(7)).
INSERT INTO public.haccp_mince_thresholds (key, label, kind, pass_max, amber_max, position)
SELECT 'mince_input', 'Mince input (CCP-M1)', 'temp', 7.0, 8.0, 1
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_mince_thresholds WHERE key = 'mince_input');

INSERT INTO public.haccp_mince_thresholds (key, label, kind, pass_max, amber_max, position)
SELECT 'mince_output_chilled', 'Mince output — chilled (CCP-M1)', 'temp', 2.0, 3.0, 2
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_mince_thresholds WHERE key = 'mince_output_chilled');

INSERT INTO public.haccp_mince_thresholds (key, label, kind, pass_max, amber_max, position)
SELECT 'mince_output_frozen', 'Mince output — frozen (CCP-M1)', 'temp', -18.0, -17.0, 3
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_mince_thresholds WHERE key = 'mince_output_frozen');

INSERT INTO public.haccp_mince_thresholds (key, label, kind, pass_max, amber_max, position)
SELECT 'prep_input', 'Prep input (CCP-MP1)', 'temp', 7.0, 8.0, 4
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_mince_thresholds WHERE key = 'prep_input');

INSERT INTO public.haccp_mince_thresholds (key, label, kind, pass_max, amber_max, position)
SELECT 'prep_output_chilled', 'Prep output — chilled (CCP-MP1)', 'temp', 4.0, 5.0, 5
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_mince_thresholds WHERE key = 'prep_output_chilled');

INSERT INTO public.haccp_mince_thresholds (key, label, kind, pass_max, amber_max, position)
SELECT 'prep_output_frozen', 'Prep output — frozen (CCP-MP1)', 'temp', -18.0, -17.0, 6
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_mince_thresholds WHERE key = 'prep_output_frozen');

-- Kill-day rows (CCP-M2): BINARY pass / hard block, no amber (CHECK-enforced).
INSERT INTO public.haccp_mince_thresholds (key, label, kind, pass_max, amber_max, position)
SELECT 'kill_days_lamb', 'Lamb — max days from kill (CCP-M2)', 'kill_days', 6, NULL, 7
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_mince_thresholds WHERE key = 'kill_days_lamb');

INSERT INTO public.haccp_mince_thresholds (key, label, kind, pass_max, amber_max, position)
SELECT 'kill_days_beef', 'Beef (fresh) — max days from kill (CCP-M2)', 'kill_days', 6, NULL, 8
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_mince_thresholds WHERE key = 'kill_days_beef');

-- kill_days_imported_vac pass_max NULL = NO app-enforced kill-day limit —
-- Hakan's explicit documented deviation (register §4 justification (3)): Reg
-- 853/2004 Annex III Sec V Ch III pt 2(b)(iii) permits mince from vac-packed
-- beef/veal up to 15 days after slaughter; the kill-date control stays
-- manual/operator. Recorded for traceability only.
INSERT INTO public.haccp_mince_thresholds (key, label, kind, pass_max, amber_max, position)
SELECT 'kill_days_imported_vac', 'Imported / vac-packed — no kill-day limit (CCP-M2)', 'kill_days', NULL, NULL, 9
WHERE NOT EXISTS (SELECT 1 FROM public.haccp_mince_thresholds WHERE key = 'kill_days_imported_vac');

-- ── 3) Immutable audit table (who / when / old→new) ─────────────────────────
-- A dedicated, purpose-built log (NOT the generic audit_log): it carries
-- old→new pass/amber cleanly and makes the FSA-facing "who changed a CCP limit,
-- when, from what to what" query trivial. Immutable — no UPDATE/DELETE policy.
CREATE TABLE IF NOT EXISTS public.haccp_mince_threshold_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    threshold_id uuid NOT NULL,
    changed_by uuid NOT NULL,
    changed_at timestamptz DEFAULT now() NOT NULL,
    old_pass_max numeric(4,1),
    new_pass_max numeric(4,1),
    old_amber_max numeric(4,1),
    new_amber_max numeric(4,1),
    summary text
);

ALTER TABLE public.haccp_mince_threshold_audit OWNER TO postgres;

-- ── 4) Grants (new tables — baseline's blanket grant does NOT cover them) ────
-- RLS still constrains what each role can actually do.
GRANT ALL ON TABLE public.haccp_mince_thresholds TO authenticated;
GRANT ALL ON TABLE public.haccp_mince_thresholds TO service_role;
GRANT ALL ON TABLE public.haccp_mince_threshold_audit TO authenticated;
GRANT ALL ON TABLE public.haccp_mince_threshold_audit TO service_role;

-- ── 5) RLS: read = active staff; write = admin only (defense-in-depth) ───────
ALTER TABLE public.haccp_mince_thresholds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS haccp_mince_thresholds_select ON public.haccp_mince_thresholds;
DROP POLICY IF EXISTS haccp_mince_thresholds_insert ON public.haccp_mince_thresholds;
DROP POLICY IF EXISTS haccp_mince_thresholds_update ON public.haccp_mince_thresholds;
DROP POLICY IF EXISTS haccp_mince_thresholds_delete ON public.haccp_mince_thresholds;

CREATE POLICY haccp_mince_thresholds_select ON public.haccp_mince_thresholds
  FOR SELECT USING ( public.current_user_is_active() );
CREATE POLICY haccp_mince_thresholds_insert ON public.haccp_mince_thresholds
  FOR INSERT WITH CHECK ( public.is_admin() );
CREATE POLICY haccp_mince_thresholds_update ON public.haccp_mince_thresholds
  FOR UPDATE USING ( public.is_admin() )
             WITH CHECK ( public.is_admin() );
CREATE POLICY haccp_mince_thresholds_delete ON public.haccp_mince_thresholds
  FOR DELETE USING ( public.is_admin() );

-- ── 6) RLS: audit table — admin read + admin insert; immutable (no upd/del) ──
ALTER TABLE public.haccp_mince_threshold_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS haccp_mince_threshold_audit_select ON public.haccp_mince_threshold_audit;
DROP POLICY IF EXISTS haccp_mince_threshold_audit_insert ON public.haccp_mince_threshold_audit;

CREATE POLICY haccp_mince_threshold_audit_select ON public.haccp_mince_threshold_audit
  FOR SELECT USING ( public.is_admin() );
CREATE POLICY haccp_mince_threshold_audit_insert ON public.haccp_mince_threshold_audit
  FOR INSERT WITH CHECK ( public.is_admin() );
-- NO UPDATE / DELETE policy → RLS-enabled + no policy = deny for authenticated →
-- the audit trail is immutable.
