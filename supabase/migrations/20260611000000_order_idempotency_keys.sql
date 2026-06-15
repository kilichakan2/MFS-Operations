-- ============================================================
-- Order idempotency keys (F-08)
-- ============================================================
--
-- One row per Idempotency-Key ever accepted by POST /api/orders.
-- The key is the client-supplied fingerprint sent with a "place
-- order" request; if the same fingerprint arrives twice (double-tap,
-- flaky-wifi retry), the second request creates nothing and gets back
-- the order the first one created. See CONTEXT.md "Idempotency key"
-- and docs/plans/2026-06-11-f-08-orders-route-rewrites.md §5 D1.
--
-- Race arbitration: the PRIMARY KEY on `key` is the arbiter when two
-- identical requests land in the same instant. Both briefly create an
-- order; exactly one INSERT into this table wins; the loser deletes
-- its own order (CASCADE removes its lines) and returns the winner's.
--
-- TTL: rows expire 24h after creation (expires_at). Expiry is
-- enforced at read time and reclaimed opportunistically when an
-- expired key is reused. No scheduled purge in this unit — tracked
-- as BACKLOG F-TD-09.
--
-- ON DELETE CASCADE on order_id: if the order is deleted (e.g. the
-- lines-insert rollback path), its key row must not survive — a
-- dangling key would replay a non-existent order.

CREATE TABLE order_idempotency_keys (
  key         text        PRIMARY KEY
                          CHECK (char_length(key) BETWEEN 1 AND 200),
  order_id    uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  created_by  uuid        NOT NULL REFERENCES users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

-- Deny-all by default; only the service-role client (which bypasses
-- RLS) touches this table. Matches the ADR-0004 posture of the
-- orders tables.
ALTER TABLE order_idempotency_keys ENABLE ROW LEVEL SECURITY;
