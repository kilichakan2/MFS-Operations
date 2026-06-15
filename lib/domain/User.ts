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
 * `role` is the `Role` union (tightened from `string` in F-13 PR1,
 * ARCH-FU-01): the canonical role vocabulary now lives in the domain
 * layer at `lib/domain/Role.ts`, so this field references it directly
 * without inverting the dependency direction.
 *
 * F-13 absorbs/expands this projection into the full staff-management
 * domain model. Until then it stays deliberately tiny.
 */

import type { Role } from "./Role";

/**
 * A user as the Orders domain sees it. Read-only projection — there
 * is no write path through the Orders bounded context.
 */
export interface UserSummary {
  readonly id: string;
  readonly name: string;
  readonly role: Role;
  readonly active: boolean;
}
