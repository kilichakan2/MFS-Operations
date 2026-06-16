-- ANVIL rollback — F-TD-22 (prevent duplicate usernames)
-- Reverses migration: supabase/migrations/20260616120000_unique_username_lower_index.sql
--
-- Non-destructive forward migration (CREATE UNIQUE INDEX only — no DROP/TRUNCATE/
-- ALTER TYPE/DROP NOT NULL). Dropping the index loses NO data: it only removes the
-- uniqueness *guarantee*, restoring the pre-F-TD-22 state where two case-insensitively
-- identical usernames could coexist. Vercel code-rollback is sufficient on its own;
-- this script is here for completeness so the schema can be returned to its prior shape.
--
-- No PITR required (no data is destroyed by either the forward migration or this rollback).

DROP INDEX IF EXISTS public.users_lower_name_unique_idx;
