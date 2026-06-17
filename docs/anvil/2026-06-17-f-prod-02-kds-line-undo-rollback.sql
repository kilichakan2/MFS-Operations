-- ============================================================
-- ROLLBACK — F-PROD-02 KDS line-done undo
-- ============================================================
-- Reverses the two F-PROD-02 migrations:
--   20260617130000_add_line_undone_enum_value.sql      (File A: enum)
--   20260617130001_kds_line_undo_trigger_and_rpc.sql   (File B: trigger + RPC)
--
-- Both migrations are ADDITIVE and backward-compatible. The safe,
-- normal rollback is to REVERT THE CODE (Vercel rollback): once the
-- undo route/UI are gone, nothing ever calls kds_undo_line or clears a
-- done_at, so the new enum value is simply never emitted and the trigger
-- branch is never reached. The DB changes are inert without the code.
--
-- This script removes the *behavioural* DB additions (the RPC and the
-- trigger's line_undone branch). It is for a "back out the DB too"
-- scenario, NOT for data recovery (no data was destroyed — undo only
-- clears timestamps on rows the operator chose to revert; that is not
-- recoverable by dropping the function and is out of scope here).
--
-- ⚠️ The enum value `line_undone` is NOT dropped. PostgreSQL cannot
--    DROP a value from an enum type without recreating the type and
--    rewriting every dependent column — a heavy, risky operation. An
--    unused extra enum label is harmless (no row references it once the
--    code is reverted). LEAVE IT. If it MUST be removed, that is a
--    separate, planned, PITR-guarded migration — not this rollback.
-- ============================================================

BEGIN;

-- 1. Drop the atomic line-undo RPC (File B).
DROP FUNCTION IF EXISTS public.kds_undo_line(uuid, timestamptz);

-- 2. Restore order_lines_audit_trigger() WITHOUT the line_undone branch,
--    i.e. back to the canonical post-hardening body (20260601000000 /
--    20260613020000 posture: SECURITY DEFINER + search_path=public +
--    NULL-safe app.current_user_id read). The reverse done_at transition
--    falls back to the ELSE branch (line_edited) as it did before F-PROD-02.
CREATE OR REPLACE FUNCTION order_lines_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_action  order_audit_action;
BEGIN
  BEGIN
    v_user_id := nullif(current_setting('app.current_user_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_id := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    v_action := 'line_added';
    INSERT INTO order_audit_log (order_id, user_id, action, payload)
    VALUES (NEW.order_id, v_user_id, v_action, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.done_at IS NULL AND NEW.done_at IS NOT NULL THEN
      v_action := 'line_done';
    ELSE
      v_action := 'line_edited';
    END IF;

    INSERT INTO order_audit_log (order_id, user_id, action, payload)
    VALUES (NEW.order_id, v_user_id, v_action, jsonb_build_object(
      'before', to_jsonb(OLD),
      'after',  to_jsonb(NEW)
    ));
    RETURN NEW;
  END IF;

  RETURN NEW;
END $$;

COMMIT;
