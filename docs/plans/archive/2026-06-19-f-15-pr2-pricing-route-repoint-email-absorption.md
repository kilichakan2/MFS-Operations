# F-15 PR2 — Pricing route re-point + activation-email absorption

**Date:** 2026-06-19
**Unit:** F-15 PR2 (follows F-15 PR1 — pricing domain/port/service/adapters already shipped, commit `16cd4f2`)
**Author:** forge-planner (FORGE Order phase)
**Status:** plan locked — implementer-ready

---

## Mini-map

```
DOMAIN (pricing core)
  ├─ PricingRepository (port) → [Supabase]  (adapter, PR1)
  └─ UsersRepository  (port) → [Supabase]  (adapter, F-13)
  pricingActivationEmail (use-case) = pricing + users ports
  routes → pricingService / use-case   (PR2 re-point)
🗣 one socket per vendor; PR2 unplugs the routes from raw Supabase and plugs them into the sockets PR1 built
```

**🗣 In plain English:** PR1 built two sockets (a Pricing socket and we reuse the existing Users socket). PR2 is the wiring job — it disconnects all 5 pricing API routes from the bare database and reconnects them through those sockets, plus retires one last raw database call hidden inside the activation-email file. Nothing the customer sees on the wire changes.

---

## 1. Goal

Re-point the 5 pricing API routes through the already-built `pricingService` (F-15 PR1) and absorb the raw Supabase `fetch` inside `lib/pricing-email.ts` into the hexagonal architecture (via the Users port). Responses, emails, status codes and log lines stay **byte-identical**, except the email recipient list now sources through the Users port instead of a raw HTTP fetch.

**🗣 In plain English:** The routes currently talk to the database directly. We move them to talk through the labelled boxes PR1 made, so a future database swap touches one adapter, not five route files. The behaviour the user experiences is unchanged.

### Hard constraints (from the locked spec — non-negotiable)
- **No migration. No `.sql`.** Schema is untouched.
- **No new dependency.** `package.json` is untouched.
- **No new port method.** Every route maps onto an existing `PricingService` / `UsersRepository` method.
- **No auth/RLS change.** PR2 stays on the **service-role** singletons (`pricingService`, `supabaseUsersRepository`). RLS cutover is F-RLS-04d. `lib/wiring/pricing.ts` explicitly forbids adding a `pricingServiceForCaller` here — **do not add one**.
- **Byte-identical wire output.** Routes return snake_case JSON; domain types are camelCase. The re-point reproduces each response field-for-field.

**🗣 In plain English:** This PR is plumbing only. No database changes, no new libraries, no new lock-down rules, and the JSON coming out of every endpoint must match what it returns today character-for-character.

---

## 2. Domain terms (plain-English glossary for this plan)

- **Port** (`lib/ports/PricingRepository.ts`, `lib/ports/UsersRepository.ts`) — the socket the app owns. 🗣 The shape the database must fit into; vendor adapts to us.
- **Service** (`pricingService`) — the business box the routes call. 🗣 The labelled box the route trusts instead of reaching into the database itself.
- **Use-case** (`lib/usecases/`) — orchestration that composes *two* domains for one operation. 🗣 A recipe that uses two boxes (pricing + users) to do one job the route asks for.
- **Wiring** (`lib/wiring/pricing.ts`) — the only business-layer file allowed to import adapters. 🗣 The parts list that bolts concrete vendor plugs into the abstract sockets.
- **DTO mapping** — turning the camelCase domain shape into the snake_case wire shape. 🗣 A translator that re-labels `referenceNumber` → `reference_number` so the screens still understand it.
- **`PriceAgreementWithLines`** (`lib/domain/Pricing.ts`) — the full agreement read shape (header + ordered lines). 🗣 Everything one agreement page or one email needs, in the app's own clean wording.

---

## 3. Files read / context established (PR1 + F-13 already shipped)

- `lib/usecases/pickingList.ts` — **the precedent** for the use-case shape (factory, `{ service + auxiliary ports }`, production wiring in `lib/wiring`). Followed exactly.
- `lib/api/orders/dto.ts` — **the precedent** for domain→snake_case DTO translators (pure functions, no I/O, unit-tested key-for-key). PR2 follows this pattern for pricing.
- `lib/services/PricingService.ts` + `lib/ports/PricingRepository.ts` — every method 1:1 to a route op; mapping table already documented in the port header.
- `lib/wiring/pricing.ts` — exports `pricingService` (service-role singleton).
- `lib/wiring/users.ts` + `lib/adapters/supabase/index.ts` — `supabaseUsersRepository` is **already exported** from the barrel (line 35-37 of the index). Reuse it directly.
- `lib/ports/UsersRepository.ts` (`listUsersByRoles` + `ListUsersByRolesOptions`) + `lib/domain/User.ts` (`UserSummary` carries `email: string | null`).
- `lib/pricing-email.ts` + `tests/unit/pricing-email.test.ts` (mocks the raw fetch today — that mock is removed).
- `lib/domain/Pricing.ts` — camelCase field names for the domain→snake_case mapping.

**🗣 In plain English:** I read the two pattern files we copy from (picking-list use-case and orders DTO translator), the PR1 pricing boxes, and the email file. Everything needed already exists — the Users socket is already plugged in and exported, so no new socket is required.

---

## 4. ADR conflicts

**None.** This PR is the explicit "PR2 re-points the five routes" follow-up named in both `lib/wiring/pricing.ts` (lines 19-21) and the `PricingRepository` port header. It honours ADR-0002 (ports & adapters, dependency rule, vendor types stop at the adapter): routes will import services/use-cases only and drop their direct `@supabase/*` imports; the use-case depends on ports only.

One ADR-0002 discipline to watch — **the use-case composes two domains, services never import services.** `pricingActivationEmail` correctly takes `{ pricing: PricingService; users: UsersRepository }` and lives in `lib/usecases/`, exactly like `pickingList` takes `{ ordersService, products, users }`. ✓ compliant.

**🗣 In plain English:** No decisions in the project's decision log are violated — in fact this PR is the step those decisions said was coming. The one rule to respect is "boxes don't call other boxes directly" — we obey it by putting the pricing+users combination in a recipe (use-case), not inside a box.

---

## 5. Exact files to change

| # | File | Change |
|---|------|--------|
| 1 | `lib/api/pricing/dto.ts` | **NEW.** Pure domain→snake_case translators for the agreement/line wire shapes + the email DTO mapping. |
| 2 | `lib/usecases/pricingActivationEmail.ts` | **NEW.** Use-case composing `pricing` + `users` ports; resolves agreement + recipients. |
| 3 | `lib/wiring/pricing.ts` | Add `pricingActivationEmail` singleton wired from `pricingService` + `supabaseUsersRepository`. |
| 4 | `lib/pricing-email.ts` | `sendPricingEmail(data)` → `sendPricingEmail(data, recipients)`; delete raw fetch + `SUPA_URL`/`SUPA_KEY`; keep both skip-guards in order. |
| 5 | `app/api/pricing/route.ts` | Re-point GET + POST to `pricingService`; map to snake_case via dto helpers. Drop `supabaseService`/`londonToday` imports. |
| 6 | `app/api/pricing/[id]/route.ts` | Re-point GET/PATCH/DELETE; PATCH activation uses the use-case + email DTO map; reproduce RBAC via `getAgreementOwner`. Drop `supabaseService`/`londonToday` imports. |
| 7 | `app/api/pricing/[id]/lines/route.ts` | Re-point POST addLine; RBAC via `getAgreementOwner`. Drop `supabaseService`. |
| 8 | `app/api/pricing/lines/[lineId]/route.ts` | Re-point PATCH/DELETE; RBAC via `getLineOwner`. Drop `supabaseService`. |
| 9 | `app/api/pricing/[id]/lines/replace/route.ts` | Re-point POST replaceLines; RBAC via `getAgreementOwner`. Drop `supabaseService`. |
| 10 | `tests/unit/pricing-email.test.ts` | Update for the 2-arg signature; remove the fetch mock; pass recipients directly. |
| 11 | `lib/api/pricing/dto.test.ts` (or `tests/unit/...`) | **NEW.** Key-for-key tests of the dto translators. |
| 12 | `tests/unit/usecases/pricingActivationEmail.test.ts` | **NEW.** Use-case against Fake pricing + Fake users repos. |
| 13 | `tests/integration/api/pricing/*.test.ts` | **NEW.** The 5 routes against local Supabase — same JSON bytes. |

**🗣 In plain English:** Two brand-new helper files (a translator and a recipe), one wiring line, one signature change on the email file, the 5 route files re-plumbed, and the matching tests. No schema files, no new packages.

---

## 6. The activation email — Decision B (use-case). The most important design point.

Today the PATCH route, when status becomes `active`, does **two raw reads**: (a) a raw Supabase select to re-fetch the full agreement for the email body, and (b) `sendPricingEmail` internally does **another** raw HTTP fetch for recipients. PR2 removes **both** raw reads.

### 6.1 `lib/usecases/pricingActivationEmail.ts` (NEW) — modelled on `pickingList.ts`

```
deps: { pricing: PricingService; users: UsersRepository }   // the PORT for users, NOT usersService
```

One method:

```
resolveActivationEmail(id: string): Promise<{
  agreement: PriceAgreementWithLines;
  recipients: string[];
} | null>
```

Behaviour (exact):
1. `const agreement = await pricing.getAgreementForEmail(id)` — if `null`, **return `null`** (route skips email; preserves today's `if (full)` guard).
2. Recipients:
   ```
   const all = await users.listUsersByRoles(
     ['admin', 'sales', 'office'],
     { activeOnly: true, orderBy: [] },
   );
   const recipients = all
     .filter(u => u.email?.includes('@'))
     .map(u => u.email!);
   ```
   This reproduces the current raw query `users?active=eq.true&role=in.(admin,sales,office)&select=name,email` plus the existing `pricing-email.ts` lines 59-60 filter. Primary-role only (matches `listUsersByRoles`, which filters on `role`, matching today's `role=in.(...)`).
3. Return `{ agreement, recipients }`.

**⚠ ORDER DIVERGENCE — see Risk R3.** The raw fetch had **no `order` clause**; `listUsersByRoles` applies a default `order('name', asc)` when `orderBy` is empty (adapter line 146). The recipient *set* is identical, but the *order* of the `to[]` array may change. This is invisible in delivery (everyone in the array still receives it) but it is a real byte-level difference in the `to` array passed to the mailer. **Accepted micro-divergence — flagged in Risk R3, must be acknowledged in the PR description, not silently shipped.**

**🗣 In plain English:** The recipe asks the pricing box for the full agreement and the users box for "all active admin/sales/office people with a real email", then hands both back to the route. One subtlety: the users box always sorts people by name, but the old raw query didn't sort at all — so the same people get emailed, just possibly listed in a different order in the email's To line. Harmless, but I'm calling it out rather than hiding it.

### 6.2 Wiring (`lib/wiring/pricing.ts`)

Append (do **not** add a `pricingServiceForCaller`):
```ts
import { createPricingActivationEmail, type PricingActivationEmail } from "@/lib/usecases/pricingActivationEmail";
import { supabasePricingRepository, supabaseUsersRepository } from "@/lib/adapters/supabase";

export const pricingActivationEmail: PricingActivationEmail = createPricingActivationEmail({
  pricing: pricingService,
  users: supabaseUsersRepository,   // service-role singleton, already exported from the barrel
});
```
(`pricingService` is already defined above in this file.)

### 6.3 PATCH route (presentation)

On `data.status === 'active'`:
1. `const result = await pricingActivationEmail.resolveActivationEmail(id)`
2. If `result !== null`: map `result.agreement` (domain `PriceAgreementWithLines`) → `PricingEmailData` via the **dto helper** (§7.3), then:
   ```ts
   await sendPricingEmail(emailData, result.recipients)
     .catch(err => console.error('[pricing PATCH] email error:', err))
   ```
   Keep **awaited + `.catch`** exactly (PATCH still returns success on email failure).
3. Preserve the surrounding `try/catch` that logs `'[pricing PATCH] failed to fetch full agreement for email:'` — the use-case can throw `ServiceError` on a DB failure during the re-fetch/recipient read, and today that path is swallowed by the outer try/catch. Keep that outer try/catch wrapping the use-case call so a thrown error logs the same line and the PATCH still returns success.

**🗣 In plain English:** When an agreement is switched to "active", the route runs the recipe, translates the result into the email's expected shape, and sends — never letting an email problem fail the save. The existing safety-net logging stays exactly where it is.

### 6.4 `lib/pricing-email.ts` signature change

- `export async function sendPricingEmail(data: PricingEmailData, recipients: string[]): Promise<void>`
- **Delete** the raw `fetch` block (lines ~50-60) **and** the now-unused `SUPA_URL` / `SUPA_KEY` consts (lines 15-16). Keep `RESEND_KEY`, `APP_URL`, `FROM`, `LOGO_SRC`, the HTML builder — **all untouched**.
- **Keep both skip-guards INSIDE the function, in the SAME order, with verbatim log lines:**
  1. `if (!RESEND_KEY) { console.log('[pricing-email] RESEND_API_KEY not set — skipping'); return }`
  2. `if (!recipients.length) { console.log('[pricing-email] no recipients with email — skipping'); return }`
- The `console.log('[pricing-email] sent ...', result.id)` success line stays verbatim.

**🗣 In plain English:** The email file stops fetching its own recipient list — the recipe hands it the list now. The two "skip quietly" messages stay word-for-word and in the same order, and the email's HTML body is not touched at all.

---

## 7. Per-route re-point steps with exact domain→snake_case mapping

The domain types are camelCase (`lib/domain/Pricing.ts`); the wire is snake_case. Below is the field-for-field map. Put the agreement/line translators in `lib/api/pricing/dto.ts` (mirrors `lib/api/orders/dto.ts`).

### 7.1 Agreement header → wire (`toAgreementWireDto(a: PriceAgreement)`)

| Wire (snake_case) | Domain (camelCase) | Note |
|---|---|---|
| `id` | `a.id` | |
| `reference_number` | `a.referenceNumber` | |
| `status` | `a.status` | |
| `is_expired` | `a.isExpired` | **Computed in the ADAPTER already** (PR1) — domain carries it. Do NOT recompute with `londonToday()` in the route. |
| `valid_from` | `a.validFrom` | |
| `valid_until` | `a.validUntil` | |
| `notes` | `a.notes` | |
| `created_at` | `a.createdAt` | |
| `updated_at` | `a.updatedAt` | |
| `customer_id` | `a.customerId` | |
| `customer_name` | `a.customerName` | Domain already applies `customer.name ?? prospectName ?? 'Unknown'`. |
| `is_prospect` | `a.isProspect` | Domain = `!customerId`. |
| `rep_id` | `a.repId` | |
| `rep_name` | `a.repName` | Domain already applies `?? 'Unknown'`. |
| `lines` | `a.lines.map(toLineWireDto)` | Only on the WithLines shapes (GET single / GET list). |

### 7.2 Line → wire (`toLineWireDto(l: PriceLine)`)

| Wire | Domain | Note |
|---|---|---|
| `id` | `l.id` | |
| `product_id` | `l.productId` | |
| `product_name_override` | `l.productNameOverride` | |
| `product_name` | `l.productName` | Domain = `product.name ?? override ?? 'Unknown'`. |
| `box_size` | `l.boxSize` | |
| `code` | `l.code` | |
| `price` | `l.price` | Already `Number(...)` in the adapter. |
| `unit` | `l.unit` | |
| `notes` | `l.notes` | |
| `position` | `l.position` | |
| `is_freetext` | `l.isFreetext` | Domain = `!productId`. **NB the old GET routes used `!l.product_id`; the activation-email DTO used `!product.name`.** See §7.3 — these are NOT the same source and must stay distinct. |

> **Field-order note:** `NextResponse.json` serialises object keys in insertion order. The wire bytes include key order. Reproduce the **exact key order** of each current response object (see each route's literal). The dto translators must list keys in the same order the routes use today.

### 7.3 Email DTO mapping (PATCH route, domain `PriceAgreementWithLines` → `PricingEmailData`)

`PricingEmailData` (snake_case, defined in `lib/pricing-email.ts`) maps from the domain aggregate:

| `PricingEmailData` field | Source (domain) | Note |
|---|---|---|
| `id` | `agreement.id` | |
| `reference_number` | `agreement.referenceNumber` | |
| `customer_name` | `agreement.customerName` | Domain already `?? prospectName ?? 'Unknown'`. |
| `is_prospect` | `agreement.isProspect` | `!customerId`. |
| `rep_name` | `agreement.repName` | `?? 'Unknown'`. |
| `valid_from` | `agreement.validFrom` | |
| `valid_until` | `agreement.validUntil` (`?? null`) | |
| `notes` | `agreement.notes` (`?? null`) | |
| `lines[].product_name` | `line.productName` | |
| `lines[].box_size` | `line.boxSize` | |
| `lines[].price` | `line.price` | |
| `lines[].unit` | `line.unit` | |
| `lines[].notes` | `line.notes` (`?? null`) | |
| `lines[].is_freetext` | **see ⚠ below** | |

**⚠ `is_freetext` discrepancy in today's email path.** The current email mapping (route lines 154-162) computes `is_freetext: !((l.product as ...).name)` — i.e. "no joined product *name*", whereas the GET routes and the domain `PriceLine.isFreetext` use `!productId`. For a line with a `product_id` whose joined product row resolves a name, both are identical. They diverge only in the pathological case where a line has a `product_id` but the product join returns no name (orphaned/null-name product). **Decision: map the email DTO's `is_freetext` from the domain `line.isFreetext` (`!productId`).** This is byte-identical in every realistic case and is the more correct value; the divergent case is a data-integrity anomaly that does not occur in prod. **Flagged as accepted micro-divergence — Risk R4.** If the conductor wants strict byte-identity even in the anomaly case, the use-case/DTO would need to carry a separate `hasProductName` boolean — **STOP and ask before adding that**; I recommend the domain value.

**🗣 In plain English:** One tiny wrinkle: the old email code decided "is this a free-text line?" by checking whether the product has a name, while everywhere else the app checks whether the line has a product id at all. These only differ for a broken product record that doesn't exist in real data. I'm using the consistent app-wide definition and flagging it; if you want me to exactly reproduce the old quirky check, say so and I'll add a field — but I don't recommend it.

### 7.4 Route-by-route

**`app/api/pricing/route.ts`**
- GET: auth check unchanged → `const agreements = await pricingService.listAgreements({})` → `agreements.map(toAgreementWireDto)` → `NextResponse.json({ agreements })`. Drop `londonToday`/`supabaseService` imports. (Domain carries `isExpired` + `lines` already sorted by the adapter.)
- POST: validation unchanged (`customer_id`/`prospect_name`, `valid_from`) → build `CreateAgreementInput` (camelCase: `customerId: body.customer_id || null`, `prospectName: body.prospect_name || null`, `agreedBy: userId`, `validFrom`, `validUntil: body.valid_until || null`, `notes: body.notes || null`, `lines: (body.lines ?? []).map(...)` to `CreateLineInput`). The adapter already filters invalid lines + sets status `draft` + does the header-survives-line-failure semantics (port header §createAgreement). → `const created = await pricingService.createAgreement(input)` → `NextResponse.json({ id: created.id, reference_number: created.referenceNumber }, { status: 201 })`. Preserve the `console.log('[pricing POST] created ${ref} by user ${userId}')` line — use `created.referenceNumber`.
  - **Verify in PR1 review:** the line-mapping (`l.price`, `l.product_id || null`, `l.unit ?? 'per_kg'`, `l.position ?? i`) and the invalid-line filter (`price <= 0`, neither productId nor trimmed override) live in the adapter's `createAgreement` per the port doc. The route only translates body→`CreateAgreementInput`. Confirm against `lib/adapters/supabase/PricingRepository.ts` during implementation (read it first).

**`app/api/pricing/[id]/route.ts`**
- GET: `const a = await pricingService.getAgreementById(id)` → `if (!a) return 404 { error: 'Not found' }` → `NextResponse.json(toAgreementWireDto(a))`. Drop `londonToday`.
- PATCH: auth + status validation unchanged. RBAC: for non-manager (`role !== 'office' && role !== 'admin'`), `const owner = await pricingService.getAgreementOwner(id)` → `if (!owner || owner.agreedBy !== userId) return 403 { error: 'Not authorised to edit this agreement' }`. Build `UpdateAgreementInput` from the 6 fields with the same `'' → null` normalisation (keep that in the route). `const patched = await pricingService.updateAgreement(id, patch)` → `if (!patched) return 500 { error: 'Update failed' }` (today's `error || !data` → 500). Log `'[pricing PATCH] ${patched.referenceNumber} → ${patched.status}'`. The success body is `NextResponse.json({ id, reference_number, status, updated_at })` mapped from `PatchedAgreement` (`id`, `referenceNumber`→`reference_number`, `status`, `updatedAt`→`updated_at`) — **reproduce the exact 4-key object in the same order**. Then the activation-email block (§6.3).
- DELETE: RBAC needs **both** owner and status → `const owner = await pricingService.getAgreementOwner(id)` (returns `{ agreedBy, status }`) → `if (!owner) return 404 { error: 'Not found' }`. `const isAdmin = role === 'admin'; const isOwner = owner.agreedBy === userId;` → `if (!isAdmin && (!isOwner || owner.status !== 'draft')) return 403 {...verbatim msg...}`. → `await pricingService.deleteAgreement(id)` (idempotent, void). Log line: today logs `agreement.reference_number`. **`getAgreementOwner` returns only `{ agreedBy, status }` — NO `referenceNumber`.** See Risk R5: the DELETE log line currently prints the reference number. Options: (a) accept a changed log line (`deleted by ${userId}` without ref), or (b) read the reference via `getAgreementById` first. **Recommend (a)** — it is a log-only, non-wire change, but it is a deviation from "byte-identical log lines". **STOP/flag to conductor: do you accept the DELETE log line dropping the reference number, or should the route call `getAgreementById` (one extra read) to preserve it?** Do not improvise — default to flagging.

**`app/api/pricing/[id]/lines/route.ts`** (POST addLine)
- auth + body validation unchanged. RBAC (non-manager): `const owner = await pricingService.getAgreementOwner(agreementId)` → `if (!owner || owner.agreedBy !== userId) return 403 { error: 'Not authorised' }`. Build `CreateLineInput` (camelCase). `const line = await pricingService.addLine(agreementId, input)` (adapter computes next position — port §addLine). → `NextResponse.json(toLineWireDto(line), { status: 201 })`. Preserve the `'[pricing lines POST]'` error log only on the catch/throw path (the service throws `ServiceError` on DB failure; wrap to keep the 500 + log — see §7.5).

**`app/api/pricing/lines/[lineId]/route.ts`** (PATCH/DELETE)
- `checkAccess`: for non-manager, `const owner = await pricingService.getLineOwner(lineId)` → `return owner !== null && owner.agreedBy === userId`. Manager → true.
- PATCH: auth → access → body validation (`price` must be number > 0) → build `UpdateLineInput` (camelCase, `'' → null` kept in route) → `const line = await pricingService.updateLine(lineId, patch)` → `if (!line) return 500 { error: 'Update failed' }` → `NextResponse.json(toLineWireDto(line))`.
- DELETE: auth → access → `await pricingService.deleteLine(lineId)` (idempotent) → `NextResponse.json({ deleted: true })`.

**`app/api/pricing/[id]/lines/replace/route.ts`** (POST replaceLines)
- auth + per-line validation unchanged. RBAC (non-manager) via `getAgreementOwner` (as addLine). Build `readonly CreateLineInput[]` (camelCase; `position: l.position ?? i` — confirm whether the adapter's `replaceLines` defaults position-to-index per the port §replaceLines; if it does, pass `l.position ?? null` and let the adapter default — **read `lib/adapters/supabase/PricingRepository.ts` `replaceLines` to confirm which layer owns the `?? i` default and reproduce today's `l.position ?? i` exactly**). `const count = await pricingService.replaceLines(agreementId, lines)` → `NextResponse.json({ replaced: true, count: body.lines.length })`. **NB:** today the response uses `body.lines.length`, NOT the RPC's returned count. The service returns the written count; **keep the response as `body.lines.length` to stay byte-identical** (they should be equal, but the spec says preserve bytes — use the body length the route used).

### 7.5 Error-path / 500 handling (uniform across all 5 routes)

Today each route inspects `{ data, error }` and returns a 500 with a specific message + a specific `console.error` line on the DB-error branch. The PR1 service/adapter instead **throws `ServiceError`** on DB failure (port doc: "every DB failure throws ServiceError"). To preserve the exact 500 bodies + error log lines, **wrap each service write/read call in a try/catch** that reproduces today's `console.error('[pricing ...]', err...)` + the matching 500 JSON. Per route the messages are:
- GET list: `'[pricing GET]'` → 500 `{ error: 'Failed to load' }`
- POST create: `'[pricing POST] agreement insert:'` → 500 `{ error: 'Failed to create agreement' }`
- PATCH: `'[pricing PATCH]'` → 500 `{ error: 'Update failed' }`
- DELETE: `'[pricing DELETE]'` → 500 `{ error: 'Delete failed' }`
- lines POST: `'[pricing lines POST]'` → 500 `{ error: 'Failed to add line' }`
- lines PATCH: `'[pricing lines PATCH]'` → 500 `{ error: 'Update failed' }`
- lines DELETE: `'[pricing lines DELETE]'` → 500 `{ error: 'Delete failed' }`
- replace: `'[pricing lines replace]'` → 500 `{ error: 'Failed to replace lines' }`

The RBAC pre-check reads (`getAgreementOwner`/`getLineOwner`) currently swallow errors (no error inspection — `const { data: own } = ...`). A thrown `ServiceError` there would now bubble. **Wrap those too** so a thrown error reproduces today's behaviour (today: a DB error on the owner pre-check returned `null` data → treated as "not found/not owner" → 403). To match: catch around the owner read and treat a thrown error as `owner = null`. **Flag R6 — confirm the conductor is OK reproducing the swallow** (it preserves byte-identical behaviour but propagates a latent bug; today's code also swallows it).

**🗣 In plain English:** The old routes checked an error flag and returned a tidy 500 message. The new boxes throw instead of returning a flag, so each route wraps the call and turns a thrown error back into the same 500 message and log line. There's also a quirk where the old ownership check silently treats a database hiccup as "not your record" (a 403); to stay identical I reproduce that swallow and flag it.

---

## 8. Ordered atomic commits (TDD red-green where tests change)

1. **`feat(pricing): domain→wire DTO translators (lib/api/pricing/dto.ts)`**
   - RED: add `lib/api/pricing/dto.test.ts` — key-for-key + key-order assertions for `toAgreementWireDto`, `toLineWireDto`, `toPricingEmailData`.
   - GREEN: implement the pure translators. No route touched yet.
2. **`feat(pricing): pricingActivationEmail use-case (pricing + users ports)`**
   - RED: `tests/unit/usecases/pricingActivationEmail.test.ts` against Fake pricing + Fake users repos — null-agreement→null, recipient filter (email with `@` only), set correctness.
   - GREEN: implement `lib/usecases/pricingActivationEmail.ts` + wire `pricingActivationEmail` in `lib/wiring/pricing.ts`.
3. **`refactor(pricing-email): sendPricingEmail takes recipients; drop raw fetch`**
   - RED: update `tests/unit/pricing-email.test.ts` to the 2-arg signature, remove the fetch mock, pass recipients directly; the two skip-guard tests pass recipients/empty arrays.
   - GREEN: change the signature, delete the fetch block + `SUPA_URL`/`SUPA_KEY`, keep guards in order. (Module still compiles; no consumer updated yet — but the PATCH route still imports the 1-arg form, so this commit must update the PATCH route call too, OR sequence 3+4 together. **Sequence: do commit 4's PATCH change in the same commit as 3** to keep the tree compiling.)
4. **`feat(pricing): re-point [id] route (GET/PATCH/DELETE) through pricingService + use-case`**
   - Re-point GET/PATCH/DELETE; PATCH uses the use-case + `toPricingEmailData` + `sendPricingEmail(data, recipients)`. Drop `supabaseService`/`londonToday`. (Folded with commit 3's signature change so the tree compiles.)
5. **`feat(pricing): re-point list route (GET/POST) through pricingService`**
6. **`feat(pricing): re-point line routes (add/update/delete/replace) through pricingService`**
   - `[id]/lines` POST, `lines/[lineId]` PATCH/DELETE, `[id]/lines/replace` POST.
7. **`test(pricing): integration suite for the 5 re-pointed routes (byte-identical JSON)`**
   - `tests/integration/api/pricing/*.test.ts` against local Supabase.

> Commits 5 and 6 can be split further per file if the diff is large; keep each independently green.

**🗣 In plain English:** Build the two helpers first with their tests (red then green), change the email file together with the route that calls it so the project always compiles, then re-plumb each route, then add the database-backed integration tests last. Each commit leaves the tree green.

---

## 9. Test matrix

| Layer | What | New / changed |
|---|---|---|
| **Unit — dto** | `toAgreementWireDto`, `toLineWireDto`, `toPricingEmailData` — key-for-key + **key order** | NEW `lib/api/pricing/dto.test.ts` |
| **Unit — use-case** | `resolveActivationEmail` against Fake pricing + Fake users: null agreement→null; email filter keeps only `@` addresses; primary-role set | NEW `tests/unit/usecases/pricingActivationEmail.test.ts` |
| **Unit — email** | `sendPricingEmail(data, recipients)` 2-arg; no-key skip; empty-recipients skip; mailer called with exact `{from,to,subject,html}` | CHANGED `tests/unit/pricing-email.test.ts` (drop fetch mock) |
| **Unit — service** | unchanged; PR1 `PricingService.test.ts` stays green | none |
| **Integration** | the 5 routes against local Supabase — assert the **same JSON** (response shape + status codes) for GET list, GET single (+404), POST create (201), PATCH (incl. activation triggers email send via Fake mailer / spy), DELETE (+404/403), addLine (201), updateLine, deleteLine, replaceLines, plus RBAC 403 paths | NEW `tests/integration/api/pricing/*.test.ts` |
| **pgTAP / DB** | **none** — no migration, no policy change | none |
| **E2E `@critical`** | **unaffected** — the `@critical` specs are orders / KDS / routes-planner / map only (`tests/e2e/01..06`); pricing is not in the `@critical` order pipeline. Confirmed by grep: no `@critical` pricing spec exists. | none |

> **Integration note on the email side-effect:** the integration runner boots a real dev server wired to local Supabase. To assert the activation email without sending real mail, rely on the existing mailer wiring's local/no-key behaviour — with `RESEND_API_KEY` unset locally, `sendPricingEmail` hits the first skip-guard and logs `'[pricing-email] RESEND_API_KEY not set — skipping'` (note the **accepted extra recipients read** that now runs first — §6.4 / R7). The unit use-case test is the real coverage for recipient resolution; the integration PATCH test asserts the route still returns its success body when activating.

**🗣 In plain English:** Three unit test files (translators, recipe, email) and one integration suite hitting the real local database to prove the JSON is unchanged. No database-policy tests and no browser end-to-end tests are needed — the pricing screens aren't part of the critical end-to-end path.

---

## 10. Rollback (code-only — NO `.sql`)

Pure code change, no schema/data migration, so rollback is `git revert` of the PR (or the offending commit). No DB rollback step. If a single route misbehaves in prod, that route file alone can be reverted to its `supabaseService` form independently (the commits are per-route). The `pricing-email.ts` signature change and the use-case/wiring are only consumed by the PATCH route, so reverting the PATCH route + the email signature commit together fully restores the old email path.

**🗣 In plain English:** Because nothing touches the database structure, undoing this is just reverting the code commits — no data to migrate back. Each route can be rolled back on its own.

---

## 11. Hexagonal / depth check (Gate 2 facts)

- **Port used:** `PricingRepository` (PR1) + `UsersRepository` (F-13). **No new port. No new port method.** Every route maps to an existing `PricingService` method; the use-case uses the existing `UsersRepository.listUsersByRoles`.
- **Adapter:** existing `lib/adapters/supabase/PricingRepository.ts` + `lib/adapters/supabase/UsersRepository.ts`. **No new adapter.**
- **New dependency:** **none.** `package.json` untouched.
- **New wrapper for a single-use vendor:** N/A — no new vendor.
- **Vendor leak check:** all 5 routes **drop** their `@supabase/*` (`supabaseService`) imports; `lib/pricing-email.ts` **drops** its raw `fetch`-to-Supabase. After PR2 the only Supabase imports in the pricing surface live in `lib/adapters/supabase/*` (correct) — rip-out **improves**.
- **Rip-out test:** "replace the DB vendor for pricing tomorrow" = one new `lib/adapters/<vendor>/PricingRepository.ts` + one edit to `lib/wiring/pricing.ts`. Routes + use-case + email file all depend on ports/services only. **PASS.**
- **Use-case depth (not a thin pass-through):** `pricingActivationEmail` (a) composes **two** domains (pricing + users), (b) owns the recipient filter (`email?.includes('@')` + map to `string[]`), (c) the route does real DTO mapping (domain→`PricingEmailData`). Deletion test: delete it and the recipient-filtering + two-domain composition logic must move into the route (which ADR-0002 forbids — a route can't compose two services, and a service can't import another service). It earns its keep. **PASS.**

**Hexagonal verdict line:**
> **Port:** uses existing `PricingRepository` + `UsersRepository` (no new port, no new method). **Adapter:** existing Supabase adapters (no new adapter). **New deps:** none. **Rip-out test: PASS** (vendor swap = one adapter + one wiring line; routes/use-case/email depend on ports only, and 5 routes + the email file shed their direct Supabase imports — coupling improves). **Use-case is not a pass-through (PASS):** composes two domains + owns the recipient filter.

**🗣 In plain English:** No new sockets, no new plugs, no new libraries. After this PR, a database swap for pricing still costs one adapter + one wiring line, and we actually *reduce* coupling because six files stop touching the database directly. The new recipe is genuine glue, not dead weight.

---

## 12. Risk Assessment

### Concurrency / race conditions
- **R1 — agreement vanishes between PATCH update and email re-fetch.** Severity: low. The use-case `getAgreementForEmail(id)` returns `null` and the route skips the email (preserves today's `if (full)` guard). Mitigation: explicit null-handling in §6.1/§6.3. **Must-fix: no** (behaviour preserved).
- No new locking, no new transaction. `replaceLines` keeps the existing atomic RPC (PR1). **No material new concurrency risk introduced.**

### Security
- **No auth/RLS change** — PR2 stays on service-role singletons (per spec). RBAC pre-checks are reproduced byte-identically via `getAgreementOwner`/`getLineOwner`. No privilege change. **No material security risk introduced.**
- Credential-hash quarantine respected: the use-case reads `UserSummary` (no hash field) via `listUsersByRoles` — a hash leak is a compile error by construction. ✓

### Data migration
- **None.** No schema/data change. **No risk in this category.**

### Business-logic flaws (the main risk surface — wire byte-identity)
- **R2 — camelCase↔snake_case drift across 5 routes.** Severity: **high** (primary risk). A mis-mapped or mis-ordered key changes the wire bytes the screens read. Mitigation: the §7 field tables, key-order discipline, the `dto.test.ts` key-for-key tests, and the integration suite asserting same JSON. **Must-fix: yes — the dto tests + integration JSON assertions are the gate.** (Met by the plan; flagged so the implementer cannot skip them.)
- **R3 — recipient `to[]` ordering change.** Severity: low. The raw fetch had no `order`; `listUsersByRoles` sorts by name. Same recipient *set*, possibly different array order. Invisible to delivery. **Accepted micro-divergence — must be noted in the PR description.** **Must-fix: no.**
- **R4 — `is_freetext` definition in the email DTO.** Severity: low. Old email path used `!product.name`; everywhere else `!productId`. Identical except for an orphaned-product anomaly that doesn't occur in prod. Plan uses the domain value (`!productId`). **Accepted micro-divergence — flagged; STOP and ask if strict byte-identity in the anomaly case is required.** **Must-fix: no (recommend domain value).**
- **R5 — DELETE log line loses the reference number.** Severity: low (log-only, not wire). `getAgreementOwner` returns `{ agreedBy, status }`, no `referenceNumber`; today's `[pricing DELETE]` log prints the ref. **FLAG to conductor:** accept the log-only deviation, or add a `getAgreementById` read to preserve it? Default = flag, do not improvise. **Must-fix: no (but requires a conductor decision).**
- **R6 — RBAC owner-read error swallow.** Severity: low. Today a DB error on the owner pre-check yields `null` → 403. The new service throws `ServiceError`; the plan wraps the call to reproduce the swallow (→ treat as `null`). Preserves byte-identical behaviour but carries a latent pre-existing bug forward. **Must-fix: no (preserves current behaviour; flagged).**
- **R7 — extra recipients read when `RESEND_API_KEY` is unset.** Severity: negligible. The use-case resolves recipients *before* `sendPricingEmail` checks the key, so when the key is unset one harmless extra users read runs (never observable; prod always has the key). **Accepted per spec — do not optimise away.** **Must-fix: no.**

### Launch blockers
- **None new.** No migration to apply, no preview-branch resync risk, no `@critical` E2E impact (pricing not in that suite). The byte-identity risk (R2) is the gate to satisfy in review/ANVIL, not a launch-infra blocker.

### Risk headline
**No must-fix risks block Gate 2 on the architecture.** The one mandatory-discipline item is **R2 (wire byte-identity)**, fully covered by the planned dto key-for-key tests + integration JSON assertions — this is a *test-coverage* must-do, not an unresolved design blocker. **Three items need a conductor decision before/at implementation (not blockers, but do not improvise): R4 (`is_freetext` definition), R5 (DELETE log reference number), R6 (owner-read error swallow).** Recommended defaults are stated for each.

**🗣 In plain English:** Nothing here blocks the plan. The big thing to get right is that every route's JSON stays identical — and the plan pins that with strict tests. Three small judgement calls (a quirky free-text check, a log line that loses a reference number, and a swallowed error) need your yes/no; I've recommended the safe default for each and told the implementer not to guess.

---

## 13. Open questions for the conductor (do not improvise — answer before/at implementation)

1. **R5:** DELETE log line — accept dropping the reference number (log-only), or add one extra `getAgreementById` read to preserve `[pricing DELETE] ${ref} deleted by ${userId}`? *(Recommend: accept the log-only change.)*
2. **R4:** Email `is_freetext` — use the domain `!productId` (recommended, consistent), or add a `hasProductName` field to reproduce the old `!product.name` quirk byte-for-byte in the anomaly case? *(Recommend: domain value.)*
3. **R6:** Confirm reproducing the RBAC owner-read error-swallow (DB error → treated as not-owner → 403) is acceptable, matching today's behaviour. *(Recommend: yes, preserves byte-identity.)*

These are the only spec gaps. Everything else is fully specified.
