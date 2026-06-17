-- F-PROD-02 — KDS line-done undo: trigger fix + atomic cascade RPC.
--
-- File B of two. File A (20260617130000) added the `line_undone` enum
-- value in its own transaction; this file is the first that may USE it
-- (PG12+ forbids using a freshly-added enum value in the same
-- transaction that added it — hence the split).
--
-- Two changes, both additive / backward-compatible:
--
--   1. Teach `order_lines_audit_trigger()` to emit `line_undone` on the
--      REVERSE done_at transition (done_at NOT NULL -> NULL). Today that
--      transition falls into the ELSE branch and mislabels an undo as
--      `line_edited`, which would ALSO wrongly flash the KDS card orange
--      (line_edited is a flash action; line_undone is not). The forward
--      transition still logs `line_done`; an unrelated line edit still
--      logs `line_edited`.
--
--   2. Add `kds_undo_line(p_line_id uuid, p_when timestamptz)` — a single
--      function that performs the line revert AND, iff the parent order
--      is `completed`, the order revert (state -> printed, completed_at ->
--      NULL) in ONE transaction. This keeps the cascade atomic (the DB
--      CHECK constraint forbids state='completed' with completed_at NULL,
--      so the two writes can never be observed apart) and off the JS
--      layer. Both writes carry TOCTOU guards (line: done_at IS NOT NULL;
--      order: state = 'completed').
--
-- The audit row for the undo is written by the trigger above (fired by
-- the order_lines UPDATE inside the RPC), NOT by the application — one
-- `line_undone` row per undo, user_id NULL (KDS runs service-role).

-- ─── 1. Trigger: recognise the undo (reverse) transition ──────────────
-- CREATE OR REPLACE preserves the canonical post-hardening body
-- (20260601000000) verbatim — SECURITY DEFINER + SET search_path=public
-- + the same NULL-safe app.current_user_id read — and only adds the
-- ELSIF branch for the reverse transition. EXECUTE grants are unchanged
-- (the 20260613020000 REVOKEs persist across CREATE OR REPLACE, which
-- does not reset ACLs).

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
    ELSIF OLD.done_at IS NOT NULL AND NEW.done_at IS NULL THEN
      v_action := 'line_undone';
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

-- ─── 2. RPC: atomic line-undo cascade ─────────────────────────────────
-- Returns TRUE iff a completed order was reverted to printed.
-- Idempotency + not-found are handled in the adapter BEFORE calling this
-- (the adapter reads the line first); this function assumes the line
-- exists and was done, and is itself guarded so a concurrent change is a
-- safe no-op rather than a corruption.

CREATE OR REPLACE FUNCTION kds_undo_line(
  p_line_id uuid,
  p_when    timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id    uuid;
  v_order_state order_state;
  v_reopened    boolean := false;
BEGIN
  -- Resolve the parent order + its current state for the cascade
  -- decision. (The adapter has already confirmed the line exists and
  -- was done; this re-read makes the function self-contained.)
  SELECT ol.order_id, o.state
    INTO v_order_id, v_order_state
  FROM order_lines ol
  JOIN orders o ON o.id = ol.order_id
  WHERE ol.id = p_line_id;

  -- Clear the line, guarded on it still being done (TOCTOU). If a
  -- concurrent undo already cleared it, this updates zero rows and the
  -- whole call is a benign no-op.
  UPDATE order_lines
     SET done_at = NULL, done_by = NULL
   WHERE id = p_line_id
     AND done_at IS NOT NULL;

  -- Cascade: re-open a completed parent in the SAME transaction. The
  -- CHECK constraint forbids state='completed' with completed_at NULL,
  -- so flipping state and clearing completed_at must happen together.
  -- Guarded on state='completed' so a concurrent re-complete cannot be
  -- clobbered (the guard simply misses -> no-op -> v_reopened stays as
  -- whatever the row state demanded).
  IF v_order_state = 'completed' THEN
    UPDATE orders
       SET state = 'printed', completed_at = NULL
     WHERE id = v_order_id
       AND state = 'completed';
    v_reopened := true;
  END IF;

  RETURN v_reopened;
END $$;

-- Lock the RPC down to the service role only (the KDS use-cases reach
-- the DB as service_role, bypassing RLS). Mirrors the 20260613020000
-- hardening posture: revoke the PUBLIC catch-all + anon/authenticated,
-- grant exactly what the app needs.
REVOKE EXECUTE ON FUNCTION public.kds_undo_line(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.kds_undo_line(uuid, timestamptz) FROM anon;
REVOKE EXECUTE ON FUNCTION public.kds_undo_line(uuid, timestamptz) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.kds_undo_line(uuid, timestamptz) TO service_role;
