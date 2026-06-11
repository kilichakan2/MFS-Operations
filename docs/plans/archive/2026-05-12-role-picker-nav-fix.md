# Role Picker Nav Fix
**Created:** 2026-05-12

## Problem
After picking a door (e.g. Driver), the nav bar still shows items
from both roles (Driver + Sales). Both doors show everything.

## Root cause (from full grill)

### Cause 1 — RoleNav union logic (primary bug)
RoleNav was updated in commit 1dd39a0 to read BOTH mfs_role AND
mfs_secondary_roles and build a union nav. This was correct before
the role picker existed (when sessions could have secondaryRoles set).

Now with the role picker, the session is always single-role.
But the OLD mfs_secondary_roles=sales cookie from before the role
picker was deployed is still sitting in the browser. RoleNav reads it,
builds the union, and shows both sets of nav items regardless of which
door was picked.

### Cause 2 — mfs_secondary_roles cookie not reliably cleared
Login route sets mfs_secondary_roles='' (empty string) after role picker.
Setting a cookie to empty string may not reliably overwrite the old
mfs_secondary_roles=sales cookie in all PWA/browser contexts.
A proper delete (maxAge: 0) or a named deletion is more reliable.

### Cause 3 — DesktopRouteNav not affected
DesktopRouteNav always read only mfs_role — already correct.

## What the fix is NOT
- Not a middleware issue — middleware reads mfs_session (httpOnly),
  which correctly has secondaryRoles: [] after role picker. Routes are
  properly blocked server-side already.
- Not a DB issue — secondary_roles column and data are correct.
- Not a login API issue — activeRole and sessionSecondaryRoles are set
  correctly. The cookie VALUE is correct. The persistence is the problem.

## Files to change
1. components/RoleNav.tsx
2. app/api/auth/login/route.ts

## Detailed changes

### RoleNav.tsx
Remove all union logic. Go back to reading ONLY mfs_role.
The role picker guarantees this is always a single clean role.
getClientRoles() → getClientRole() returning single Role string.
useEffect: single navItemsForRole(role, t) call — no merging needed.

Before (union):
  reads mfs_role + mfs_secondary_roles
  builds merged array, deduped by href

After (single):
  reads mfs_role only
  calls navItemsForRole(role, t) directly
  no union, no merging

### app/api/auth/login/route.ts
When completing a role-picker session (chosenRole provided),
delete mfs_secondary_roles properly using maxAge: 0.
This ensures the old cookie is explicitly expired in all browsers.

Current: response.cookies.set('mfs_secondary_roles', '', { maxAge: 30 days })
Fix:     response.cookies.set('mfs_secondary_roles', '', { maxAge: 0 })
         This expires the cookie immediately on receipt.

Note: mfs_secondary_roles is still set on initial login (for login
card badges showing +sales etc.) — that stays. Only after the role
picker chooses a specific role should it be cleared.

## What stays the same
- mfs_secondary_roles cookie is still SET on initial login (before picker)
  Used by: login card badges (+sales displayed on Abdel's card)
- mfs_secondary_roles is still cleared properly on logout
- Middleware union logic stays — correct since it reads mfs_session
  which always has secondaryRoles: [] after the picker

## Tests
- npm run test 975 must still pass
- No new unit tests

## Manual smoke tests
- [ ] Abdel logs in → role picker → picks Driver
      Nav: My Route | Complaints | Kudos ONLY (no Visits, no Pricing)
- [ ] Log out → log back in → picks Sales
      Nav: Complaints | Visits | Pricing | Compliments | Routes | Runs ONLY
      (no My Route)
- [ ] Single-role users (Daz=warehouse, Mehmet=sales) → unchanged
- [ ] Admin (Hakan) → unchanged full nav
- [ ] Login card for Abdel still shows "+sales" badge (mfs_secondary_roles
      is still set DURING login, before picker is shown)
