/**
 * lib/domain/Session.ts
 *
 * The session claims the app states about a logged-in user — exactly
 * the four facts today's `mfs_session` cookie carries (T1 adds the
 * signature, it does not redesign the badge).
 *
 * Why `role` is a plain `string`, not the `Role` union:
 *   Same reason as `lib/domain/User.ts` — the canonical `Role` union
 *   lives at `lib/observability/Caller.ts` (ARCH-FU-01) and importing
 *   observability into `lib/domain` would invert the dependency
 *   direction. The middleware never validated role strings (unknown
 *   roles simply match no permissions), and T1 must not change
 *   authorisation behaviour. F-13 tightens this to the union.
 */

/**
 * What a session asserts: who you are (`userId`), your display name,
 * your active role, and any extra roles granted for this session.
 */
export interface SessionClaims {
  userId: string;
  name: string;
  role: string;
  secondaryRoles?: string[];
}
