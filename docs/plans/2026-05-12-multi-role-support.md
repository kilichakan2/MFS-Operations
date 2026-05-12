# Multi-role support — Option B
**Created:** 2026-05-12
**Status:** Plan — awaiting approval

## Goal
Allow a staff member to have a primary role + one or more secondary roles.
Use case: Abdel is primary `driver` + secondary `sales`.
He gets permissions of both roles. Home screen = driver. PIN auth unchanged.

## Confirmed decisions
- Admin NEVER a secondary role — enforced in UI (filtered from secondary options) and API (strip if present)
- `mfs_secondary_roles` client-readable cookie added alongside `mfs_role`
  So client-side UI (login cards, nav, role badges) reflects secondary roles too
  Format: comma-separated string e.g. "sales" or "sales,warehouse"
  Empty string if no secondary roles

## Codebase findings (full grill)

### Session cookie structure
`mfs_session` = JSON.stringify({ userId, name, role }) — httpOnly, 30 days
`mfs_role` = role string — client-readable, for nav rendering
Session type in middleware: `{ userId: string; name: string; role: string }`

### Middleware permission check
```
const { role } = session
const permitted = ROLE_PERMISSIONS[role] ?? []
const isPermitted = permitted.some(p => pathname.startsWith(p))
```
Single role → single permission set. Must compute union of primary + secondary.

### Login route
Reads `user.role` → ROLE_ROUTES[user.role] → redirect
Sets mfs_session with { userId, name, role } only
Does NOT fetch secondary_roles — needs to

### api/routes/users route.ts
`.in('role', ['driver','sales'])` — Supabase array filter
For secondary roles, must also include users where secondary_roles @> '{driver}' etc.
Postgres: `.or('role.in.(driver,sales),secondary_roles.cs.{driver},secondary_roles.cs.{sales}')`

### cash/page.tsx
`.filter(u => u.role === 'driver')` — client-side filter after fetch
For secondary roles: also include u.secondary_roles?.includes('driver')

### routes/page.tsx
Displays `u.role` in dropdown — cosmetic, shows primary role only (fine)

### screen5/page.tsx (user management)
Single role select. Needs multi-select for secondary roles.
UserRole type is a local type — no shared definition to change.

### admin/users API
POST: inserts single role. Needs to accept secondary_roles array.
PATCH: no role field update currently (only credential/active). Needs role + secondary_roles update.

### HACCP API routes
All check: `req.cookies.get('mfs_role')?.value` OR `req.headers.get('x-mfs-user-role')`
Abdel (driver+sales) doesn't need HACCP access — no change needed for HACCP routes.
This is only relevant if someone has e.g. warehouse + butcher secondary — but that's
not the current use case. HACCP routes are fine as-is.

## DB migration
```sql
ALTER TABLE users
  ADD COLUMN secondary_roles text[] NOT NULL DEFAULT '{}';
```
No constraint needed — text[] accepts any values.
Existing users get empty array (no secondary roles) by default.

## Files to change
1. DB migration — add secondary_roles column
2. `middleware.ts` — compute union permissions + store secondary_roles in session
3. `app/api/auth/login/route.ts` — fetch secondary_roles, include in session cookie
4. `app/api/admin/users/route.ts` — include secondary_roles in GET + POST
5. `app/api/admin/users/[id]/route.ts` — allow PATCH of secondary_roles
6. `app/api/routes/users/route.ts` — include users with driver/sales in secondary_roles
7. `app/screen5/page.tsx` — add secondary roles multi-select to user management UI
8. `app/cash/page.tsx` — include users with driver in secondary_roles

## Steps
- [ ] 1. DB migration: add secondary_roles text[] NOT NULL DEFAULT '{}'
- [ ] 2. Login route: fetch secondary_roles, include in mfs_session cookie
- [ ] 3. Middleware: update session type, compute union permissions
- [ ] 4. Admin users API (GET + POST + PATCH): handle secondary_roles
- [ ] 5. Routes users API: OR filter for secondary_roles
- [ ] 6. Cash page: client filter includes secondary_roles
- [ ] 7. Screen5: secondary roles multi-select UI
- [ ] 8. npm run test — all pass
- [ ] 9. npx tsc --noEmit — clean

## Detail

### Login route change
Fetch: `.select('id, name, role, secondary_roles, pin_hash, password_hash')` (add secondary_roles)
Session cookie: JSON.stringify({ userId, name, role, secondaryRoles: user.secondary_roles })
Return JSON: include secondaryRoles in response

### Middleware session type + permission check
```ts
let session: { userId: string; name: string; role: string; secondaryRoles?: string[] }
const allRoles = [session.role, ...(session.secondaryRoles ?? [])]
const permitted = allRoles.flatMap(r => ROLE_PERMISSIONS[r] ?? [])
const isPermitted = permitted.some(p => pathname.startsWith(p))
// Home redirect still uses primary role only
```
x-mfs-user-role header: still sets primary role (most API routes only need primary)
Add x-mfs-secondary-roles header: comma-separated secondary roles (for future use)

### Admin users GET
Add secondary_roles to select: `'id, name, role, secondary_roles, active, ...'`

### Admin users POST
Accept secondary_roles in body (optional, default [])
Insert with secondary_roles

### Admin users PATCH
Accept secondary_roles in body
Add to updates if present

### Routes users API
Change `.in('role', ['driver', 'sales'])` to OR query:
```ts
.or(`role.in.(driver,sales),secondary_roles.cs.{driver},secondary_roles.cs.{sales}`)
```

### Cash page driver filter
```ts
.filter(u => u.role === 'driver' || (u.secondary_roles ?? []).includes('driver'))
```

### Screen5 user management UI changes
- Add `secondary_roles: string[]` to User interface
- Add secondary roles multi-select below primary role select (for add user form)
- Show secondary role badges on each user row
- Add secondary roles editing to existing reset/edit flow
- Available secondary roles = all roles EXCEPT the primary role selected
- POST/PATCH body: include secondary_roles

### Abdel specifically
After migration: UPDATE users SET secondary_roles = '{sales}' WHERE name = 'Abdel'
This gives him driver (primary) + sales (secondary) immediately.

## Tests
- npm run test 975 must still pass
- No new unit tests for this feature (UI + middleware)

## Manual smoke tests
- [ ] Abdel logs in → goes to /driver (primary role home)
- [ ] Abdel can access /complaints, /visits, /routes (sales permissions)
- [ ] Abdel cannot access /screen4, /cash (admin/office only)
- [ ] Screen5 → edit Abdel → shows Driver primary + Sales secondary badge
- [ ] Route planner → assignee dropdown → Abdel appears (driver+sales OR filter)
- [ ] Add new user with primary=warehouse secondary=[butcher] → both HACCP routes accessible
- [ ] User with no secondary roles → unchanged behaviour

## Risks
- mfs_session cookie format change: existing sessions (no secondaryRoles field) still valid
  because secondaryRoles defaults to [] if missing — backward compatible
- Postgres cs (contains) operator for text[]: 'cs' = contains (array contains element)
  Syntax: `.or('secondary_roles.cs.{driver}')` — verify with Supabase JS client
  Alternative if cs fails: use raw filter `.filter('secondary_roles', 'cs', '{driver}')`
- screen5 multi-select: admin must be excluded from secondary roles
  (admin requires password_hash not pin_hash — mixing with secondary would be confusing)
  Rule: secondary_roles cannot contain 'admin'
