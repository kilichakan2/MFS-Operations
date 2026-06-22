-- rollback: 2026-06-22-f-rls-04g-visits-rls-cutover-rollback.sql
--
-- Manual DB rollback for 20260622120000_visit_notes_authenticated_policies.sql.
-- Drops the 4 visit_notes policies the cutover added -> visit_notes returns to
-- deny-all under the authenticated role.
--
-- The REAL rollback is the CODE LEVER (revert each of the 7 flipped handlers'
-- `const visitsService = await visitsServiceForCaller(userId)` back to the
-- module-level `visitsService` singleton import) -- that puts traffic on the
-- master key, for which RLS is irrelevant. With the code lever pulled these
-- policies are harmless-but-inert, so this DB lever is optional.
--
-- The `visits` baseline policies were NOT created by this cutover and are NOT
-- dropped here (they are dormant under the master key).
--
-- No data rollback / no PITR: DROP POLICY only -- additive/idempotent, no data.

DROP POLICY IF EXISTS visit_notes_select ON visit_notes;
DROP POLICY IF EXISTS visit_notes_insert ON visit_notes;
DROP POLICY IF EXISTS visit_notes_update ON visit_notes;
DROP POLICY IF EXISTS visit_notes_delete ON visit_notes;
