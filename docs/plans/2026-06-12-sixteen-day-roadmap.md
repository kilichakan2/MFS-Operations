# 16-Day Production Roadmap — 2026-06-12 → 2026-06-27

**Goal (Hakan, 2026-06-12):** complete EVERYTHING remaining on the hexagonal
migration roadmap — nothing skipped — and have every module of the app
production-ready by the end. This includes Phases 2–5, the full RLS security
track, all open tech debt, both infra follow-ups, and both tracked product
features.

**Starting point:** Phase 1 closed (F-09 re-gate PASS, HEAD `5d97abb`),
15 of ~38 roadmap PRs shipped. Required pace: ~2.5–3 PRs/day, every day,
weekends included. There is NO slack day — slippage surfaces immediately.

**Delivery loop per unit:** FORGE (4 gates) → ANVIL cert → squash-merge →
archive plan. Domain units copy the F-13-onward composition-root template
(`lib/wiring/<domain>.ts`); the ESLint adapter-import guard is already live.

**RLS slices:** each domain's RLS migration (F-RLS-04 series) rides in the
same day as its domain unit, per the roadmap's "Orders RLS lands with
Phase 1, Users RLS with F-13" rule.

---

## Schedule

### Day 1 — Thu 12 Jun ✅ DONE

- ✅ **F-RLS-01** — RLS audit + threat model → `docs/rls-audit-2026-06-12.md` (advisors + per-table map; surfaced 3 criticals: unsigned session cookie = priv-esc, 42 RLS-off tables exposed via PostgREST, anon-callable `replace_agreement_lines`)
- ✅ **F-RLS-02** — per-table expand-contract RLS plan → `docs/rls-expand-contract-plan-2026-06-12.md` (6-step sequence, policy templates, slice schedule, rollback per step)
- ✅ **F-TD-13** — `annualReview.test.ts` midnight flake fix (commit `32fbec7`; 182/182 green)
- ✅ **F-TD-08** — `kds.test.ts` pin_hash clobber fix (commit `32fbec7`; verified no residue)

### Day 2 — Fri 13 Jun

- **F-TD-01** — clear ~60 pre-existing tsc errors + ESLint nits → `lint`/`tsc` exit 0 on main → ANVIL layers 3+4 go strict for every later unit
- **F-TD-09** — idempotency-key purge job + Guard W1 TOCTOU fix + nits N1–N3

### Day 3 — Sat 14 Jun

- **F-TD-04** — lazy `getSupabaseService()` getter + move `lib/supabase.ts` → `lib/adapters/supabase/client.ts`
- **F-10** — `PasswordHasher` port + bcrypt adapter (4 routes)
- **F-12** — `LLMExtractor` port + Anthropic adapter (`admin/import`)

### Day 4 — Sun 15 Jun

- **F-RLS-03** — per-request authenticated Supabase client (`AuthenticatedDbAdapter`); `supabaseService` demoted to admin-only
- **F-RLS-04a** — Orders-context RLS migration (expand-contract, rollback path)
- **F-TD-07** — prod hygiene audit for `ANVIL-TEST-*` rows (**needs Hakan ~15 min** for the delete decision)

### Days 5–6 — Mon 16 – Tue 17 Jun

- **F-13** Users + Auth (3 PRs; login route is the most critical surface). Absorbs: **ARCH-FU-01** (Role → `lib/domain/`), **ARCH-FU-03** (callerUserId decision), **ARCH-FU-04** (round-trip-read test pattern + retrofit), **F-TD-05** (cross-service import pin), expansion of the F-08 UsersRepository seed. Planner MUST copy the composition-root template.
- **F-RLS-04b** — Users-context RLS migration

### Day 7 — Wed 18 Jun

- **F-11** — `Mailer` port + Resend adapter, 3 email helpers re-pointed (unblocked by F-13)
- **F-PROD-02** — KDS line-done undo (**30-min product session with Hakan first** to lock undo/cascade/audit rules, then build)

### Day 8 — Thu 19 Jun

- **F-14** — Delivery Routes domain (compressed to 2 PRs: ports+adapter+service, then route rewrites)
- **F-24** — `MapProvider` port + Leaflet adapter (rides with Routes — same screens)
- **F-RLS-04c** — Routes-context RLS

### Day 9 — Fri 20 Jun

- **F-15** — Pricing domain (2 PRs; absorbs `pricing-email.ts` raw-fetch per ADR-0005)
- **F-22** — `PdfRenderer` port + jsPDF adapter (rides with Pricing)
- **F-RLS-04d** — Pricing-context RLS

### Day 10 — Sat 21 Jun

- **F-16** — Cash domain (2 PRs; absorbs `detail/discrepancy` raw-fetch)
- **F-RLS-04e** — Cash-context RLS

### Day 11 — Sun 22 Jun

- **F-17** — Compliments + Complaints (2 PRs; absorbs 5 `screen2` + `detail/complaint` raw-fetch sites + complaint/compliment email helpers)
- **F-RLS-04f** — Complaints-context RLS

### Day 12 — Mon 23 Jun

- **F-18** — Visits / Screen 3 (2 PRs; absorbs `detail/visit` raw-fetch)
- **F-RLS-04g** — Visits-context RLS

### Days 13–14 — Tue 24 – Wed 25 Jun ⚠️ the crunch

- **F-19** — HACCP, largest domain (~30 routes; sub-domain split: audit, allergen, cold-storage, calibration, training, cleaning, recall — 5–8 PRs across both days)
- **F-23** — `SpreadsheetWriter` port + XLSX adapter (rides with HACCP export)
- **F-PROD-01** — Allergen Assessment version-history UI (rides with the allergen sub-domain)
- **F-RLS-04h** — HACCP-context RLS

### Day 15 — Thu 26 Jun

- **F-20** — Admin (3 PRs; absorbs `admin/geocode-all` + `map/data` raw-fetch)
- **F-21** — Dashboard split into `DashboardService` over the now-existing repositories (1 PR)
- **F-25** — `PushSender` port + web-push adapter
- **F-26** — `LocalCache` port + Dexie adapter
- **F-RLS-04i** — Admin-context RLS

### Day 16 — Fri 27 Jun — seal + close

- **F-27** — ESLint rule extended to ALL vendor SDKs outside `lib/adapters/**` (+ no-eslint-disable check per F-TD-11 Guard note) — the Lego principle gets teeth
- **F-RLS-final** — retire service-role from all user-facing paths; `requireServiceRole()` for admin routes; lint rule
- **F-TD-12** — retire legacy `lib/orders/types.ts` wire shapes from the 5 UI pages
- **F-INFRA-03** — preview smoke in GitHub Actions CI
- **F-INFRA-04** — re-enable Vercel Deployment Protection + automation bypass; drop `--unprotected`
- **Closing audit** — rip-out test re-run for EVERY domain (F-09-style, all-domains edition) + full regression (unit / integration / @critical)

---

## Standing constraints (carried from Phase 1)

- Prod migrations via Supabase MCP `apply_migration`, never `supabase db push`.
- No-reformat rule in every implementer prompt: no reformatting beyond changed lines; declare unavoidable reformatting.
- Preview smokes: `--unprotected` mandatory until F-INFRA-04 lands (day 16).
- Vercel first-build ERROR racing preview-branch provisioning is expected; automatic redeploy succeeds (3-for-3 pattern).
- Prod smoke surface: `GET /api/kds/orders` + login page only (middleware 307s everything else without a cookie).
- Baselines at sprint start: 1511 unit tests, tsc 60 (→0 after Day 2), lint 58 (→0 after Day 2).

## Where Hakan is needed

- Daily: the four FORGE gates per unit (spec / plan / test matrix / ship).
- Day 4: F-TD-07 delete decision (~15 min).
- Day 7: F-PROD-02 product session (~30 min — undo rules).
- Day 16: final go/no-go on the closing audit.

## Risks (named up front)

1. **F-19 HACCP is the wildcard** (5–8 PRs estimated). If days 1–12 slip, HACCP eats the buffer that doesn't exist. Checkpoint: if Day 12 ends behind schedule, re-scope Day 16's nice-to-haves (F-INFRA-03, F-TD-12) before touching security items.
2. **No slack days; weekends are working days.** The pace (~2.5–3 PRs/day) matches our best Phase-1 days, sustained for 16 straight.
3. **RLS slices touch production data access.** Each F-RLS-04 migration ships expand-contract with a rollback path; any RLS regression halts the lane, not the sprint.
4. Days 14–15 are deliberately overloaded with small wrapper PRs (F-23/F-25/F-26) — these are the first candidates to shift into Day 16 if domains run long.

## Progress tracking

Mark each unit done here as it merges (same convention as BACKLOG.md).
This file is the sprint index; BACKLOG.md remains the deferred-items index.
