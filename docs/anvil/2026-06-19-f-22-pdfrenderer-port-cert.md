# ANVIL Clearance Certificate (DRAFT)

Date: 2026-06-19
App: MFS Operations
Branch: feat/f-22-pdfrenderer-port
PR: #57

## Scope — what this certificate actually covers

| Change / path                       | Risk tier | Layers required             | Layers run                          |
| ----------------------------------- | --------- | --------------------------- | ----------------------------------- |
| lib/ports/PdfRenderer.ts (new port) | Low–Med   | Unit (wiring) + E2E         | Unit ✓ + E2E ✓                      |
| lib/adapters/jspdf/* (new adapter)  | Low–Med   | E2E (browser-only routine)  | E2E ✓ (real Chromium download)      |
| lib/wiring/pdf.ts (composition)     | Low       | Unit (wiring)               | Unit ✓ (tests/unit/wiring/pdf.test) |
| .eslintrc.json (jspdf import ban)   | Low       | Unit (lint pin)             | Unit ✓ (no-adapter-imports.test)    |
| app/pricing/page.tsx (re-point)     | Med       | Integration regression + E2E| Integration ✓ + E2E ✓               |

**Not run under the efficiency dial:** Full E2E suite re-run on a Vercel preview was
NOT run by the runner — this is a low/med-risk, client-side-only extraction (no auth,
no payments, no migration, no RLS, no DB). Docker (local Supabase) proved correctness;
the conductor may still run the `@critical` preview smoke at Gate 4 per house process.
**Baseline characterisation pass?** No — diff-driven matrix.

🗣 This cert covers a code-only move of the PDF routine behind an owned port. It does NOT
touch the database, auth, or money — so the heavy preview double-run was not warranted.

## Test Results

| Layer                 | Status         | Notes                                                              |
| --------------------- | -------------- | ----------------------------------------------------------------- |
| Unit (Vitest)         | ✅ 1925/1925   | Full suite, 109 files. Incl. wiring/pdf.test (3) + no-adapter-imports lint pin (static+dynamic jspdf ban). |
| Integration (Vitest)  | ✅ 49/49       | Regression only — pricing route (`pricing.test.ts`) + `adapters/supabase/PricingRepository.test.ts` against local Supabase (Docker). No route logic changed; clean. stderr lines are intentional CHECK-constraint rejection assertions, not failures. |
| Database (pgTAP)      | n/a — not required | No migration, no policy change, no schema touch.              |
| Edge Functions (Deno) | n/a — not required | No edge function touched.                                     |
| E2E (Playwright)      | ✅ 2/2         | `tests/e2e/07-pricing-export-pdf.spec.ts`, chromium, real download events. |

### Architecture rung (seam crossed — new port + adapter)

✅ The PdfRenderer port is pure TypeScript (no jsPDF, no DOM types). The jsPDF adapter is
the only place `jspdf` / `jspdf-autotable` are imported, enforced by the ESLint static
no-restricted-imports ban AND the dynamic no-restricted-syntax ban — both pinned by
`tests/unit/lint/no-adapter-imports.test.ts` (green). The page imports the `pdfRenderer`
singleton from `lib/wiring/pdf.ts` only — never the adapter. No vendor import leaks past
the adapter boundary. Rip-out contract holds: swap the PDF lib = one new adapter folder +
one edit to `lib/wiring/pdf.ts`. (No domain-only fake-adapter suite applies — the port's
single operation is a browser-side render+download with no domain logic to fake; F-TD-26
defers the Blob-returning split that would make it headless-byte-assertable.)

## Byte-identity evidence

F-22 is asserted byte-identical (same PDF, same filename, jsPDF still lazy-loaded only on
Export click). The runner proved:

- **Filename contract** `MFS-Pricing-{ref}-{customer}.pdf` — asserted via
  `download.suggestedFilename()` matching `/^MFS-Pricing-.+\.pdf$/`, AND containing the
  agreement's real reference_number AND the sanitised customer segment, for BOTH render paths.
- **Tricky render variations exercised** (so identity is tested, not just "a download
  happened"): long customer name (truncation), prospect (no saved customer), freetext line
  (the " *" footnote path), a line note, header notes, and a no-`valid_until` "ongoing"
  agreement (Agreement A); plus a saved customer + dated `valid_until` + catalogued product
  line (Agreement B).
- **Lazy-load preserved** — `jspdf`/`jspdf-autotable` are pulled via `await import()` inside
  the adapter method; pinned not to enter the initial bundle by the dynamic-import lint ban.

Caveat: the port renders+delivers in one operation (doc.save()), so the raw PDF bytes are
not headless-assertable (deferred: backlog F-TD-26). "A real Chromium download fired with
the exact filename contract, across all render branches" is the strongest identity proof
available without that split.

## Migration

None. No migration, no DB change, no RLS change.
Rollback: **code-only revert of PR #57** (revert the merge commit / Vercel rollback). No
data migration to reverse, no PITR required.

## Merge Sequence

1. (no migration step — skip `supabase db push`)
2. Merge PR #57 → Vercel auto-deploys
3. Smoke test: pricing page Export PDF on the deployed build (optional @critical-lane check)

## Real code bugs found

None.

## Verdict

✅ CLEARED FOR PRODUCTION

Locked by the FORGE conductor at ANVIL-Lock (2026-06-19). All approved layers green
(Unit 1925/1925 · Integration 49/49 · pgTAP N/A — no DB change · E2E 2/2 real Chromium
PDF downloads). No destructive migration → no PITR gate. Rollback = code-only revert of
PR #57 (no migration, no data). Guard review: docs/reviews/2026-06-19-f-22-pdfrenderer-port-review.md.
