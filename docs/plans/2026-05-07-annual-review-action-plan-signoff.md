## Goal
Complete the annual review by adding the action plan editing UI and cleaning up
the remaining gaps. Sign-off and lock already work — just needs action plan UI.

## Compliance
Action plan is required by SALSA/BSD — identified non-conformances must be
documented with owner and due date. MFS-ASR-001 Section 4.

## Codebase findings (full grill)

### What already exists
- DB: action_plan (jsonb), locked, signed_off_by, signed_off_at,
  approved_by, approved_at — all present in haccp_annual_reviews
- API PATCH: sign-off path fully built, sets locked=true on success
- canSignOff(), buildInitialActionPlan(), ActionPlanItem type — all in sections.ts
- Sign-off UI: approved by selector (uses /api/haccp/users),
  approved_at date, confirm button, cancel button — complete
- Lock state: locked reviews show green "Review signed off" card with signer/approver
- Progress bar: completedCount/totalSections with green fill
- Tests: canSignOff and buildInitialActionPlan fully tested

### What's missing
1. Action plan UI — action_plan is in DB and included in API calls but ZERO
   rendering in the page. buildInitialActionPlan() seeds 6 empty rows but
   there's no way for the user to fill them in.
2. "Coming soon" placeholder — still shows "Sections 3.2–3.12" text even
   though all 10 sections are now built. Should be removed.
3. Action plan included in sign-off PATCH — already wired:
   `action_plan: active.action_plan` is sent on sign-off. So if action plan
   UI saves back to active.action_plan, it will be included in lock.

### ActionPlanItem type (from sections.ts)
{ ref: number, action: string, owner: string, due_date: string, status: 'open' | 'complete' }

### Document format (MFS-ASR-001 Section 4)
6 rows: # | Action Required | Owner | Due Date | Status
Status is open/complete (doc shows blank = open, ticked = complete)

### Sign-off state (already complete)
canSignOff requires: !locked + isChecklistComplete(checklist)
isChecklistComplete now covers all 10 sections (3.1–3.10)
Users list comes from /api/haccp/users (food safety team only)

## Files to change
- `app/haccp/annual-review/page.tsx` — action plan UI + remove placeholder

## Steps
- [ ] 1. Add ActionPlanSection component — editable 6-row table
         Rows auto-save to active.action_plan via PATCH on blur/change
         Locked state: read-only
- [ ] 2. Render ActionPlanSection between last section card and sign-off block
- [ ] 3. Remove "coming soon" placeholder (now all sections built)
- [ ] 4. Ensure locked view shows action plan read-only
- [ ] 5. Run npm run test — all pass
- [ ] 6. Run npx tsc --noEmit — clean

## ActionPlanSection UI

### Edit mode (unlocked, admin)
- Header: "4. Action Plan" matching MFS-ASR-001
- Sub: "Record actions identified during this review"
- 6 rows (fixed — matches document), each row:
  - Ref: # (1-6, read-only display)
  - Action required: textarea (auto-expand), placeholder "Describe action…"
  - Owner: free text input, placeholder "Name"
  - Due date: date input
  - Status: toggle button — "Open" (slate) / "Complete" (green)
- Auto-saves each row on change (debounced 800ms, same pattern as checklist)
  PATCH { id, action_plan: active.action_plan }
- Empty rows are fine — not all 6 need to be filled

### Read-only view (locked or non-admin)
- Same layout but all inputs disabled/display-only
- Complete rows show green status badge
- Empty rows show "—"

### Locked sign-off record (already exists, just verify)
- Green card showing reviewed by / approved by / date — already complete

## Tests
- No new pure logic to test — action plan type and buildInitialActionPlan
  already tested. Component is purely UI.
- npm run test must still pass (975 tests)

## Manual smoke tests
- [ ] Open draft review → Action Plan section visible below 3.10
- [ ] Enter action text, owner, due date → auto-saves (saving indicator visible)
- [ ] Toggle status Open → Complete → row goes green
- [ ] Re-open review → action plan persists
- [ ] "Coming soon" placeholder gone
- [ ] Complete all 10 sections → progress bar hits 100%
- [ ] Sign-off button appears → select approver → confirm
- [ ] Review locks → action plan shown read-only with status badges
- [ ] Locked review in list shows "Signed off" badge

## Risks
- Action plan has exactly 6 rows (matches document) — not dynamic.
  buildInitialActionPlan() seeds 6 rows. If active.action_plan has fewer/more
  rows (edge case), the component should normalise to 6.
- Auto-save sends full action_plan array on every change — small payload, fine.
- Locked reviews: action plan already included in the PATCH on sign-off
  (line 1366: action_plan: active.action_plan) so whatever is in state
  at sign-off time gets saved. No additional API changes needed.
