## Goal
Fix three bugs in the visitor sign-in page.

## Codebase findings (full grill)

### Bug 1 — 307 redirect on POST (critical — nothing submits)
POST /api/haccp/visitor returns 307.
Cause: middleware.ts PUBLIC_PATHS does not include '/api/haccp/visitor'.
Unauthenticated request → no session cookie → middleware redirects to /login.
The /haccp/* page bypass only applies to pathnames starting with '/haccp',
not '/api/haccp'.
Fix: add '/api/haccp/visitor' to PUBLIC_PATHS in middleware.ts

### Bug 2 — vq9 "No" renders green
isExclusionYes = val && q.id !== 'vq9' && val
For vq9, isExclusionYes is always false regardless of val.
Result: both Yes and No render green when selected for vq9.
Should be: Yes = green (good), No = red (bad — they don't understand)

### Bug 3 — vq9 "No" doesn't trigger exclusion
hasExclusion = VISITOR_QUESTIONS.slice(0, 8).some(q => answers[q.id] === true)
Only checks vq1–vq8. vq9 = No (doesn't understand) should also exclude.
Fix: add answers['vq9'] === false to hasExclusion condition

## Files to change
- `middleware.ts` — add '/api/haccp/visitor' to PUBLIC_PATHS
- `app/haccp/visitor/page.tsx` — fix vq9 colour logic + fix hasExclusion

## Steps
- [ ] 1. middleware.ts: add '/api/haccp/visitor' to PUBLIC_PATHS
- [ ] 2. visitor/page.tsx: fix vq9 colour logic
- [ ] 3. visitor/page.tsx: fix hasExclusion to include vq9 = false
- [ ] 4. npm run test — all pass
- [ ] 5. npx tsc --noEmit — clean

## Fixes in detail

### middleware.ts
const PUBLIC_PATHS = [..., '/api/haccp/visitor']

### vq9 colour logic
Current (wrong):
  const isExclusionYes = val && q.id !== 'vq9' && val
  colour: selected ? (isExclusionYes && q.id !== 'vq9' ? red : green) : unselected

For vq1-vq8: Yes = red, No = green
For vq9: Yes = green, No = red (inverted — understanding is required)

New logic:
  For vq1-vq8: selected Yes → red, selected No → green
  For vq9: selected Yes → green, selected No → red

Clean rewrite using explicit condition:
  const isGreen = selected && (q.id === 'vq9' ? val === true : val === false)
  const isRed   = selected && (q.id === 'vq9' ? val === false : val === true)
  colour: isRed ? red : isGreen ? green : unselected

### Exclusion confirmation step (new)
When isValid + hasExclusion → show confirmation panel before submitting:
  "Based on your answers you will be recorded as unable to enter.
   Please inform a member of staff. Tap Confirm to record your visit."
  Two buttons: Go back | Confirm & record
  Confirm → submit with fit_for_work=false → excluded screen
  Go back → return to form (allow correction)
Same flow for vq9=No as for vq1-vq8=Yes.

## Tests
- npm run test 975 must still pass
- No new unit tests needed (UI-only fix)

## Manual smoke tests
- [ ] Submit form → success screen shows (not blank/hang)
- [ ] Check DB → record saved with correct visitor_name
- [ ] vq9 Yes → green button
- [ ] vq9 No → red button
- [ ] vq9 No → excluded state on submit
- [ ] vq1 Yes → red button, excluded state on submit
- [ ] All No (vq1-vq8) + vq9 Yes → success state

## Risks
- None. All three fixes are minimal and targeted.
- Adding /api/haccp/visitor to PUBLIC_PATHS is safe — the route itself
  has no auth requirement and no sensitive data returned on GET
  (POST only — inserts a visitor record using system user)
