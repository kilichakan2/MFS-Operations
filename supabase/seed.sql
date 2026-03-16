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
