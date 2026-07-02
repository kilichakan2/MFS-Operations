-- ANVIL rollback — 2026-07-02 haccp-mince-unit (PR #113)
-- Reverses supabase/migrations/20260702150000_haccp_mince_thresholds.sql
--
-- The forward migration is ADDITIVE ONLY (CREATE TABLE x2 + seed + RLS policies
-- + grants — no DROP TABLE / TRUNCATE / ALTER TYPE / DROP NOT NULL; the only
-- DROP lines are DROP POLICY IF EXISTS idempotency guards), so this rollback
-- carries no pre-existing-data-loss risk: it only removes the two tables the
-- migration itself introduced. Threshold edits + audit rows made AFTER deploy
-- would be lost — acceptable, the seed re-creates the locked regulatory bands
-- (Reg 853/2004 Annex III Sec V Ch III) on re-apply.
--
-- Primary rollback path for the PR as a whole: revert the merge commit
-- (old code never reads these tables). Run this script only if the schema
-- itself must be removed.

BEGIN;

-- Dropping the tables cascades their RLS policies and grants.
DROP TABLE IF EXISTS public.haccp_mince_threshold_audit;
DROP TABLE IF EXISTS public.haccp_mince_thresholds;

COMMIT;
