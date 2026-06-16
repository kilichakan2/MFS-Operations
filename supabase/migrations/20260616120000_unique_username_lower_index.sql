-- F-TD-22 — Prevent duplicate usernames.
-- A UNIQUE index on lower(name) so no two case-insensitively-identical
-- usernames can coexist. Covers ALL rows (active AND inactive): login
-- looks users up by name with .ilike and does NOT filter on active, so a
-- deactivated name still reserves the name. NOT a partial index.
--
-- Pairs with trim-on-write in lib/adapters/{supabase,fake}/UsersRepository.ts
-- (createUser stores name.trim()), so the stored value is already canonical
-- and lower(name) — not lower(trim(name)) — is sufficient.
--
-- Pre-condition (verified read-only before apply): zero existing
-- lower(trim(name)) collisions in prod. If any exist this CREATE fails;
-- resolve duplicates by hand first (see the F-TD-22 plan §9).

CREATE UNIQUE INDEX IF NOT EXISTS users_lower_name_unique_idx
  ON public.users (lower(name));

-- Rollback (if ever needed):
--   DROP INDEX IF EXISTS public.users_lower_name_unique_idx;
