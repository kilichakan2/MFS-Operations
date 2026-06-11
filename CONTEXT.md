# MFS-Operations — Domain Context

Glossary of terms as this project uses them. Grill challenges every
divergence from this file; keep definitions in plain language.

## Glossary

**Preview branch** — a disposable copy of the database that is created
automatically for one pull request and deleted when that pull request closes.
Born with the PR's migrations and the standard test fixtures already applied.
Never contains real customer data.

**Preview smoke** — the pre-ship rehearsal check: the three `@critical`
order-pipeline robot tests (place an order, print the picking list, work it
through the kitchen screen) run against the PR's deployed preview build and
its preview branch, before the merge decision at FORGE Gate 4. Fails closed:
if the rehearsal environment isn't safe, nothing ships.

**ANVIL-TEST fixtures** — the dummy customer, dummy product, and dummy staff
logins (prefixed `ANVIL-TEST-`) that automated tests need in whatever
database they run against. Planted by `supabase/seed.sql` on local resets and
preview branches; must never exist in production (F-TD-07 audits for that).

**Seed sentinel** — a single fixture row with a fixed, hard-coded ID that can
only ever exist in a database created from this repo's seed file
(`supabase/seed.sql`). Its presence proves "this database was born from
seed.sql"; its absence proves the opposite. In plain English: one
uniquely-numbered dummy row is planted in every throwaway database — if the
robot can see that row through the deployed app, the app is definitely
talking to a throwaway database, not the real one. No test code anywhere
creates this row; only seed.sql does.
