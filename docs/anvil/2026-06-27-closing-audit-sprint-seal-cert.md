# ANVIL Closing-Audit Certificate — 16-Day Re-Architecture Sprint Seal

Branch: closing-audit-sprint-seal

- **Date:** 2026-06-27
- **Scope:** Final go/no-go seal of the 16-day hexagonal (ports & adapters) re-architecture sprint (2026-06-12 → 28). NOT a feature change — this PR carries the closing-audit certificate + the F-INFRA-04 deferral bookkeeping only. NO app code, NO `lib/**`, NO migration, NO RLS, NO new dependency. Byte-identical application bundle.
- **Baseline:** `main` @ `f5a5ab0` (F-INFRA-03 ship record; last app-code change was F-TD-12 `2c6ee1f`).
- **Status:** **CLEARED FOR PRODUCTION** — all rungs green incl. the fresh live `@critical` 75/75 (run `28304433805`).

## Why this audit
Day-16 close of the sprint. Two Day-16 items remained: F-INFRA-04 (re-enable Vercel Deployment Protection) and this closing audit.

- **F-INFRA-04 — DEFERRED by Hakan 2026-06-27.** Deployment Protection STAYS OFF until coding resumes (~late July 2026, ~1 month out). No one is actively coding; previews hold only ANVIL-test data; re-locking now buys nothing. `--unprotected` remains everywhere, the pin test stays asserting PRESENT, the standing protection-off reminder persists. Precise re-enable change preserved in BACKLOG F-INFRA-04. (Recorded in `docs/plans/BACKLOG.md` + roadmap in this PR.)
- **Closing audit — this document.** Two legs: (1) the all-domains rip-out / acceptance test, (2) full regression.

## Leg 1 — Rip-out / acceptance test (all domains)
**Verdict: PASS.** Every swappable external vendor sits behind a port the app owns, its SDK confined to a single `lib/adapters/<vendor>/` folder, wired in exactly one `lib/wiring/` composition root. Swapping any one = one new adapter + one wiring edit.

| Vendor | Capability | Adapter folder | Verdict |
| --- | --- | --- | --- |
| Supabase | DB + auth (RLS) — 26 repos/storage ports | `lib/adapters/supabase/` | PASS |
| web-crypto | session sealing + DB-token mint | `lib/adapters/web-crypto/` | PASS |
| resend | email | `lib/adapters/resend/` | PASS |
| web-push | push notifications | `lib/adapters/web-push/` | PASS |
| postcodes.io | geocoding | `lib/adapters/postcodes/` | PASS |
| dexie | local cache (offline PWA / IndexedDB) | `lib/adapters/dexie/` | PASS |
| @anthropic-ai/sdk | LLM extraction | `lib/adapters/anthropic/` | PASS |
| bcryptjs | password hashing | `lib/adapters/bcrypt/` | PASS |
| jspdf / jspdf-autotable | PDF render | `lib/adapters/jspdf/` | PASS |
| xlsx | spreadsheet export | `lib/adapters/xlsx/` | PASS |
| leaflet (+ cluster libs) | map rendering (UI adapter) | `lib/adapters/leaflet/` | PASS |

**Boundary-violation scans (4 CLAUDE.md blocker categories): ZERO new violations.**
1. `lib/domain/**` or `lib/ports/**` → `lib/adapters/**`: **ZERO hits.**
2. `app/**` / `components/**` → `lib/adapters/**` directly: 11 hits, ALL sanctioned-by-design + pin-tested — 9× owned `supabaseService` client wrapper (the documented app-code path; raw SDK never leaks; = Rule-A allow-list) + 2× leaflet adapter's React component mount (a UI adapter must be a component). No raw vendor SDK in presentation.
3. Vendor SDK outside `lib/adapters/<vendor>/`: **ZERO hits** — every raw SDK confined to its adapter folder; wiring imports adapter modules, never raw SDKs.
4. `lib/services/**` importing another service directly: **ZERO hits** — cross-service composition routes through `lib/usecases/` or the ports barrel.

**Guardrails live:** `.eslintrc.json` bans all 14 swappable-vendor SDKs (top-level + services/usecases override) + 6 pin tests in `tests/unit/lint/` (`no-supabase-sdk`, `no-adapter-imports`, `no-cross-service-imports`, `vendor-fence-complete`, `no-disable-arch-rules`, `no-service-role-in-user-routes`). Verdict rests on the actual import graph; fences are the anti-drift backstop.

**Known debt (carried, NOT new — does not block the seal):** (1) 5 raw-`SUPABASE_SERVICE_ROLE_KEY` REST writers under F-TD-31 (`screen2/note·resolve·sync`, `screen3/sync`, `routes/optimise`) — allow-listed + pinned; (2) Capacitor (label-printing) has no port/adapter yet — currently import-free (no live failure), the #1 post-sprint job; (3) ARCH-FU-09/10 — cosmetic tightening.

## Leg 2 — Full regression
| Layer | Result |
| --- | --- |
| `tsc --noEmit` | ✓ clean (exit 0) |
| `next lint` | ✓ No ESLint warnings or errors |
| Unit (`vitest run`) | ✓ **2743/2743** (187 files) |
| pgTAP / RLS (`supabase test db`) | ✓ **245/245** ok (18 real test files; `_helpers.sql` no-plan parse-error is a harness glob artifact, NOT a test failure — every test file reports `ok`, 0 failed) |
| Integration (`test:integration`, live booted server → local Supabase) | ✓ **530/530** (41 files) |
| Rip-out / acceptance test (all domains) | ✓ PASS (Leg 1) |
| **Live `@critical` preview smoke (75 specs)** | ✓ **75/75 (4.3m)** — fresh CI run on this PR's preview |

## Live `@critical` run
- PR: #92 (`closing-audit-sprint-seal` → `main`)
- Run: `28304433805`, job `smoke` `83858119692` — conclusion **success**
- Result: discover ✓ · readiness ✓ · **DB-identity probe 4/4** (seed-born preview DB) · **@critical 75/75 (4.3m)**

## Pre-merge checklist
- [x] Rip-out / acceptance test PASS (all 11 vendors, zero new boundary violations).
- [x] Full offline regression green (tsc, lint, unit, pgTAP, integration).
- [x] Live `@critical` smoke green on a fresh preview (75/75) — run `28304433805`.
- [x] No migration → no PITR gate (docs-only PR).
- [x] F-INFRA-04 deferral recorded in BACKLOG + roadmap.

## Sprint outcome
The 16-day hexagonal re-architecture is sound: every external dependency is behind an owned port, the all-domains rip-out test holds, and the full regression is green. Remaining work is carried backlog (F-TD-31, Capacitor/label-printing, ARCH-FU-09/10) and the deferred F-INFRA-04 (protection re-enable when coding resumes). The parallel `worktree-ui-system-rebuild` UI branch remains unmerged until this seal lands, per the standing coordination rule.
