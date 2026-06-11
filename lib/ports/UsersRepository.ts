/**
 * lib/ports/UsersRepository.ts
 *
 * The Users port — minimal, read-only, Orders-scoped.
 *
 * **F-13 (Users + Auth) absorbs and expands this port.** This file is
 * its absorption seed: F-13 grows it into the full staff-management
 * interface (CRUD, PIN/password concerns, role administration). Until
 * then the surface is exactly one lookup, because Orders' use of
 * Users is read-only and lookup-by-id only:
 *   - KDS line-done validates the tapping butcher (exists, active,
 *     role in ['butcher', 'warehouse']) — today inline at
 *     `app/api/kds/lines/[lineId]/done/route.ts:59-73`.
 *   - Picking-list resolves the printer's display name — today inline
 *     at `app/api/orders/[id]/picking-list/route.ts:153-158`.
 * Adding more methods now would be speculative generality (APOSD
 * § "general-purpose by accident").
 *
 * ADR-0002 contract honoured: same as OrdersRepository (depth rule,
 * vendor-types-never-cross, define-errors-out-of-existence on reads).
 */

import type { UserSummary } from "@/lib/domain";

export interface UsersRepository {
  /**
   * Read a user by id.
   *
   * What this hides:
   *   - The column projection (id, name, role, active) — callers do
   *     not write a SELECT and never see pin_hash / password_hash.
   *   - The single-row semantics — adapter returns domain `null` on
   *     no match.
   *
   * Caller responsibility:
   *   The caller checks `active` / `role` itself (the KDS line-done
   *   use-case needs to distinguish "no such user" 404 from "inactive"
   *   403 from "wrong role" 403). The port does not pre-filter.
   *
   * @returns The user if found; `null` on no match (APOSD §11 —
   *   define errors out of existence; never throws NotFoundError).
   * @throws  ServiceError on DB failure.
   */
  findUserById(id: string): Promise<UserSummary | null>;
}
