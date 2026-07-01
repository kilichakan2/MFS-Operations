-- 2026-07-01-haccp-process-room-ui-phase1-rollback.sql
--
-- Reverse of migration 20260701120000_haccp_process_room_thresholds.sql.
--
-- ADDITIVE migration → SAFE rollback. The migration only CREATE TABLE + seed +
-- CREATE POLICY + GRANT on two BRAND-NEW tables. Nothing pre-existing was
-- altered, so dropping the two new tables fully reverses it with ZERO data loss
-- to any existing table. No PITR required (no destructive op was ever applied).
--
-- Before day-one merge the tables carry only the two seed rows + any admin
-- edits/audit rows made since deploy. If you roll back AFTER go-live and want to
-- preserve threshold-edit history, snapshot haccp_threshold_audit first.
--
-- Order: audit table has no FK to the thresholds table, but drop it first for
-- tidiness. CASCADE covers the policies/constraints created on each table.

DROP TABLE IF EXISTS public.haccp_threshold_audit CASCADE;
DROP TABLE IF EXISTS public.haccp_process_room_thresholds CASCADE;

-- Post-rollback the app's process-room band derivation falls back to its
-- pre-migration hardcoded limits ONLY IF the corresponding code is also reverted
-- (resolveProcRoomThresholds now fails closed when the tables are absent). Roll
-- back the CODE (Vercel) and the DB together — do not leave the new code running
-- against a dropped thresholds table, or the process-room GET will 500 by design.
