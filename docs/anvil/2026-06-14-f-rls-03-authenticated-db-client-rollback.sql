-- ============================================================================
-- ANVIL ROLLBACK — F-RLS-03 db-pre-request GUC bridge
-- Migration: supabase/migrations/20260614210221_db_pre_request_guc_bridge.sql
-- PR #38 · branch feat/f-rls-03-authenticated-db-client
--
-- NON-DESTRUCTIVE migration. This rollback is instant and touches NO data:
-- it unsets the PostgREST pre-request hook on the `authenticator` role,
-- reloads PostgREST config, and (optionally) drops the bridge function.
--
-- After this runs, the database is byte-for-byte back to the pre-F-RLS-03
-- door config: no hook runs before requests, and `app.current_user_id` is set
-- by nobody (exactly today's behaviour — the 83 service-role routes never set
-- it). No PITR required.
-- 🗣 Unset the doorman and reload — the door config returns to exactly today's.
-- ============================================================================

-- 1. Detach the pre-request hook from the PostgREST connection role.
ALTER ROLE authenticator RESET pgrst.db_pre_request;

-- 2. Tell PostgREST to pick up the change without a restart.
NOTIFY pgrst, 'reload config';

-- 3. (Optional) Remove the bridge function itself. Safe — nothing else calls it.
DROP FUNCTION IF EXISTS public.db_pre_request();
