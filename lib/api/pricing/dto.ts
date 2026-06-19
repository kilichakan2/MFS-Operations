/**
 * lib/api/pricing/dto.ts
 *
 * DTO translators: the Pricing domain shapes (camelCase) → the EXACT legacy
 * snake_case wire shapes the pricing screens read today (F-15 PR2). Pure
 * functions, no I/O, unit-tested key-for-key AND key-order — these are the
 * wire-compat tripwire for the route re-point (Risk R2).
 *
 * Key ORDER is load-bearing: NextResponse.json serialises object keys in
 * insertion order, so the order below must match each route's current
 * response literal verbatim:
 *   - agreement → app/api/pricing/[id]/route.ts GET literal
 *   - line      → shapeLine()
 *   - email     → the PATCH activation-email map
 *
 * `is_freetext` on every shape mirrors the domain `isFreetext` (`!productId`),
 * the app-wide definition (ADR-0002 line 27 — vendor types stop at the
 * adapter; the domain is the single source). The old PATCH email path
 * computed it as `!product.name`; the two differ only for a prod-impossible
 * orphaned product (F-15 PR2 plan Decision R4 — domain value chosen).
 */
import type {
  PriceAgreement,
  PriceAgreementWithLines,
  PriceLine,
} from "@/lib/domain";
import type { PricingEmailData } from "@/lib/pricing-email";

// ─── Wire shapes (what the screens were built to read) ───────

export interface PriceLineDto {
  id: string;
  product_id: string | null;
  product_name_override: string | null;
  product_name: string;
  box_size: string | null;
  code: string | null;
  price: number;
  unit: string;
  notes: string | null;
  position: number;
  is_freetext: boolean;
}

export interface PriceAgreementDto {
  id: string;
  reference_number: string;
  status: string;
  is_expired: boolean;
  valid_from: string;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  customer_name: string;
  is_prospect: boolean;
  rep_id: string | null;
  rep_name: string;
  lines: PriceLineDto[];
}

// ─── Translators ─────────────────────────────────────────────

/** One line → the legacy `shapeLine` wire shape (exact key order). */
export function toLineWireDto(l: PriceLine): PriceLineDto {
  return {
    id: l.id,
    product_id: l.productId,
    product_name_override: l.productNameOverride,
    product_name: l.productName,
    box_size: l.boxSize,
    code: l.code,
    price: l.price,
    unit: l.unit,
    notes: l.notes,
    position: l.position,
    is_freetext: l.isFreetext,
  };
}

/**
 * Agreement header → the legacy GET wire shape (exact key order, `lines`
 * last). Accepts a header-only `PriceAgreement` (list rows) or the full
 * `PriceAgreementWithLines`; absent lines serialise as `[]`. The GET-list
 * route today emits `lines: [...]` per row, so this is byte-identical.
 */
export function toAgreementWireDto(
  a: PriceAgreement | PriceAgreementWithLines,
): PriceAgreementDto {
  const lines = "lines" in a ? a.lines : [];
  return {
    id: a.id,
    reference_number: a.referenceNumber,
    status: a.status,
    is_expired: a.isExpired,
    valid_from: a.validFrom,
    valid_until: a.validUntil,
    notes: a.notes,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
    customer_id: a.customerId,
    customer_name: a.customerName,
    is_prospect: a.isProspect,
    rep_id: a.repId,
    rep_name: a.repName,
    lines: lines.map(toLineWireDto),
  };
}

// ─── Activation-email mapping ────────────────────────────────

/**
 * Full agreement aggregate → `PricingEmailData` (the activation-email body
 * shape, lib/pricing-email.ts). Exact key order; `is_freetext` uses the
 * domain value (Decision R4). `validUntil`/`notes`/line `notes` are already
 * `string | null` on the domain — no coalescing changes the value.
 */
export function toPricingEmailData(
  a: PriceAgreementWithLines,
): PricingEmailData {
  return {
    id: a.id,
    reference_number: a.referenceNumber,
    customer_name: a.customerName,
    is_prospect: a.isProspect,
    rep_name: a.repName,
    valid_from: a.validFrom,
    valid_until: a.validUntil ?? null,
    notes: a.notes ?? null,
    lines: a.lines.map((l) => ({
      product_name: l.productName,
      box_size: l.boxSize,
      price: l.price,
      unit: l.unit,
      notes: l.notes ?? null,
      is_freetext: l.isFreetext,
    })),
  };
}
