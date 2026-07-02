# Guard review — PR #112 `feat/goods-in-ccp1-unit` (Goods In CCP-1 unit)

**Date:** 2026-07-02 · **Reviewer:** FORGE code-critic subagent (fresh context) · **Diff:** 9 commits `1ac9ed8`..`26608b2` vs main
**Verdict: NO BLOCKERS — hand to ANVIL.** 2 🟡 warnings (one needs Hakan decision), 4 🔵 notes, strong 🟢 test quality.

Special brief: the implementer ran ~500k tokens, so this review added a 4-point late-context degradation audit. **All four PASSED** (details below).

## 🔴 Blockers — none

## 🟡 Warnings

1. **`app/haccp/delivery/page.tsx:1623` — frozen family loses decimal temperature entry.** Kit `NumberPad` has one shared key slot for `.`/`-` (`components/ui/NumberPad.tsx:156`); giving frozen the minus key (a REAL latent-bug fix — `frozen_beef_lamb` previously could not enter any negative temp, so every entry graded fail) removed the decimal point. Old pad offered both for `frozen`. A true −17.5 typed as −18 records `pass` when the honest verdict is `urgent` (QFF amber band is only 3°C wide). DB column is `numeric(4,1)` — app can't enter the precision the register stores. Fix shape: sign-toggle row on kit NumberPad when both flags set (ADR-0014 Rule 3 kit-first), page flips to `allowDecimal` unconditional. Cold-storage shipped the same trade (why 🟡 not 🔴). Needs Hakan: fix now vs explicit accept + backlog.
2. **`docs/reference/haccp/DOCUMENT_CONTROL.md` §4 — justification paragraphs inserted mid-table**, splitting the CCP table; CCP-2/3/4 + SOP-3 rows will render as raw pipe-text in most markdown renderers. Content itself correct and complete (both written justifications, configurability note, §7 changelog). Move the paragraphs below the table. Trivial, fix on-branch.

## 🔵 Notes (follow-up, non-blocking)

3. `lib/adapters/supabase/HaccpDailyChecksRepository.ts` `updateGoodsInThreshold` — non-transactional update→audit (audit-insert failure after update commit = moved limit, no audit row, admin sees 500). Mirrors shipped `updateProcessRoomThreshold`; self-documented. Close for both tables via trigger/RPC in one follow-up.
4. `lib/services/HaccpDailyChecksService.ts:1103-1140` — no magnitude bound on threshold edits (`pass_max_c: 1000` → numeric(4,1) overflow → 500 not 400; nothing bounds loosening — audit log is the control). Same posture as process-room trio.
5. Amber tokens on Quick-ref explainer boxes (`page.tsx:1662-1685`) + CCA urgent track header (`:531-533`) — informational chrome describing the amber band; old screen painted them amber too; spec's illegal-chrome list named only greens. Judgement call for Hakan/ANVIL visual gate, not a lint defect. E2E visual-law test doesn't assert inside Quick-ref.
6. ESLint: 5 pre-existing "rule definition not found" errors in untouched files (plugin/config drift, exit 0). Not this branch.

## 🟢 Test quality

- Fence-post discipline excellent: `tests/unit/domain/goodsIn.test.ts` pins both sides of every boundary for all 11 categories (4.0/4.1 · 5.0/5.1 · 8.0/8.1 · 3.0/3.1 · −18.0/−17.9 · −15.0/−14.9), null/NaN server semantics, fail-closed throws (missing key by name, empty set), R1 seed-completeness enumeration. TDD order visible in commits.
- No weakening anywhere; all touched pre-existing tests strictly additive.
- Minor: `tests/e2e/12-haccp-delivery.spec.ts:246` raw `div.bg-white.rounded-xl` locator on unrepainted admin screen — will break when F-TD-42 repaints; note for that unit.
- Minor: integration `delivery_number` self-healer (`haccp-goods-in-thresholds.test.ts:47-85`) papers over the wedge `haccp.test.ts` leaves; shared fixture helper would be cleaner.

## Depth verdicts

- `lib/domain/goodsIn.ts` → **DEEP** (band rule + fail-closed policy + copy derivation behind 3 small fns; kills the duplicate that caused the poultry bug; deletion test: complexity would smear back into two divergent copies).
- Port +2 methods → sound extension of proven port, 2 real adapters (Supabase + Fake), not speculative.
- Service trio → borderline-shallow but boundary-mandated (only layer routes may call; `validate` carries real logic; mirrors process-room trio).
- Client `calcStatus` wrapper → adds real client-only "no temp yet → no verdict" semantics.

## Late-context degradation audit — ALL PASS

1. **Plan completeness PASS** — all 23 plan-table files in diff + 2 necessary extras (integration key-set pin; service-test signature threading); all 16 steps evidenced in code; db:reset idempotence re-run by reviewer.
2. **Test weakening PASS** — token-purity SCREENS grew; contrast pins +10 declarations +5 maths pairs, nothing removed; integration key-set pin extended additively; E2E rewrite keeps all 3 original pins, extends to 8 specs.
3. **Behaviour loss PASS with one exception (🟡1)** — spec §1 KEEP inventory walked item-by-item on the rebuilt page: all present ✓ (category-first form, supplier filter+Other, BLS block w/ same-as + DDMM-CC-N preview, numpad verdict + DB-derived guidance, contamination 3-way+4 types, allergen 14 chips + auto-CA set byte-identical client/server, two-track CCA locked-on-fail + cause-aware recurrence, 3-range log + detail, SOP 5B, Quick ref, Handbook, ca_write_failed, Europe/London).
4. **Hard guards ALL PASS** — printer flow byte-identical in behaviour; alarm files zero-diff; middleware zero-diff (labels-only rename); package.json zero-diff; /haccp/admin confined to Goods In section + plan-mandated reminder wording.

**Self-reported adaptations judged:** (a) SOUND — admin queue lists only `management_verification_required=true` rows (verified `app/api/haccp/corrective-actions/route.ts`; urgent temp-CAs write `false` at `HaccpDailyChecksService.ts:1057`) → amber never queues by design; persisted-badge assertion is the correct observable. (b) SOUND — preview @critical barred from service-role key; audit proof at integration + pgTAP; no audit UI exists to assert. (c) SPLIT — minus key sound (latent-bug fix); decimal loss = 🟡1.

## Security spot-checks (new admin PATCH surface)

Double lock verified end-to-end: route `isAdmin` (middleware-set header, unspoofable) + per-caller client → DB `is_admin()` RLS; pgTAP 019: non-admin INSERT `42501`, UPDATE/DELETE 0-row, audit invisible to non-admins + immutable even to admins; integration 403s; E2E from real session. Fail-closed everywhere: domain throws on missing key; adapter fatal on read error; route 500 on empty set; client disables entry + red `thresholdsMissing` banner; no band literal outside migration seed + fixtures (grep-verified). Structure lock (null-ness immutable via app) at unit + integration; DB CHECK rejects inverted/orphan-amber (`23514` pgTAP-proven); JSON type-abuse → `Number.isFinite` → 400.

## Suite results (run by reviewer on branch, local Supabase)

| Lane | Result |
|---|---|
| Unit (incl. lint/guard/design pins) | 205 files, 3001/3001 |
| tsc --noEmit | clean |
| ESLint | exit 0 (5 pre-existing rule-def errors, untouched files) |
| db:reset ×2 | clean (idempotent) |
| pgTAP | 276/276 incl. new 019 (harness FAIL line = pre-existing `_helpers.sql` wart) |
| Integration | 45 files, 561/561 |
| E2E 12-haccp-delivery (chromium local) | 8/8, 37s |

Key files: `lib/domain/goodsIn.ts` · `supabase/migrations/20260702120000_haccp_goods_in_thresholds.sql` · `app/haccp/delivery/page.tsx` · `app/api/haccp/admin/goods-in-thresholds/route.ts` · `docs/reference/haccp/DOCUMENT_CONTROL.md` · `tests/e2e/12-haccp-delivery.spec.ts`
