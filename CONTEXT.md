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

**Idempotency key** — a unique fingerprint the order form sends with each
"place order" request. If the same fingerprint arrives twice (double-tap,
flaky-wifi retry), the second request creates nothing and gets back the
order the first one created. Guarantees one tap = at most one order.

**Seed sentinel** — a single fixture row with a fixed, hard-coded ID that can
only ever exist in a database created from this repo's seed file
(`supabase/seed.sql`). Its presence proves "this database was born from
seed.sql"; its absence proves the opposite. In plain English: one
uniquely-numbered dummy row is planted in every throwaway database — if the
robot can see that row through the deployed app, the app is definitely
talking to a throwaway database, not the real one. No test code anywhere
creates this row; only seed.sql does.

**LLMExtractor** — the app's own socket for "turn this pasted text into
mapped customer or product rows." The AI vendor (currently Anthropic) plugs
in behind it via an adapter; the import screen and route never see the
vendor. Swapping the AI = one new adapter + one wiring line.

**Geocoder** — the app's own socket for "turn a UK postcode into map
coordinates (lat/lng)." The lookup vendor (currently postcodes.io, a free
public API hit via `fetch`) plugs in behind it via an adapter; the admin
routes that need coordinates never see the vendor. Swapping the lookup =
one new adapter + one wiring line. **Approximate location** — when a full
postcode won't resolve, the lookup falls back to the *outcode* (the first
half, e.g. `"S70 1KW"` → `"S70"`), giving the centre of that postcode
district and flagging the row `is_approximate_location = true` so the map
can show it's a rough pin, not an exact one.

**Authenticated DB client** — a database connection stamped with *who is
asking*. Built per request from the logged-in user's identity, so the
database's own row-level-security rules decide what that user may see. The
opposite of the **admin (service-role) client** — the master-key connection
that ignores those rules and can touch any row, reserved for system/admin
jobs (login, cron, admin screens) behind `requireServiceRole()`.

**GUC bridge** — the database's "fill in the clipboard" step. The app's RLS
rules check a session variable (`app.current_user_id`); the bridge is a tiny
database hook that reads the user's id out of a per-request signed token and
writes it into that variable, so the rules already written keep working
unchanged. Inert until a route is actually switched onto the authenticated
client.

**Visit notes — there are TWO, on purpose.** A visit carries two unrelated
note mechanisms that sit next to each other in the visit-detail pop-up, so
they are easy to confuse:
- **The visit's own note (`visits.notes`)** — one free-text box filled in on
  the *Log a Visit* form ("Notes (optional)"), saved on the visit row itself.
  One per visit; the rep's summary written at logging time. Editable only by
  re-opening the whole visit (tap **Edit** on the card → change → re-submit),
  which re-syncs through `screen3/sync`. In the detail pop-up it shows at the
  top labelled **"Original note"**.
- **The follow-up thread (`visit_notes` table)** — a running list of dated,
  signed comments added *after* the visit, via the **"Add an update…"** field
  inside the visit-detail pop-up. Many rows per visit, each with its own
  author + timestamp, each individually editable (author or manager only).
  This is the GET/POST/PATCH `screen3/visit/notes` feature.
- Plain English: "Original note" = the box on the form; the list under
  **Notes** = a comment thread stapled to the visit. Two stores, one screen.
  When checking a note in the DB, look in `visits.notes` for the form note and
  the `visit_notes` table for the thread — they are not the same place.

**Visit visibility (who sees which visits).** Visits are owner-scoped:
- **admin** sees *every* visit (the only "see all" role).
- **sales + drivers** are the field visit-loggers; each sees *only their own*
  visits (and the notes on them). Drivers log visits too — not just sales.
- **office** sees *nothing* in Visits by design: office staff never log client
  visits and have no oversight role here, so their visits board is empty. This
  is intentional, not a bug — do not "fix" an empty office board.
This rule is enforced at the database via row-level security (the dormant
baseline `visits` policies — own-row OR `is_admin()` — which `is_admin()`
scopes to role `admin` only). Notes inherit it: you may read/add notes on a
visit you can see, and edit a note only if you authored it or you are admin.

**HACCP visibility (who sees which HACCP records).** Unlike visits, HACCP data
is *org-wide operational*, NOT owner-scoped. The food-safety records (temps,
cleaning logs, deliveries, suppliers, the handbook, reviews) belong to the
business, not to the staff member who logged them. So **any real authenticated
staff member — every role — may read AND write every HACCP record**, regardless
of who created it. Business reason: someone recording a fridge temp must be able
to see the previous reading whoever logged it. There is no "see only your own"
for HACCP. **Visitors are excluded automatically** — the public visitor kiosk
never creates a user profile, so a visitor has no `app.current_user_id` and
fails the policy. At the database this is enforced (F-RLS-04h / Cluster G) by a
single uniform policy family across all 30 `haccp_*` tables: the row is
visible/writable when `current_setting('app.current_user_id')` resolves to a real
**active** `users` row. Fine-grained "only admin can edit suppliers" stays at the route
edge (`requireRole`); the DB policy is the backstop, not the primary gate.
