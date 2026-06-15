# F-TD-07 — Production hygiene audit for leftover `ANVIL-TEST-*` rows

**Date:** 2026-06-15
**Type:** Read-only production data audit (no code change, no migration, no deletes)
**Prod Supabase ref:** `uqgecljspgtevoylwkep`
**Outcome:** ✅ CLEAN — zero fixture rows found. Nothing to delete.

## Why this audit existed

Before F-TD-03 (integration-test runner), the documented integration-test
procedure booted the dev server against `.env.local` (production Supabase). Any
past run that followed that procedure *could* have written `ANVIL-TEST-*` fixture
rows (users, customers, products, and orders referencing them) into the
PRODUCTION database via the dev server. F-TD-07 was the one-off audit to confirm
whether any such contamination exists, and to clean it up if so — with Hakan
present for the delete decision.

## Method (all read-only `SELECT`, via Supabase MCP `execute_sql`)

1. **Schema confirm** — verified which columns hold name-style fields:
   `users.name`, `customers.name`, `products.name`; `orders` links via
   `customer_id` and `created_by`.
2. **Exact-prefix audit** — counted rows where `name LIKE 'ANVIL-TEST-%'` in
   `users`, `customers`, `products`, plus orders whose `customer_id` or
   `created_by` referenced any matched fixture row.
3. **Widened sweep** — case-insensitive substring match for any of
   `anvil` / `e2e` / `fixture` / `test` / `sentinel` across the same three
   name-bearing tables (catches casing/prefix drift).
4. **Live-data sanity count** — total row counts per table, to prove the queries
   read real data (not an empty DB or an RLS-masked view that would make a zero
   meaningless). MCP runs as service-role, so RLS does not mask these reads.

## Results

| Table | `ANVIL-TEST-%` rows | Widened sweep | Total (real) rows |
|---|---|---|---|
| users | 0 | 0 | 11 |
| customers | 0 | 0 | 107 |
| products | 0 | 0 | 285 |
| orders (linked to fixtures) | 0 | — | 8 |

The 8 orders are all legitimate production data; the most recent is
`MFS-2026-0008`, created by Hakan during the F-RLS-04a live verification.

## Conclusion

Production was never contaminated with `ANVIL-TEST-*` fixture rows. No delete
decision was needed. F-TD-07 closes as **audited, clean, nothing to remove**.

The risk it guarded against is now structurally prevented anyway: F-TD-03 moved
the integration runner onto a local Supabase wired via `.env.test.local`, with a
server-side DB identity probe that aborts if the booted server is not pointed at
the local DB — so the dev server can no longer write fixtures into prod.
