/**
 * lib/adapters/fake/DiscrepanciesRepository.ts
 *
 * In-memory implementation of `DiscrepanciesRepository`
 * (lib/ports/DiscrepanciesRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage of DOMAIN types. The faithful twin of the Supabase
 * adapter: it reproduces the same observable behaviour so the DashboardService
 * unit tests (and the shared contract) can rely on parity.
 *
 * It deliberately mirrors the database / route hard rules so both adapters
 * answer identically:
 *   - listToday: window [from,to] inclusive, newest first, capped at 50, RAW
 *     reason carried (no `.replace`).
 *   - listWeekRollup: window [from,to] inclusive, no limit, trimmed
 *     { reason, productName } rows.
 *   - findDetailById: null on miss (define errors out of existence).
 *
 * Construction:
 *   - `createFakeDiscrepanciesRepository(seed?)` factory — tests inject the
 *     people/customers/products the joins resolve against + the seeded rows,
 *     mirroring `createFakeVisitsRepository`.
 *   - `fakeDiscrepanciesRepository` singleton — empty; exists for barrel
 *     symmetry.
 */

import type {
  DiscrepancyToday,
  DiscrepancyWeekRollupRow,
  DiscrepancyDetail,
  DiscrepancyStatus,
} from "@/lib/domain";
import type {
  DiscrepanciesRepository,
  DiscrepancyWindow,
} from "@/lib/ports";

/** A trimmed person reference the logged-by join resolves against. */
export interface FakeDiscrepanciesPersonRef {
  readonly id: string;
  readonly name: string;
}
/** A trimmed customer reference the customer join resolves against. */
export interface FakeDiscrepanciesCustomerRef {
  readonly id: string;
  readonly name: string;
}
/** A trimmed product reference the product join resolves against. */
export interface FakeDiscrepanciesProductRef {
  readonly id: string;
  readonly name: string;
  readonly category?: string | null;
}

/** A pre-seeded discrepancy row. Only the fields the reads touch are required;
 *  the rest default sensibly. */
export interface FakeDiscrepancySeed {
  readonly id: string;
  readonly createdAt: string;
  readonly userId?: string | null;
  readonly customerId?: string | null;
  readonly productId?: string | null;
  readonly status: DiscrepancyStatus;
  readonly reason: string; // RAW enum value
  readonly orderedQty?: number | null;
  readonly sentQty?: number | null;
  readonly unit?: string | null;
  readonly note?: string | null;
}

/** Optional join directories + seed rows so reads return populated joins/data. */
export interface FakeDiscrepanciesSeed {
  readonly people?: Readonly<Record<string, FakeDiscrepanciesPersonRef>>;
  readonly customers?: Readonly<Record<string, FakeDiscrepanciesCustomerRef>>;
  readonly products?: Readonly<Record<string, FakeDiscrepanciesProductRef>>;
  readonly discrepancies?: readonly FakeDiscrepancySeed[];
}

interface StoredDiscrepancy {
  id: string;
  createdAt: string;
  userId: string | null;
  customerId: string | null;
  productId: string | null;
  status: DiscrepancyStatus;
  reason: string;
  orderedQty: number | null;
  sentQty: number | null;
  unit: string | null;
  note: string | null;
}

/** Newest-first by created_at, tie-broken by descending id (later insert =
 *  higher id), so same-instant ordering is deterministic in tests. */
function byNewestThenId(
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string },
): number {
  if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
  return b.id.localeCompare(a.id);
}

export function createFakeDiscrepanciesRepository(
  seed?: FakeDiscrepanciesSeed,
): DiscrepanciesRepository {
  const rows = new Map<string, StoredDiscrepancy>();
  const people = seed?.people ?? {};
  const customers = seed?.customers ?? {};
  const products = seed?.products ?? {};

  for (const d of seed?.discrepancies ?? []) {
    rows.set(d.id, {
      id: d.id,
      createdAt: d.createdAt,
      userId: d.userId ?? null,
      customerId: d.customerId ?? null,
      productId: d.productId ?? null,
      status: d.status,
      reason: d.reason,
      orderedQty: d.orderedQty ?? null,
      sentQty: d.sentQty ?? null,
      unit: d.unit ?? null,
      note: d.note ?? null,
    });
  }

  function repNameOf(userId: string | null): string | null {
    if (!userId) return null;
    return people[userId]?.name ?? null;
  }
  function customerNameOf(customerId: string | null): string | null {
    if (!customerId) return null;
    return customers[customerId]?.name ?? null;
  }
  function productNameOf(productId: string | null): string | null {
    if (!productId) return null;
    return products[productId]?.name ?? null;
  }

  return {
    async listToday(
      window: DiscrepancyWindow,
    ): Promise<readonly DiscrepancyToday[]> {
      return [...rows.values()]
        .filter((d) => d.createdAt >= window.from && d.createdAt <= window.to)
        .sort(byNewestThenId)
        .slice(0, 50)
        .map((d) => ({
          id: d.id,
          createdAt: d.createdAt,
          status: d.status,
          reason: d.reason, // RAW
          orderedQty: d.orderedQty,
          sentQty: d.sentQty,
          customerName: customerNameOf(d.customerId),
          productName: productNameOf(d.productId),
          loggedByName: repNameOf(d.userId),
        }));
    },

    async listWeekRollup(
      window: DiscrepancyWindow,
    ): Promise<readonly DiscrepancyWeekRollupRow[]> {
      return [...rows.values()]
        .filter((d) => d.createdAt >= window.from && d.createdAt <= window.to)
        .sort(byNewestThenId)
        .map((d) => ({
          reason: d.reason, // RAW
          productName: productNameOf(d.productId),
        }));
    },

    async findDetailById(id: string): Promise<DiscrepancyDetail | null> {
      const d = rows.get(id);
      if (!d) return null;
      const product = d.productId ? products[d.productId] : undefined;
      return {
        id: d.id,
        createdAt: d.createdAt,
        status: d.status,
        reason: d.reason, // RAW
        orderedQty: d.orderedQty,
        sentQty: d.sentQty,
        unit: d.unit,
        note: d.note,
        customerId: d.customerId,
        customerName: customerNameOf(d.customerId),
        productId: d.productId,
        productName: productNameOf(d.productId),
        productCategory: product?.category ?? null,
        loggedByName: repNameOf(d.userId),
      };
    },
  };
}

export const fakeDiscrepanciesRepository: DiscrepanciesRepository =
  createFakeDiscrepanciesRepository();
