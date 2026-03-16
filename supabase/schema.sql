-- ============================================================
-- MFS Global Operations App — Database Schema
-- Supabase (PostgreSQL) — eu-west-2
-- Version 1.1 — includes ERP future-proofing columns
-- ============================================================

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE user_role AS ENUM ('warehouse', 'office', 'sales', 'admin');

CREATE TYPE discrepancy_status AS ENUM ('short', 'not_sent');

CREATE TYPE discrepancy_reason AS ENUM (
  'out_of_stock',
  'supplier_short',
  'butcher_error',
  'other'
);

CREATE TYPE discrepancy_unit AS ENUM ('kg', 'units');

CREATE TYPE complaint_status AS ENUM ('open', 'resolved');

CREATE TYPE complaint_category AS ENUM (
  'weight',
  'quality',
  'delivery',
  'missing_item',
  'pricing',
  'service',
  'other'
);

CREATE TYPE complaint_received_via AS ENUM (
  'phone',
  'in_person',
  'whatsapp',
  'email',
  'other'
);

CREATE TYPE visit_type AS ENUM (
  'routine',
  'new_pitch',
  'complaint_followup',
  'delivery_issue'
);

CREATE TYPE visit_outcome AS ENUM (
  'positive',
  'neutral',
  'at_risk',
  'lost'
);

CREATE TYPE audit_screen AS ENUM (
  'screen1',
  'screen2',
  'screen3',
  'screen5'
);

-- ============================================================
-- REFERENCE TABLES
-- ============================================================

-- Users — all app users across all roles
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  name              text NOT NULL,
  role              user_role NOT NULL,
  pin_hash          text,         -- bcrypt hash — nullable, used for warehouse/office/sales
  password_hash     text,         -- bcrypt hash — nullable, used for admin
  active            boolean NOT NULL DEFAULT true,
  last_login_at     timestamptz,

  -- Constraint: admin must have password_hash, non-admin must have pin_hash
  CONSTRAINT users_auth_check CHECK (
    (role = 'admin' AND password_hash IS NOT NULL)
    OR
    (role != 'admin' AND pin_hash IS NOT NULL)
  )
);

-- Customers — active customer list, shared across Screens 1, 2, 3
-- ERP future-proofing: external_system_id and external_system_source
-- allow two-way sync with BarcodeX, Fresho, or Xero without schema changes
CREATE TABLE customers (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES users(id),
  name                    text NOT NULL,
  active                  boolean NOT NULL DEFAULT true,

  -- ERP future-proofing columns
  -- external_system_id: the record's ID in the external system (e.g. Xero contact ID, BarcodeX customer code)
  -- unique constraint ensures no duplicate mappings from the same source
  external_system_id      varchar(255),
  external_system_source  varchar(100),  -- e.g. 'xero', 'barcodex', 'fresho'

  CONSTRAINT customers_external_unique UNIQUE (external_system_id, external_system_source)
);

-- Products — product reference list, used by Screen 1
-- ERP future-proofing: same pattern as customers
CREATE TABLE products (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  created_by              uuid REFERENCES users(id),
  name                    text NOT NULL,
  category                text,
  active                  boolean NOT NULL DEFAULT true,

  -- ERP future-proofing columns
  -- external_system_id: the record's ID in the external system (e.g. BarcodeX SKU, Fresho product code)
  external_system_id      varchar(255),
  external_system_source  varchar(100),  -- e.g. 'barcodex', 'fresho', 'xero'

  CONSTRAINT products_external_unique UNIQUE (external_system_id, external_system_source)
);

-- ============================================================
-- OPERATIONAL TABLES
-- ============================================================

-- Discrepancies — dispatch exceptions logged by Daz (Screen 1)
CREATE TABLE discrepancies (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  user_id       uuid NOT NULL REFERENCES users(id),
  customer_id   uuid NOT NULL REFERENCES customers(id),
  product_id    uuid NOT NULL REFERENCES products(id),
  ordered_qty   decimal(8,3) NOT NULL CHECK (ordered_qty > 0),
  sent_qty      decimal(8,3) CHECK (sent_qty > 0),  -- NULL when status = not_sent
  unit          discrepancy_unit NOT NULL,
  status        discrepancy_status NOT NULL,
  reason        discrepancy_reason NOT NULL,
  note          text,

  -- sent_qty must be NULL when not_sent, must be present and less than ordered when short
  CONSTRAINT discrepancies_sent_qty_check CHECK (
    (status = 'not_sent' AND sent_qty IS NULL)
    OR
    (status = 'short' AND sent_qty IS NOT NULL AND sent_qty < ordered_qty)
  )
);

-- Complaints — logged by any operational team member (Screen 2)
CREATE TABLE complaints (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  customer_id      uuid NOT NULL REFERENCES customers(id),
  category         complaint_category NOT NULL,
  description      text NOT NULL CHECK (char_length(description) >= 5),
  received_via     complaint_received_via NOT NULL,
  user_id          uuid NOT NULL REFERENCES users(id),          -- who logged it
  status           complaint_status NOT NULL DEFAULT 'open',
  resolution_note  text,
  resolved_by      uuid REFERENCES users(id),                   -- nullable until resolved
  resolved_at      timestamptz,                                 -- nullable until resolved

  -- resolution fields must be consistent
  CONSTRAINT complaints_resolution_check CHECK (
    (status = 'open' AND resolution_note IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
    OR
    (status = 'resolved' AND resolution_note IS NOT NULL AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
  )
);

-- Visits — sales visits logged by Omer and Mehmet (Screen 3)
CREATE TABLE visits (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  user_id             uuid NOT NULL REFERENCES users(id),
  customer_id         uuid REFERENCES customers(id),    -- nullable if new prospect
  prospect_name       text,                             -- nullable if existing customer
  prospect_postcode   text,                             -- nullable, no format validation
  visit_type          visit_type NOT NULL,
  outcome             visit_outcome NOT NULL,
  commitment_made     boolean NOT NULL DEFAULT false,
  commitment_detail   text,
  notes               text,

  -- must have either customer_id or prospect_name, not both, not neither
  CONSTRAINT visits_customer_check CHECK (
    (customer_id IS NOT NULL AND prospect_name IS NULL)
    OR
    (customer_id IS NULL AND prospect_name IS NOT NULL)
  ),

  -- commitment_detail required if commitment_made is true
  CONSTRAINT visits_commitment_check CHECK (
    (commitment_made = false AND commitment_detail IS NULL)
    OR
    (commitment_made = true AND commitment_detail IS NOT NULL)
  )
);

-- ============================================================
-- SYSTEM TABLE
-- ============================================================

-- Audit log — immutable append-only record of all actions
-- No updates or deletes permitted (enforced via RLS policy)
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid NOT NULL REFERENCES users(id),
  screen      audit_screen NOT NULL,
  action      text NOT NULL,   -- 'created', 'updated', 'imported', 'user_created', etc.
  record_id   uuid,            -- nullable — id of the affected record if applicable
  summary     text NOT NULL    -- auto-generated human-readable description
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Discrepancies — common dashboard queries
CREATE INDEX idx_discrepancies_created_at  ON discrepancies(created_at DESC);
CREATE INDEX idx_discrepancies_customer_id ON discrepancies(customer_id);
CREATE INDEX idx_discrepancies_reason      ON discrepancies(reason);
CREATE INDEX idx_discrepancies_status      ON discrepancies(status);

-- Complaints — dashboard alert queries
CREATE INDEX idx_complaints_status        ON complaints(status);
CREATE INDEX idx_complaints_created_at    ON complaints(created_at DESC);
CREATE INDEX idx_complaints_customer_id   ON complaints(customer_id);
CREATE INDEX idx_complaints_category      ON complaints(category);

-- Visits — dashboard and per-rep queries
CREATE INDEX idx_visits_created_at        ON visits(created_at DESC);
CREATE INDEX idx_visits_user_id           ON visits(user_id);
CREATE INDEX idx_visits_outcome           ON visits(outcome);
CREATE INDEX idx_visits_customer_id       ON visits(customer_id);

-- Audit log — admin panel queries
CREATE INDEX idx_audit_log_created_at     ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_user_id        ON audit_log(user_id);
CREATE INDEX idx_audit_log_screen         ON audit_log(screen);

-- ERP future-proofing — sync lookups
CREATE INDEX idx_customers_external       ON customers(external_system_source, external_system_id);
CREATE INDEX idx_products_external        ON products(external_system_source, external_system_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE discrepancies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaints     ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits         ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log      ENABLE ROW LEVEL SECURITY;

-- Audit log: insert allowed for all authenticated users, no updates or deletes ever
CREATE POLICY audit_log_insert ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY audit_log_select ON audit_log FOR SELECT TO authenticated USING (true);
-- No UPDATE or DELETE policies — omission is the enforcement

-- NOTE: Full RLS policies for role-based access (warehouse/office/sales/admin)
-- to be implemented in the Next.js API layer using Supabase service role key
-- with server-side role checks. Client never holds the service key.
-- Supabase anon key is used for auth only — all data queries go through
-- authenticated Next.js API routes that enforce role permissions.
