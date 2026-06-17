# ANVIL Clearance Certificate

Date: 2026-06-17
App: MFS-Operations
Branch: feat/f-11-mailer-port
PR: #48 — feat: Mailer port + Resend adapter (F-11) — https://github.com/kilichakan2/MFS-Operations/pull/48

## Scope — what this certificate actually covers

F-11 puts the Resend email SDK behind an app-owned `Mailer` port and re-points the three
email helpers to send through it. SEND-ONLY: recipient-fetch and email HTML are untouched.

| Change / path | Risk tier | Layers required | Layers run |
| ------------- | --------- | --------------- | ---------- |
| `lib/ports/Mailer.ts` (new port) | Med (seam) | Unit + architecture rung | Unit ✓ + arch rung ✓ |
| `lib/adapters/resend/Mailer.ts` (sole `resend` importer) | Med | Unit (SDK mocked) | Unit ✓ (4 cases) |
| `lib/adapters/fake/Mailer.ts` (in-memory fake) | Low | Unit | Unit ✓ (4 cases) |
| `lib/wiring/mailer.ts` (composition root) | Low | Unit | Unit ✓ |
| `lib/{compliment,complaint,pricing}-email.ts` (re-pointed helpers) | Med | Unit + Integration | Unit ✓ + Integration ✓ |
| `.eslintrc.json` + `tests/unit/lint/no-adapter-imports.test.ts` (lint pin) | Low | Unit | Unit ✓ |

**Not run under the efficiency dial:** Remote preview smoke (Vercel preview + Supabase preview
branch) is deliberately deferred to the conductor at Ship — the runner confirmed local
`@critical` green; the conductor runs the preview smoke before promotion. No layer was skipped
behind Hakan's back; this matches the approved matrix.
**Baseline characterisation pass?** No — this is a diff-driven pass on the F-11 change.

## Architecture rung (change crosses a seam — applied)

- Touched port (`Mailer`) has a domain-only path proven on the **in-memory Fake** and on a
  `vi.mock`-ed wiring singleton — no real DB, no network, no vendor SDK in those tests.
- `resend` is imported in **exactly one** file (`lib/adapters/resend/Mailer.ts`) — the sole
  importer, enforced by the `no-restricted-imports` rule in `.eslintrc.json` and pinned by
  `tests/unit/lint/no-adapter-imports.test.ts`.
- Vendor types (`CreateEmailResponse`, `ErrorResponse`) never cross the boundary — the adapter
  maps Resend's `{ data, error }` to the owned `SendResult`.
- No vendor SDK is imported in any domain/port/helper test. In `resend/Mailer.test.ts` the SDK
  is mocked (`vi.mock("resend", …)`) — no client constructed, no network, no key, no cost.
- **Rip-out test:** swapping the email vendor = one new `lib/adapters/<vendor>/` folder + one
  edit to `lib/wiring/mailer.ts`. Helpers, port, routes, UI unchanged. ✅ holds.

🗣 In plain English: the wall around Resend is real — the app's core only knows its own email
shapes, Resend's name appears in exactly one file, and the tests prove the engine runs on a
stand-in plug. Swapping email providers later touches two files, nothing else.

## Test Results

| Layer | Status | Notes |
| ----- | ------ | ----- |
| Typecheck (`tsc --noEmit`) | ✅ pass | exit 0 |
| Unit (Vitest) | ✅ 1758/1758 passed | 99 files; incl. Fake (4), Resend adapter (SDK mocked), wiring, 3 helper send-path tests, lint pin |
| Integration (Vitest) | ✅ 182/182 passed | 17 files, real local Supabase; `RESEND_API_KEY` absent from the harness → mailer skips; **no real email sent** |
| Database (pgTAP) | n/a — not required | No migration, no schema change, no RLS/policy change in this diff |
| Edge Functions (Deno) | n/a — not required | None touched |
| E2E (Playwright) — local `@critical` | ✅ api 3/3 · ui 1/1 | Order/picking/KDS critical flows; none trigger email (expected) |
| E2E — remote preview smoke (Playwright) | ✅ 8/8 @critical | Ran via `npm run test:e2e:preview -- <url> --unprotected` against branch-tip build `dpl_H1kGy1mmXVixfc7KtdkVZQihtAjr` (commit `157dccc`, READY). order-place 2 · picking-list-print 3 · kds-butcher 3, all green (43.0s). `previewProbe` passed 4/4 DB identity checks — the deployment reads a seed-born preview DB. |

**Preview smoke — protection-off mode (resolved):** Vercel Deployment Protection is OFF (F-INFRA-02), so the "Protection Bypass for Automation" key cannot be generated (greyed out — nothing to bypass). The smoke harness already handles this: the `--unprotected` flag (built with F-INFRA-02, tracked as BACKLOG F-INFRA-04) skips ONLY the bypass-secret requirement and the bypass header, while every other guard (https-only, preview-hostname match, refuse-production, refuse-prod-Supabase-ref) still applies. The full Playwright `@critical` suite ran green this way — no skip, no substitution.

## No-real-email confirmation

- The integration harness sources `.env.test.local` (local Supabase only — production-safety
  guard asserted) and injects **zero** `RESEND_API_KEY`. Each email helper hits its own
  `if (!RESEND_KEY) … return` skip guard before any recipient fetch or `mailer.send` call; the
  adapter's missing-key guard (D2) is belt-and-braces behind it. The mailer is structurally
  unkeyed across every non-unit layer → it cannot reach the network.
- Unit tests that exercise the Resend adapter mock the SDK (`vi.mock("resend")`) — no client
  constructed, no key, no cost.
- Net: real Resend was never hit in any layer. ✅

🗣 In plain English: with no email key set anywhere in the tests, the send code takes the
"skip" branch and stops — no email left the building, no money spent, and the safety check
proved it.

## Behaviour-change confirmation

Pure relocation: the value Resend sees (`from`, `to`, `subject`, `html`) and the id returned
are byte-for-byte identical to the pre-F-11 inline send. Helpers keep their FROM constant,
recipient fetch, HTML builders and console.log lines; only the send call now routes through the
port. The `result.id` read maps the owned `SendResult` (flatter shape, same id value).

## Warnings (non-blocking)

None.

## Migration

None. F-11 is code-only — no schema change, no migration file.
Rollback script: n/a (no migration). **Rollback path = revert PR #48** (Vercel auto-redeploys
the prior build). No data-recovery concern, no PITR concern.

## Merge Sequence

1. (No migration — skip the `supabase db push` step.)
2. Merge PR #48 → Vercel auto-deploys.
3. Pre-ship smoke: remote Playwright `@critical` preview smoke ran GREEN (8/8) via the
   `--unprotected` mode against the READY branch-tip preview. See Test Results.
4. Post-deploy PRODUCTION smoke runs against the live prod URL (not behind protection → needs no
   bypass key) as the real safety net; rollback = revert PR #48 if any route 5xx's.

## Verdict

✅ CLEARED FOR PRODUCTION — **SHIPPED 2026-06-17**

Zero blockers, zero warnings, zero real-code bugs. No eject to FORGE. No iteration needed
(all layers green on first pass).

**Ship record:** PR #48 squash-merged to main (`e46ed6f`). No migration (skipped db push).
Production deploy `dpl_G1QDSA7M4zn77S9RKTnRgGADPqAR` (commit `e46ed6f`) state READY.
Post-deploy PRODUCTION smoke on `https://www.mfsops.com`: 5/5 non-5xx (`/login` 200; `/`,
`/api/reference`, `/api/compliments`, `/api/screen2/note` → app `/login` 307) — **0×5xx**, both
email-triggering routes healthy. Feature branch `feat/f-11-mailer-port` deleted both sides.
