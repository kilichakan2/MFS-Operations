-- ANVIL rollback — 2026-07-02 goods-in-ccp1-unit (PR #112)
-- Reverses supabase/migrations/20260702120000_haccp_goods_in_thresholds.sql
--
-- The forward migration is ADDITIVE ONLY (CREATE TABLE x2 + seed + RLS policies
-- + grants — no DROP TABLE / TRUNCATE / ALTER TYPE / DROP NOT NULL), so this
-- rollback carries no pre-existing-data-loss risk: it only removes the two
-- tables the migration itself introduced. Threshold edits + audit rows made
-- AFTER deploy would be lost — acceptable, the seed re-creates the locked
-- regulatory bands on re-apply.
--
-- Primary rollback path for the PR as a whole: revert the merge commit
-- (old code never reads these tables). Run this script only if the schema
-- itself must be removed.

BEGIN;

-- Dropping the tables cascades their RLS policies and grants.
DROP TABLE IF EXISTS public.haccp_goods_in_threshold_audit;
DROP TABLE IF EXISTS public.haccp_goods_in_thresholds;

COMMIT;
