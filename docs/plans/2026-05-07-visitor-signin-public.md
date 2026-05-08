## Goal
Create a public visitor sign-in page at /haccp/visitor that requires no login.
Tablet is left on the wall — visitors sign themselves in.
Records are stored in haccp_health_records (same table as existing visitor records).
Add a SmallTile on the HACCP homepage linking to it.

## Compliance
HACCP visitor management requirement — all visitors to food production areas
must complete a health declaration before entry.

## Codebase findings (full grill)

### Auth / routing
- middleware.ts PUBLIC_PATHS includes '/haccp'
- pathname.startsWith('/haccp') passes through without auth
- /haccp/visitor is automatically public — NO middleware changes needed

### DB constraint
- haccp_health_records.submitted_by: uuid NOT NULL FK → users
- Public visitors have no user account — cannot use the existing people API
- Solution: create a dedicated system user 'Visitor Kiosk' in the users table
  with a fixed UUID, used for all public visitor submissions
  This is better than making submitted_by nullable (preserves data integrity)
  and better than using manager sign-off as submitted_by (semantically wrong)

### Existing visitor form (people/page.tsx)
- VISITOR_QUESTIONS: 9 yes/no questions (vq1–vq9)
  vq1–vq8 = exclusion questions (yes = cannot enter)
  vq9 = "Do you understand all of the above?" (must be yes)
- VISITOR_DECLARATION: 4 checkboxes (vd1–vd4) all must be confirmed
- Fields: visitor_name, visitor_company, visitor_reason, manager_signed_by
- Exclusion logic: any vq1–vq8 = yes → cannot enter, show rejection message
- Valid = allAnswered + allDeclared + manager name set + no exclusion yes

### New API endpoint needed
- New route: /api/haccp/visitor/route.ts (POST only, no auth required)
- Uses supabaseService (service role) directly
- submitted_by = system user UUID for 'Visitor Kiosk'
- Same insert as people route visitor branch, minus the userId requirement

### Homepage tile
- SmallTile: "Visitor Sign-In" | sub: "Public · No login"
- Always visible (all roles + unauthenticated)
- onTap → /haccp/visitor (opens in same window)
- No badge / due state needed — it's always available

## Files to change
- DB: insert system user 'Visitor Kiosk' into users table
- `app/api/haccp/visitor/route.ts` — NEW public POST endpoint
- `app/haccp/visitor/page.tsx` — NEW public visitor sign-in page
- `app/haccp/page.tsx` — add SmallTile linking to /haccp/visitor

## Steps
- [ ] 1. DB: insert 'Visitor Kiosk' system user, note the UUID
- [ ] 2. Create /api/haccp/visitor/route.ts — POST only, no auth
- [ ] 3. Create /app/haccp/visitor/page.tsx — full visitor sign-in flow
- [ ] 4. Add SmallTile to HACCP homepage
- [ ] 5. npm run test — all pass
- [ ] 6. npx tsc --noEmit — clean

## System user
INSERT INTO users (name, role, active)
VALUES ('Visitor Kiosk', 'visitor', false)
RETURNING id;
-- active=false so it never appears in any user selectors
-- role='visitor' (new value, not in any ROLE_PERMISSIONS — just a label)
-- Capture the UUID and hardcode it in the API route

## API: /api/haccp/visitor
POST only. No auth cookie required. No role check.
Uses supabaseService directly.
Body: { visitor_name, visitor_company, visitor_reason,
        health_questions, visitor_declaration_confirmed, manager_signed_by }
submitted_by = VISITOR_KIOSK_USER_ID (hardcoded constant)
Validation: same as people route visitor branch
Returns: { ok: true } or { error: string }

## Page: /haccp/visitor
Three states: form → excluded → success

### Form state
Dark header matching HACCP style (bg-[#1E293B])
Title: "Visitor Sign-In" | Sub: "Complete before entering the production area"

Step 1 — Visitor details:
  - Full name (required)
  - Company (required)
  - Reason for visit (required)

Step 2 — Health questions (9 yes/no):
  Same VISITOR_QUESTIONS from people/page.tsx (copy constants)
  Y/N toggle buttons per question
  If any vq1–vq8 = yes → show exclusion message immediately (don't wait for submit)

Step 3 — Declaration (4 checkboxes):
  Same VISITOR_DECLARATION from people/page.tsx
  All must be checked

Step 4 — Manager sign-off:
  "Please call a member of staff to countersign"
  Free text name field (manager/supervisor name)
  Required before submit

Submit button: disabled until all valid
  isValid = allAnswered + allDeclared + manager.trim() + !hasExclusionYes

### Excluded state
  Red panel: "You cannot enter the production area"
  "Please inform a member of staff"
  No submit — record is NOT saved if excluded (nothing to record if denied entry)
  "Go back" button to re-check answers

### Success state
  Green confirmation: "Sign-in recorded"
  "Welcome, [name]. Your visit has been logged."
  "This page will reset in 10 seconds" → auto-reset to blank form after 10s
  Manual "Sign in another visitor" button

## Homepage SmallTile
  id="visitor-signin"
  label="Visitor Sign-In"
  sub="Public — no login needed"
  badge="Tap to sign in"
  due={false}
  onTap → window.location.href = '/haccp/visitor'
  No isAdmin guard — visible to all roles

## Tests
- No new pure logic to test
- npm run test 975 must still pass

## Manual smoke tests
- [ ] /haccp/visitor loads without login (try in incognito)
- [ ] HACCP homepage shows Visitor Sign-In tile
- [ ] Fill name/company/reason → answer all 9 questions (all No)
- [ ] Check all 4 declarations → enter manager name → Submit
- [ ] Success screen shows, auto-resets after 10s
- [ ] Record appears in People tile visitor log
- [ ] Answer vq1 = Yes → exclusion panel shown, submit hidden
- [ ] Go back → returns to form pre-filled

## Risks
- submitted_by NOT NULL: handled by Visitor Kiosk system user
  UUID must be hardcoded in the API — if users table ever truncated this breaks
  Mitigation: document UUID in handover file
- users table role check constraint may block role='visitor'
  Check before inserting — may need to extend constraint
- Auto-reset: use setTimeout in useEffect, cleared on unmount
- Page must work without JS for accessibility (progressive enhancement)
  Not critical for internal tablet kiosk but good practice
