-- rollback: 2026-06-21-f-rls-04f-complaints-rls-cutover-rollback.sql
--
-- Manual DB rollback for 20260621130000_complaints_authenticated_rls_policies.sql
-- (F-RLS-04f). Drops the 12 permissive valid-user policies the cutover added.
--
-- The REAL rollback is the CODE LEVER: revert each flipped handler's local
-- `const complaintsService = await complaintsServiceForCaller(userId)` (resp.
-- compliments) back to the imported singleton — that makes traffic run as the
-- master-key role again, for which RLS is irrelevant. With the code lever pulled
-- these policies are harmless-but-inert, so this DB lever is optional.
--
-- ROLLBACK NUANCE (plan §11): the migration DROPped the 3 baseline owner-only
-- `complaints` policies (complaints_insert / complaints_select / complaints_update).
-- This file does NOT recreate them — and that is correct and safe: those policies
-- were DORMANT (they only fire for the `authenticated` role, and no complaints
-- traffic ran as `authenticated` before F-RLS-04f), so they protected nothing in
-- practice. Re-adding owner-only policies while the code is on the master key has
-- zero effect and only muddies the schema. If a belt-and-braces "restore baseline
-- exactly" is ever wanted, copy the 3 originals verbatim from baseline.sql
-- L2431/2434/2437; recommended default is to LEAVE THEM DROPPED.
--
-- No data rollback / no PITR: DROP POLICY only — additive/idempotent, no data
-- touched.

DROP POLICY IF EXISTS complaints_select_v2     ON complaints;
DROP POLICY IF EXISTS complaints_insert_v2     ON complaints;
DROP POLICY IF EXISTS complaints_update_v2     ON complaints;
DROP POLICY IF EXISTS complaints_delete_v2     ON complaints;
DROP POLICY IF EXISTS complaint_notes_select   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_insert   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_update   ON complaint_notes;
DROP POLICY IF EXISTS complaint_notes_delete   ON complaint_notes;
DROP POLICY IF EXISTS compliments_select       ON compliments;
DROP POLICY IF EXISTS compliments_insert       ON compliments;
DROP POLICY IF EXISTS compliments_update       ON compliments;
DROP POLICY IF EXISTS compliments_delete       ON compliments;
