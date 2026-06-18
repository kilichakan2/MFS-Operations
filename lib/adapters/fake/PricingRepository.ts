/**
 * lib/adapters/fake/PricingRepository.ts
 *
 * In-memory implementation of `PricingRepository`
 * (lib/ports/PricingRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage of DOMAIN types. The faithful twin of the
 * Supabase adapter: it passes the SAME shared contract suite, so the Fake
 * can never drift from the real DB's behaviour.
 *
 * It deliberately mirrors the database's hard rules so both adapters
 * answer the contract identically:
 *   - CHECK customer_or_prospect → create throws if neither customerId nor
 *     a trimmed prospectName is supplied.
 *   - CHECK product_or_override → a line with no productId and no trimmed
 *     override is rejected (filtered on create, throws on addLine).
 *   - CHECK price > 0 → a line with price <= 0 is rejected.
 *   - `isExpired` computed identically: active && validUntil != null &&
 *     validUntil < londonToday().
 *   - replaceLines is atomic (delete-all-then-insert, empty array allowed).
 *   - deleting an agreement cascades its lines.
 *
 * Construction:
 *   - `createFakePricingRepository(opts?)` factory — tests inject the
 *     people/customers/products the joins resolve against (so reads return
 *     a populated customerName/repName/productName).
 *   - `fakePricingRepository` singleton — empty; exists for barrel symmetry.
 */

import type {
  PriceAgreement,
  PriceAgreementWithLines,
  PriceLine,
  CreateAgreementInput,
  CreateLineInput,
  UpdateAgreementInput,
  UpdateLineInput,
  CreatedAgreement,
  PatchedAgreement,
  AgreementStatus,
  PriceUnit,
} from "@/lib/domain";
import type { PricingRepository, ListAgreementsFilter } from "@/lib/ports";
import { ServiceError } from "@/lib/errors";
import { londonToday } from "@/lib/dates";

/** A trimmed customer reference the customer join resolves against. */
export interface FakeCustomerRef {
  readonly id: string;
  readonly name: string;
}
/** A trimmed person reference the rep (agreed_by) join resolves against. */
export interface FakePersonRef {
  readonly id: string;
  readonly name: string;
}
/** A trimmed product reference the line product join resolves against. */
export interface FakeProductRef {
  readonly id: string;
  readonly name: string;
  readonly boxSize: string | null;
  readonly code: string | null;
}

/** Optional join directories so reads return populated joins. */
export interface FakePricingSeed {
  /** user id → person (rep / agreed_by join resolves here). */
  readonly people?: Readonly<Record<string, FakePersonRef>>;
  /** customer id → customer (header customer join resolves here). */
  readonly customers?: Readonly<Record<string, FakeCustomerRef>>;
  /** product id → product (line product join resolves here). */
  readonly products?: Readonly<Record<string, FakeProductRef>>;
}

/** Internal stored header (domain-ish; joins/computed fields derived on read). */
interface StoredAgreement {
  id: string;
  referenceNumber: string;
  status: AgreementStatus;
  customerId: string | null;
  prospectName: string | null;
  agreedBy: string;
  validFrom: string;
  validUntil: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Internal stored line. */
interface StoredLine {
  id: string;
  agreementId: string;
  productId: string | null;
  productNameOverride: string | null;
  price: number;
  unit: PriceUnit;
  notes: string | null;
  position: number;
}

let fakeIdCounter = 0;
function nextId(): string {
  fakeIdCounter += 1;
  const suffix = String(fakeIdCounter).padStart(12, "0");
  return `00000000-0000-0000-0000-${suffix}`;
}

let fakeRefCounter = 0;
function nextRef(): string {
  fakeRefCounter += 1;
  return `MFS-2026-${String(fakeRefCounter).padStart(4, "0")}`;
}

/** True when neither a customer nor a non-blank prospect name is present. */
function violatesCustomerOrProspect(
  customerId: string | null,
  prospectName: string | null,
): boolean {
  return !customerId && !(prospectName ?? "").trim();
}

/** True when a line satisfies neither product_or_override nor price > 0. */
function lineIsValid(input: CreateLineInput): boolean {
  if (!input.price || input.price <= 0) return false;
  if (!input.productId && !(input.productNameOverride ?? "").trim()) {
    return false;
  }
  return true;
}

export function createFakePricingRepository(
  seed?: FakePricingSeed,
): PricingRepository {
  const agreements = new Map<string, StoredAgreement>();
  const lines = new Map<string, StoredLine>();
  const people = seed?.people ?? {};
  const customers = seed?.customers ?? {};
  const products = seed?.products ?? {};

  function customerName(
    customerId: string | null,
    prospectName: string | null,
  ): string {
    const c = customerId ? customers[customerId] : undefined;
    return c?.name ?? prospectName ?? "Unknown";
  }

  function repFor(agreedBy: string): FakePersonRef | undefined {
    return people[agreedBy];
  }

  function linesForAgreement(agreementId: string): StoredLine[] {
    return [...lines.values()]
      .filter((l) => l.agreementId === agreementId)
      .sort((a, b) => a.position - b.position);
  }

  function toPriceLine(l: StoredLine): PriceLine {
    const p = l.productId ? products[l.productId] : undefined;
    return {
      id: l.id,
      productId: l.productId,
      productNameOverride: l.productNameOverride,
      price: Number(l.price),
      unit: l.unit,
      position: l.position,
      notes: l.notes,
      productName: p?.name ?? l.productNameOverride ?? "Unknown",
      boxSize: p?.boxSize ?? null,
      code: p?.code ?? null,
      isFreetext: !l.productId,
    };
  }

  function toAgreement(a: StoredAgreement, today: string): PriceAgreement {
    const rep = repFor(a.agreedBy);
    return {
      id: a.id,
      referenceNumber: a.referenceNumber,
      status: a.status,
      customerId: a.customerId,
      prospectName: a.prospectName,
      agreedBy: a.agreedBy,
      validFrom: a.validFrom,
      validUntil: a.validUntil,
      notes: a.notes,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      isExpired:
        a.status === "active" && a.validUntil != null && a.validUntil < today,
      customerName: customerName(a.customerId, a.prospectName),
      isProspect: !a.customerId,
      repId: rep?.id ?? null,
      repName: rep?.name ?? "Unknown",
    };
  }

  function toAgreementWithLines(
    a: StoredAgreement,
    today: string,
  ): PriceAgreementWithLines {
    return {
      ...toAgreement(a, today),
      lines: linesForAgreement(a.id).map(toPriceLine),
    };
  }

  return {
    async listAgreements(
      _filter: ListAgreementsFilter,
    ): Promise<readonly PriceAgreement[]> {
      const today = londonToday();
      // today's GET applies NO agreed_by filter; order created_at desc.
      return [...agreements.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((a) => toAgreement(a, today));
    },

    async getAgreementById(
      id: string,
    ): Promise<PriceAgreementWithLines | null> {
      const a = agreements.get(id);
      return a ? toAgreementWithLines(a, londonToday()) : null;
    },

    async getAgreementForEmail(
      id: string,
    ): Promise<PriceAgreementWithLines | null> {
      const a = agreements.get(id);
      return a ? toAgreementWithLines(a, londonToday()) : null;
    },

    async createAgreement(
      input: CreateAgreementInput,
    ): Promise<CreatedAgreement> {
      // CHECK customer_or_prospect — both adapters reject the same way.
      if (violatesCustomerOrProspect(input.customerId, input.prospectName)) {
        throw new ServiceError(
          'new row for relation "price_agreements" violates check ' +
            'constraint "customer_or_prospect"',
        );
      }
      const id = nextId();
      const now = new Date().toISOString();
      const row: StoredAgreement = {
        id,
        referenceNumber: nextRef(),
        status: "draft", // today's create literal
        customerId: input.customerId,
        prospectName: input.prospectName,
        agreedBy: input.agreedBy,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
        notes: input.notes,
        createdAt: now,
        updatedAt: now,
      };
      agreements.set(id, row);

      // Lines: filter invalid ones exactly as the route does; default
      // position to the (filtered) array index when not pinned.
      const valid = input.lines.filter(lineIsValid);
      valid.forEach((l, i) => {
        const lid = nextId();
        lines.set(lid, {
          id: lid,
          agreementId: id,
          productId: l.productId,
          productNameOverride: l.productNameOverride,
          price: l.price,
          unit: l.unit,
          notes: l.notes,
          position: l.position ?? i,
        });
      });

      return { id: row.id, referenceNumber: row.referenceNumber };
    },

    async updateAgreement(
      id: string,
      patch: UpdateAgreementInput,
    ): Promise<PatchedAgreement | null> {
      const existing = agreements.get(id);
      if (!existing) return null;
      const updated: StoredAgreement = {
        ...existing,
        ...("status" in patch && patch.status !== undefined
          ? { status: patch.status }
          : {}),
        ...("validFrom" in patch && patch.validFrom !== undefined
          ? { validFrom: patch.validFrom }
          : {}),
        ...("validUntil" in patch
          ? { validUntil: patch.validUntil ?? null }
          : {}),
        ...("notes" in patch ? { notes: patch.notes ?? null } : {}),
        ...("customerId" in patch
          ? { customerId: patch.customerId ?? null }
          : {}),
        ...("prospectName" in patch
          ? { prospectName: patch.prospectName ?? null }
          : {}),
        updatedAt: new Date().toISOString(),
      };
      agreements.set(id, updated);
      return {
        id: updated.id,
        referenceNumber: updated.referenceNumber,
        status: updated.status,
        updatedAt: updated.updatedAt,
      };
    },

    async deleteAgreement(id: string): Promise<void> {
      agreements.delete(id);
      for (const [lid, l] of lines) {
        if (l.agreementId === id) lines.delete(lid); // cascade
      }
    },

    async addLine(
      agreementId: string,
      input: CreateLineInput,
    ): Promise<PriceLine> {
      // CHECK price > 0 and product_or_override — both adapters reject the
      // same way (the route validates before insert; the DB enforces too).
      if (!input.price || input.price <= 0) {
        throw new ServiceError(
          'new row for relation "price_agreement_lines" violates check ' +
            'constraint "price_agreement_lines_price_check"',
        );
      }
      if (!input.productId && !(input.productNameOverride ?? "").trim()) {
        throw new ServiceError(
          'new row for relation "price_agreement_lines" violates check ' +
            'constraint "product_or_override"',
        );
      }
      // next position = max existing + 1 (today's computation), unless pinned.
      const existing = linesForAgreement(agreementId);
      const maxPos = existing.reduce((m, l) => Math.max(m, l.position), -1);
      const nextPosition = input.position ?? maxPos + 1;
      const lid = nextId();
      const stored: StoredLine = {
        id: lid,
        agreementId,
        productId: input.productId,
        productNameOverride: input.productNameOverride,
        price: input.price,
        unit: input.unit,
        notes: input.notes,
        position: nextPosition,
      };
      lines.set(lid, stored);
      return toPriceLine(stored);
    },

    async replaceLines(
      agreementId: string,
      incoming: readonly CreateLineInput[],
    ): Promise<number> {
      // Atomic swap (mirrors the replace_agreement_lines RPC): stage every
      // new line first so a bad one aborts the whole replace, THEN delete
      // the old set and commit. Empty array is valid.
      const staged: StoredLine[] = incoming.map((l, i) => {
        if (!l.price || l.price <= 0) {
          throw new ServiceError(
            'new row for relation "price_agreement_lines" violates check ' +
              'constraint "price_agreement_lines_price_check"',
          );
        }
        if (!l.productId && !(l.productNameOverride ?? "").trim()) {
          throw new ServiceError(
            'new row for relation "price_agreement_lines" violates check ' +
              'constraint "product_or_override"',
          );
        }
        return {
          id: nextId(),
          agreementId,
          productId: l.productId,
          productNameOverride: l.productNameOverride,
          price: l.price,
          unit: l.unit,
          notes: l.notes,
          position: l.position ?? i,
        };
      });
      // Commit: delete all old lines for this agreement, then insert staged.
      for (const [lid, l] of lines) {
        if (l.agreementId === agreementId) lines.delete(lid);
      }
      for (const st of staged) lines.set(st.id, st);
      return staged.length;
    },

    async updateLine(
      lineId: string,
      patch: UpdateLineInput,
    ): Promise<PriceLine | null> {
      const existing = lines.get(lineId);
      if (!existing) return null;
      const updated: StoredLine = {
        ...existing,
        ...("productId" in patch ? { productId: patch.productId ?? null } : {}),
        ...("productNameOverride" in patch
          ? { productNameOverride: patch.productNameOverride ?? null }
          : {}),
        ...("price" in patch && patch.price !== undefined
          ? { price: patch.price }
          : {}),
        ...("unit" in patch && patch.unit !== undefined
          ? { unit: patch.unit }
          : {}),
        ...("notes" in patch ? { notes: patch.notes ?? null } : {}),
        ...("position" in patch && patch.position !== undefined
          ? { position: patch.position }
          : {}),
      };
      lines.set(lineId, updated);
      return toPriceLine(updated);
    },

    async deleteLine(lineId: string): Promise<void> {
      lines.delete(lineId);
    },

    async getAgreementOwner(
      id: string,
    ): Promise<{ agreedBy: string; status: AgreementStatus } | null> {
      const a = agreements.get(id);
      return a ? { agreedBy: a.agreedBy, status: a.status } : null;
    },

    async getLineOwner(
      lineId: string,
    ): Promise<{ agreedBy: string } | null> {
      const l = lines.get(lineId);
      if (!l) return null;
      const a = agreements.get(l.agreementId);
      return a ? { agreedBy: a.agreedBy } : null;
    },
  };
}

export const fakePricingRepository: PricingRepository =
  createFakePricingRepository();
