-- ============================================================
-- MFS Operations App — Admin User Seed
-- Run AFTER the main schema (mfs_schema.sql)
-- ============================================================

-- Hakan Kilic — Managing Partner
INSERT INTO users (id, name, role, password_hash, active)
VALUES (
  gen_random_uuid(),
  'Hakan Kilic',
  'admin',
  '$2b$12$a.Y5R06wCy78Spol.c9PGusgIUpNmLgQz8958ardqIIwQ1Kg.EURS',
  true
);

-- Ege Ozmen — Managing Director
INSERT INTO users (id, name, role, password_hash, active)
VALUES (
  gen_random_uuid(),
  'Ege Ozmen',
  'admin',
  '$2b$12$a.Y5R06wCy78Spol.c9PGuksqthpVfjN5FaPvD3GGQGPygxB5klgS',
  true
);

-- ============================================================
-- Operational users (PINs to be set via Screen 5 admin panel)
-- Placeholder hashes below — replace via admin panel before use
-- ============================================================

INSERT INTO users (id, name, role, pin_hash, active)
VALUES
  (gen_random_uuid(), 'Emre',  'office',    '$2b$12$placeholder_emre',   true),
  (gen_random_uuid(), 'Daz',   'warehouse', '$2b$12$placeholder_daz',    true),
  (gen_random_uuid(), 'Omer',  'sales',     '$2b$12$placeholder_omer',   true),
  (gen_random_uuid(), 'Mehmet','sales',     '$2b$12$placeholder_mehmet', true);

-- Note: operational user pin_hashes are placeholders.
-- Set real PINs via Screen 5 → Users → Reset PIN before handing phones to staff.

-- ============================================================
-- TEST FIXTURES (ANVIL-TEST) — MUST NEVER REACH PRODUCTION
-- This file runs ONLY on local `supabase db reset` and on
-- Supabase preview-branch creation. It is never executed
-- against the production project. F-TD-07 audits production
-- for any historical ANVIL-TEST leakage.
-- Shapes mirror tests/integration/_setup.ts (TEST_PREFIX etc.)
-- and the PIN hashes must bcrypt-match the E2E_PIN_* values in
-- the conductor's gitignored .env.e2e.local. (F-INFRA-02)
--
-- Invariants:
--   * Test PINs are freshly minted random values — NEVER reuse a
--     real staff PIN as a test PIN, and never write a plaintext
--     test PIN into this file, any commit, or any comment.
--   * If a value in .env.e2e.local is rotated, the matching hash
--     below must be regenerated in the same change, or every
--     future preview branch fails the identity probe
--     ("PIN-hash drift" — see docs/runbooks/preview-smoke.md).
-- ============================================================

-- Seed sentinel — fixed UUID. This exact id can only exist in a
-- database created from this file; its presence through a deployed
-- app proves "this is a seed-born (preview/local) database, not
-- production". active = true so /api/reference returns it.
INSERT INTO customers (id, name, active, postcode)
VALUES ('a417e57e-0000-4e2e-a000-000000000001', 'ANVIL-TEST-SEED-SENTINEL', true, 'XX1 1XX')
ON CONFLICT (name) DO NOTHING;

-- Test customer + product the @critical specs pick in the UI
-- (same shapes tests/integration/_setup.ts creates on demand).
INSERT INTO customers (name, active, postcode)
VALUES ('ANVIL-TEST-customer', true, 'XX1 1XX')
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name, code, active)
VALUES ('ANVIL-TEST-product', 'ANVIL-TEST-001', true)
ON CONFLICT (name) DO NOTHING;

-- Test users, one per role — names must match tests/integration/_setup.ts
-- TestUserSet exactly. users_auth_check: admin → password_hash,
-- non-admin → pin_hash. Hashes are bcrypt of the gitignored
-- .env.e2e.local values (E2E_PASSWORD_ADMIN / E2E_PIN_<ROLE>).
INSERT INTO users (id, name, role, password_hash, pin_hash, active)
VALUES
  (gen_random_uuid(), 'ANVIL-TEST-admin',     'admin',     '$2a$10$/rIL2SUTJPTO9xi6LY3pA./EoH7GeeCBgo8Vj/3MRfgAIBEdgh2f.', NULL, true),
  (gen_random_uuid(), 'ANVIL-TEST-sales',     'sales',     NULL, '$2a$10$mxMUqg.pEnmPrDcjx8Dmaug9NIAFSmPHz/7uBg3G99MhfmaWkMlO6', true),
  (gen_random_uuid(), 'ANVIL-TEST-office',    'office',    NULL, '$2a$10$I3Vo.0M7BwgYyYxSbiabu.FLXtHSgdKut0de/vIUss67XgP8fFFNS', true),
  (gen_random_uuid(), 'ANVIL-TEST-warehouse', 'warehouse', NULL, '$2a$10$uzDajOezDyJvqy9TlFdPPumWJyMuzVYB5I/HYln6Z2.TSaTs9STHi', true),
  (gen_random_uuid(), 'ANVIL-TEST-butcher',   'butcher',   NULL, '$2a$10$PvHk6PoHsaZ/JiFG9xQQVuHpy./wEZGqI6wq4ZyMU4RJoeQVHPixG', true),
  (gen_random_uuid(), 'ANVIL-TEST-driver',    'driver',    NULL, '$2a$10$4dz5jU252RS3.c8CN/Y6GObKcIOesqXzD4zNpZfAmzDq35x9sN.mq', true);

-- Preview branches: this file runs automatically on every Supabase preview branch creation
-- (after migrations), seeding the ANVIL-TEST fixtures the Gate-4 preview smoke depends on.
