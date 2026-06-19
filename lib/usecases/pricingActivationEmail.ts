/**
 * lib/usecases/pricingActivationEmail.ts
 *
 * Activation-email assembly use-case (F-15 PR2). One business operation —
 * "gather everything the price-agreement activation email needs" — that
 * spans TWO domains: the pricing engine (PricingService, for the full
 * agreement body) and the staff list (UsersRepository, for the recipient
 * addresses).
 *
 * ADR-0002: services never import services; composition of a service plus an
 * extra port lives in lib/usecases/. This is exactly that composition point,
 * modelled on lib/usecases/pickingList.ts (which composes OrdersService +
 * ProductsRepository + UsersRepository). The PATCH route cannot compose two
 * services itself, and PricingService cannot import UsersService — so the
 * pricing+users join lives here.
 *
 * Depth (ADR-0002): not a pass-through. It (a) composes two domains, and (b)
 * OWNS the recipient filter — reproducing the old raw query
 *   users?active=eq.true&role=in.(admin,sales,office)&select=name,email
 * plus pricing-email.ts's `email?.includes('@')` filter — collapsing both
 * into one `string[]` the route hands straight to the mailer. Delete it and
 * that two-domain join + filter must move into the route (which ADR-0002
 * forbids).
 *
 * The email SEND itself is NOT here — the route maps the agreement to
 * PricingEmailData (lib/api/pricing/dto.ts) and calls sendPricingEmail. This
 * use-case is read-only assembly; presentation/HTML stays in the route +
 * pricing-email.ts.
 *
 * Construction: factory (F-07 template); production wiring in
 * lib/wiring/pricing.ts — service-role singletons (no auth change in PR2).
 */
import type { PriceAgreementWithLines } from "@/lib/domain";
import type { UsersRepository } from "@/lib/ports";
import type { PricingService } from "@/lib/services";

/** What one activation-email render needs: the body + the recipient list. */
export interface ActivationEmailResolution {
  readonly agreement: PriceAgreementWithLines;
  readonly recipients: string[];
}

export interface PricingActivationEmail {
  /**
   * Resolve the full agreement + recipient list for an activated agreement.
   * Returns `null` when the agreement no longer exists (the route then skips
   * the email, preserving today's `if (full)` guard).
   *
   * @throws ServiceError on a DB failure in either read (the PATCH route's
   *   outer try/catch swallows it and still returns success — today's
   *   behaviour).
   */
  resolveActivationEmail(
    id: string,
  ): Promise<ActivationEmailResolution | null>;
}

export interface PricingActivationEmailDeps {
  readonly pricing: PricingService;
  readonly users: UsersRepository;
}

export function createPricingActivationEmail(
  deps: PricingActivationEmailDeps,
): PricingActivationEmail {
  const { pricing, users } = deps;

  return {
    async resolveActivationEmail(id) {
      const agreement = await pricing.getAgreementForEmail(id);
      if (agreement === null) return null;

      // Reproduces the old raw query (active admin/sales/office users) plus
      // pricing-email.ts's `email?.includes('@')` filter. Primary-role only,
      // matching today's `role=in.(...)`.
      const all = await users.listUsersByRoles(["admin", "sales", "office"], {
        activeOnly: true,
        orderBy: [],
      });
      const recipients = all
        .filter((u) => u.email?.includes("@"))
        .map((u) => u.email!);

      return { agreement, recipients };
    },
  };
}
