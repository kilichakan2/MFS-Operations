/**
 * lib/domain/Pricing.ts
 *
 * The Pricing domain vocabulary (F-15). Pure TypeScript — no framework
 * import, no vendor import. The app's OWN clean shape for a price
 * agreement and its lines; every field is camelCase, never the
 * database's snake_case spelling (ADR-0002 line 27 — vendor types stop
 * at the adapter door).
 *
 * Mirrors the Routes domain shape (F-14) exactly: two read shapes, small
 * write-echo shapes, explicit input types. The `CreatedAgreement` /
 * `PatchedAgreement` shapes exist ONLY so the adapter can return exactly
 * the handful of fields each write endpoint echoes back today, keeping the
 * wire output byte-identical after PR2.
 *
 * Schema anchor (supabase/migrations/20260101000000_baseline.sql):
 *   price_agreements: reference_number auto MFS-YYYY-NNNN (UNIQUE);
 *     customer_id nullable uuid (FK customers, SET NULL); prospect_name
 *     nullable; agreed_by NOT NULL uuid (FK users); status NOT NULL
 *     (draft|active|cancelled, default draft); valid_from NOT NULL date;
 *     valid_until nullable date; notes nullable; created_at/updated_at
 *     NOT NULL timestamptz. CHECK customer_or_prospect: customer_id NOT
 *     NULL OR trimmed prospect_name length > 0.
 *   price_agreement_lines: agreement_id NOT NULL (FK, CASCADE); product_id
 *     nullable (FK products, SET NULL); product_name_override nullable;
 *     price numeric NOT NULL (CHECK price > 0); unit NOT NULL
 *     (per_kg|per_box, default per_kg); notes nullable; position NOT NULL
 *     int default 0; created_at NOT NULL. CHECK product_or_override:
 *     product_id NOT NULL OR trimmed product_name_override length > 0.
 *
 * `isExpired` is COMPUTED on read, never stored — there is no 'expired'
 * status value. It is `status === 'active' && validUntil != null &&
 * validUntil < londonToday()`, mapped identically in BOTH adapters.
 */

/** Agreement lifecycle (DB `agreement_status` enum — no 'expired' value). */
export type AgreementStatus = "draft" | "active" | "cancelled";
/** Price unit (DB `price_unit` enum). */
export type PriceUnit = "per_kg" | "per_box";

/**
 * One price line, with the product's display fields already resolved.
 * `productName` is `product.name ?? productNameOverride ?? 'Unknown'`,
 * matching the route mapping verbatim. `isFreetext` is `!productId`.
 */
export interface PriceLine {
  readonly id: string;
  readonly productId: string | null;
  readonly productNameOverride: string | null;
  readonly price: number;
  readonly unit: PriceUnit;
  readonly position: number;
  readonly notes: string | null;
  /** product.name ?? productNameOverride ?? 'Unknown' (route mapping). */
  readonly productName: string;
  readonly boxSize: string | null;
  readonly code: string | null;
  /** true when the line has no linked product (free-text). */
  readonly isFreetext: boolean;
}

/**
 * A price agreement header (camelCase domain shape). Carries the computed
 * read fields the wire returns: `isExpired` (computed, never stored),
 * `customerName` (customer.name ?? prospectName ?? 'Unknown'), `isProspect`
 * (!customerId), and the rep join (`repId`/`repName`).
 */
export interface PriceAgreement {
  readonly id: string;
  readonly referenceNumber: string;
  readonly status: AgreementStatus;
  readonly customerId: string | null;
  readonly prospectName: string | null;
  readonly agreedBy: string;
  readonly validFrom: string; // YYYY-MM-DD
  readonly validUntil: string | null; // YYYY-MM-DD
  readonly notes: string | null;
  readonly createdAt: string; // ISO-8601
  readonly updatedAt: string; // ISO-8601
  /** Computed on read: active && validUntil != null && validUntil < today. */
  readonly isExpired: boolean;
  /** customer.name ?? prospectName ?? 'Unknown' (route mapping). */
  readonly customerName: string;
  /** true when there is no linked customer (prospect agreement). */
  readonly isProspect: boolean;
  /** rep (agreed_by) join — id, or null when unresolved. */
  readonly repId: string | null;
  /** rep.name ?? 'Unknown' (route mapping). */
  readonly repName: string;
}

/** An agreement header WITH its ordered lines — the full read aggregate. */
export interface PriceAgreementWithLines extends PriceAgreement {
  /** Lines sorted by position ascending. */
  readonly lines: readonly PriceLine[];
}

/**
 * One line as supplied on create/replace (the POST body becomes this).
 * `position` is nullable → the adapter defaults it to the array index,
 * matching today's `l.position ?? i`.
 */
export interface CreateLineInput {
  readonly productId: string | null;
  readonly productNameOverride: string | null;
  readonly price: number;
  readonly unit: PriceUnit;
  readonly notes: string | null;
  readonly position: number | null;
}

/** Service-facing create input (what a POST /api/pricing body becomes). */
export interface CreateAgreementInput {
  readonly customerId: string | null;
  readonly prospectName: string | null;
  readonly agreedBy: string; // from x-mfs-user-id
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly notes: string | null;
  readonly lines: readonly CreateLineInput[];
}

/**
 * Partial header patch (the 6 PATCH-able fields of PATCH /api/pricing/[id]).
 * The `'' → null` normalisation stays in the route for PR1; the type only
 * carries the fields.
 */
export interface UpdateAgreementInput {
  readonly status?: AgreementStatus;
  readonly validFrom?: string;
  readonly validUntil?: string | null;
  readonly notes?: string | null;
  readonly customerId?: string | null;
  readonly prospectName?: string | null;
}

/** Partial line patch (the 6 PATCH-able fields of PATCH /api/pricing/lines/[lineId]). */
export interface UpdateLineInput {
  readonly productId?: string | null;
  readonly productNameOverride?: string | null;
  readonly price?: number;
  readonly unit?: PriceUnit;
  readonly notes?: string | null;
  readonly position?: number;
}

/**
 * The exact fields today's POST /api/pricing selects back and echoes —
 * `{ id, reference_number }` in the wire, camelCase here.
 */
export interface CreatedAgreement {
  readonly id: string;
  readonly referenceNumber: string;
}

/**
 * The exact fields today's PATCH /api/pricing/[id] selects back —
 * `{ id, reference_number, status, updated_at }` in the wire, camelCase here.
 */
export interface PatchedAgreement {
  readonly id: string;
  readonly referenceNumber: string;
  readonly status: AgreementStatus;
  readonly updatedAt: string;
}
