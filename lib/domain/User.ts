/**
 * lib/domain/User.ts
 *
 * Minimal user projection the Orders bounded context needs today.
 *
 * Same minimalism rationale as `Customer.ts` / `Product.ts`. The 4
 * fields here are exactly what F-08's two consumers use:
 *   - the KDS line-done use-case (`lib/usecases/kdsLineDone.ts`)
 *     validates the tapping butcher: exists, `active`, role in
 *     ['butcher', 'warehouse'];
 *   - the picking-list use-case (`lib/usecases/pickingList.ts`)
 *     resolves the printing user's display name for the sheet footer.
 *
 * Why `role` is a plain `string`, not the `Role` union:
 *   The canonical `Role` union currently lives at
 *   `lib/observability/Caller.ts` (ARCH-FU-01) and importing
 *   observability into `lib/domain` would invert the dependency
 *   direction. F-13 (Users + Auth) moves `Role` to
 *   `lib/domain/Role.ts` and tightens this field to the union.
 *
 * F-13 absorbs/expands this projection into the full staff-management
 * domain model. Until then it stays deliberately tiny.
 */

/**
 * A user as the Orders domain sees it. Read-only projection — there
 * is no write path through the Orders bounded context.
 */
export interface UserSummary {
  readonly id: string;
  readonly name: string;
  /** Plain string today; tightened to the Role union in F-13. */
  readonly role: string;
  readonly active: boolean;
}
