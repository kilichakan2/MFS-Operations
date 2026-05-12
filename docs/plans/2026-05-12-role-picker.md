# Role Picker — Multi-role door selector

## Goal
Users with secondary roles get a door selector after PIN.
They pick which mode they're in. Session = single-role. Nav = clean.

## Flow
1. Tap card → PIN (unchanged)
2. PIN verified + secondary_roles exist → { requiresRolePicker: true, roles }
   No cookies set. Login page shows role picker.
3. Tap role card → re-submit { name, credential: pin, chosenRole }
4. Session set with role: chosenRole, secondaryRoles: [] → redirect

## Files
1. app/api/auth/login/route.ts
2. app/login/page.tsx
