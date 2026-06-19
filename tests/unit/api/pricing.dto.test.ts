/**
 * tests/unit/api/pricing.dto.test.ts
 *
 * F-15 PR2 — DTO translators: domain Pricing types (camelCase) → the EXACT
 * legacy snake_case wire shapes the pricing screens read today. These tests
 * are the wire-compat tripwire (Risk R2): they pin both the key SET and the
 * key ORDER, because NextResponse.json serialises in insertion order and the
 * wire bytes include that order.
 *
 * Source of truth for key order (the routes being re-pointed):
 *   - agreement: app/api/pricing/[id]/route.ts GET literal (lines 57-75)
 *   - line:      shapeLine() (lines 245-257)
 *   - email:     PATCH activation email map (lines 164-173)
 */
import { describe, it, expect } from "vitest";
import {
  toAgreementWireDto,
  toLineWireDto,
  toPricingEmailData,
} from "@/lib/api/pricing/dto";
import type {
  PriceAgreement,
  PriceAgreementWithLines,
  PriceLine,
} from "@/lib/domain";

const LINE: PriceLine = {
  id: "00000000-0000-0000-0000-00000000bb01",
  productId: "00000000-0000-0000-0000-000000000d01",
  productNameOverride: null,
  price: 12.5,
  unit: "per_kg",
  position: 0,
  notes: "extra fine",
  productName: "Lamb Shoulder",
  boxSize: "10kg",
  code: "LMB-SH",
  isFreetext: false,
};

const FREETEXT_LINE: PriceLine = {
  id: "00000000-0000-0000-0000-00000000bb02",
  productId: null,
  productNameOverride: "Custom cut",
  price: 9.9,
  unit: "per_box",
  position: 1,
  notes: null,
  productName: "Custom cut",
  boxSize: null,
  code: null,
  isFreetext: true,
};

const AGREEMENT: PriceAgreementWithLines = {
  id: "00000000-0000-0000-0000-00000000aa01",
  referenceNumber: "MFS-2026-0042",
  status: "active",
  customerId: "00000000-0000-0000-0000-000000000c01",
  prospectName: null,
  agreedBy: "00000000-0000-0000-0000-000000000a01",
  validFrom: "2026-06-01",
  validUntil: "2026-12-31",
  notes: "agreement notes",
  createdAt: "2026-05-30T09:15:00.000Z",
  updatedAt: "2026-05-30T10:00:00.000Z",
  isExpired: false,
  customerName: "Acme Foods",
  isProspect: false,
  repId: "00000000-0000-0000-0000-000000000a01",
  repName: "Sally Sales",
  lines: [LINE, FREETEXT_LINE],
};

// Key order copied verbatim from the route response literals.
const AGREEMENT_KEY_ORDER = [
  "id",
  "reference_number",
  "status",
  "is_expired",
  "valid_from",
  "valid_until",
  "notes",
  "created_at",
  "updated_at",
  "customer_id",
  "customer_name",
  "is_prospect",
  "rep_id",
  "rep_name",
  "lines",
];

const LINE_KEY_ORDER = [
  "id",
  "product_id",
  "product_name_override",
  "product_name",
  "box_size",
  "code",
  "price",
  "unit",
  "notes",
  "position",
  "is_freetext",
];

const EMAIL_KEY_ORDER = [
  "id",
  "reference_number",
  "customer_name",
  "is_prospect",
  "rep_name",
  "valid_from",
  "valid_until",
  "notes",
  "lines",
];

const EMAIL_LINE_KEY_ORDER = [
  "product_name",
  "box_size",
  "price",
  "unit",
  "notes",
  "is_freetext",
];

describe("toLineWireDto", () => {
  it("emits the exact key set in the exact legacy order", () => {
    const dto = toLineWireDto(LINE);
    expect(Object.keys(dto)).toEqual(LINE_KEY_ORDER);
  });

  it("maps values to snake_case verbatim", () => {
    expect(toLineWireDto(LINE)).toEqual({
      id: LINE.id,
      product_id: LINE.productId,
      product_name_override: null,
      product_name: "Lamb Shoulder",
      box_size: "10kg",
      code: "LMB-SH",
      price: 12.5,
      unit: "per_kg",
      notes: "extra fine",
      position: 0,
      is_freetext: false,
    });
  });

  it("is_freetext mirrors the domain (true when no product id)", () => {
    expect(toLineWireDto(FREETEXT_LINE).is_freetext).toBe(true);
    expect(toLineWireDto(FREETEXT_LINE).product_id).toBeNull();
  });
});

describe("toAgreementWireDto", () => {
  it("emits the exact key set in the exact legacy order, lines last", () => {
    const dto = toAgreementWireDto(AGREEMENT);
    expect(Object.keys(dto)).toEqual(AGREEMENT_KEY_ORDER);
  });

  it("maps the header values to snake_case verbatim", () => {
    const dto = toAgreementWireDto(AGREEMENT);
    expect(dto.id).toBe(AGREEMENT.id);
    expect(dto.reference_number).toBe("MFS-2026-0042");
    expect(dto.status).toBe("active");
    expect(dto.is_expired).toBe(false);
    expect(dto.valid_from).toBe("2026-06-01");
    expect(dto.valid_until).toBe("2026-12-31");
    expect(dto.notes).toBe("agreement notes");
    expect(dto.created_at).toBe(AGREEMENT.createdAt);
    expect(dto.updated_at).toBe(AGREEMENT.updatedAt);
    expect(dto.customer_id).toBe(AGREEMENT.customerId);
    expect(dto.customer_name).toBe("Acme Foods");
    expect(dto.is_prospect).toBe(false);
    expect(dto.rep_id).toBe(AGREEMENT.repId);
    expect(dto.rep_name).toBe("Sally Sales");
  });

  it("maps lines through toLineWireDto in order", () => {
    const dto = toAgreementWireDto(AGREEMENT);
    expect(dto.lines).toHaveLength(2);
    expect(Object.keys(dto.lines[0]!)).toEqual(LINE_KEY_ORDER);
    expect(dto.lines.map((l) => l.position)).toEqual([0, 1]);
  });

  it("defensive header-only fallback: a PriceAgreement with no lines field emits lines: []", () => {
    // toAgreementWireDto accepts a header-only PriceAgreement (no lines field)
    // as a defensive fallback — it must never crash on an object that omits
    // `lines`. This is NOT the list's real shape: both the Supabase and Fake
    // adapters now return PriceAgreementWithLines from listAgreements (B1 fix),
    // so the list wire carries populated lines (covered by the case below).
    const headerOnly: PriceAgreement = { ...AGREEMENT };
    // strip the lines property to model an object that omits `lines`
    const { lines: _lines, ...rest } = headerOnly as PriceAgreementWithLines;
    void _lines;
    const dto = toAgreementWireDto(rest as PriceAgreement);
    expect(dto.lines).toEqual([]);
    expect(Object.keys(dto)).toEqual(AGREEMENT_KEY_ORDER);
  });

  it("list-with-lines: a PriceAgreementWithLines emits populated, position-sorted line DTOs", () => {
    // The real list shape after the B1 fix: listAgreements returns
    // PriceAgreementWithLines, so the wire must carry the lines (the list page
    // reads the product count / detail / PDF off this object with no re-fetch).
    // Lines supplied out of order to prove the wire reflects the position sort
    // the adapter applied.
    const listRow: PriceAgreementWithLines = {
      ...AGREEMENT,
      lines: [FREETEXT_LINE, LINE], // positions 1, 0 — out of order on input
    };
    const dto = toAgreementWireDto(listRow);
    expect(dto.lines).toHaveLength(2);
    expect(Object.keys(dto.lines[0]!)).toEqual(LINE_KEY_ORDER);
    expect(Object.keys(dto.lines[1]!)).toEqual(LINE_KEY_ORDER);
    // toAgreementWireDto maps in the order given — the position SORT is the
    // adapter's job (pinned by the contract test); here we assert the DTO
    // faithfully carries the lines + their position field, not re-sorting.
    expect(dto.lines.map((l) => l.position)).toEqual([1, 0]);
    expect(dto.lines[0]!.is_freetext).toBe(true);
    expect(dto.lines[1]!.product_name).toBe("Lamb Shoulder");
  });
});

describe("toPricingEmailData", () => {
  it("emits the exact email DTO key set in order", () => {
    const dto = toPricingEmailData(AGREEMENT);
    expect(Object.keys(dto)).toEqual(EMAIL_KEY_ORDER);
    expect(Object.keys(dto.lines[0]!)).toEqual(EMAIL_LINE_KEY_ORDER);
  });

  it("maps the email body verbatim with null coalescing", () => {
    const dto = toPricingEmailData(AGREEMENT);
    expect(dto).toEqual({
      id: AGREEMENT.id,
      reference_number: "MFS-2026-0042",
      customer_name: "Acme Foods",
      is_prospect: false,
      rep_name: "Sally Sales",
      valid_from: "2026-06-01",
      valid_until: "2026-12-31",
      notes: "agreement notes",
      lines: [
        {
          product_name: "Lamb Shoulder",
          box_size: "10kg",
          price: 12.5,
          unit: "per_kg",
          notes: "extra fine",
          is_freetext: false,
        },
        {
          product_name: "Custom cut",
          box_size: null,
          price: 9.9,
          unit: "per_box",
          notes: null,
          is_freetext: true,
        },
      ],
    });
  });

  it("coalesces validUntil/notes to null (the email DTO allows null)", () => {
    const ongoing: PriceAgreementWithLines = {
      ...AGREEMENT,
      validUntil: null,
      notes: null,
    };
    const dto = toPricingEmailData(ongoing);
    expect(dto.valid_until).toBeNull();
    expect(dto.notes).toBeNull();
  });

  it("email is_freetext uses the domain value (!productId), consistent with the rest of the app", () => {
    // Decision R4: the email uses line.isFreetext (!productId), NOT the old
    // !product.name. Identical in every realistic case; the divergent case is
    // a prod-impossible orphaned product.
    const dto = toPricingEmailData(AGREEMENT);
    expect(dto.lines[0]!.is_freetext).toBe(false); // has productId
    expect(dto.lines[1]!.is_freetext).toBe(true); // no productId
  });
});
