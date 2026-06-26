/**
 * lib/adapters/supabase/DiscrepanciesRepository.ts
 *
 * Supabase implementation of `DiscrepanciesRepository`
 * (lib/ports/DiscrepanciesRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the lib/adapters/supabase
 * tree at .eslintrc.json). The ONLY file that imports the vendor SDK for the
 * Discrepancies DB.
 *
 * Boundary discipline (ADR-0002 line 27): PostgREST row shapes are touched only
 * inside the method bodies. Vendor column names (ordered_qty, sent_qty, …) are
 * mapped to camelCase domain fields, so the rest of the app never sees the
 * database's spelling. The `.select(…)` column lists are copied VERBATIM from
 * the dashboard + detail/discrepancy routes the F-21 re-point replaces, so the
 * wire output stays byte-identical.
 *
 * The RAW `reason` value is carried in the domain type (NO `.replace`) —
 * mirroring how the Visits/Complaints adapters carry their raw enums; the
 * presentation `.replace` stays in the route/service.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseDiscrepanciesRepository(client)` factory — tests pass a
 *     test-scoped client; wiring passes the service-role singleton.
 *   - `supabaseDiscrepanciesRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract (per the port JSDoc): reads return null on miss; every DB
 * failure throws ServiceError.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
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

// Select field lists copied VERBATIM from the routes the F-21 re-point
// replaces, so the wire output stays byte-identical.

// GET /api/dashboard — Zone 2 discrepancies-today select (route line 87).
const TODAY_COLS =
  "id, created_at, status, reason, ordered_qty, sent_qty, customers(name), products(name), users!discrepancies_user_id_fkey(name)";

// GET /api/dashboard — Zone 3 week-rollup select (route line 114).
const WEEK_ROLLUP_COLS = "reason, products(name)";

// GET /api/detail/discrepancy select (route lines 17-24).
const DETAIL_COLS = [
  "id",
  "created_at",
  "status",
  "reason",
  "ordered_qty",
  "sent_qty",
  "unit",
  "note",
  "customers(id,name)",
  "products(id,name,category)",
  "users!discrepancies_user_id_fkey(name)",
].join(",");

// ─── coercion helpers ────────────────────────────────────────────────

/** Supabase embeds a to-one join as either an object or a 1-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function num(v: unknown): number | null {
  return v != null ? Number(v) : null;
}

// ─── row shapes (PostgREST) ──────────────────────────────────────────

interface NameJoinRow {
  name: string;
}
interface IdNameJoinRow {
  id: string;
  name: string;
}
interface ProductJoinRow {
  id?: string;
  name: string;
  category?: string | null;
}

interface DiscrepancyRow {
  id: string;
  created_at: string;
  status: string;
  reason: string;
  ordered_qty?: number | string | null;
  sent_qty?: number | string | null;
  unit?: string | null;
  note?: string | null;
  customers?: IdNameJoinRow | NameJoinRow | (IdNameJoinRow | NameJoinRow)[] | null;
  products?: ProductJoinRow | ProductJoinRow[] | null;
  users?: NameJoinRow | NameJoinRow[] | null;
}

export function createSupabaseDiscrepanciesRepository(
  client: SupabaseClient,
): DiscrepanciesRepository {
  return {
    async listToday(
      window: DiscrepancyWindow,
    ): Promise<readonly DiscrepancyToday[]> {
      const { data, error } = await client
        .from("discrepancies")
        .select(TODAY_COLS)
        .gte("created_at", window.from)
        .lte("created_at", window.to)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        log.error("DiscrepanciesRepository.listToday DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as DiscrepancyRow[];
      return rows.map((d) => {
        const cust = one(d.customers ?? null);
        const prod = one(d.products ?? null);
        const usr = one(d.users ?? null);
        return {
          id: d.id,
          createdAt: d.created_at,
          status: d.status as DiscrepancyStatus,
          reason: d.reason, // RAW
          orderedQty: num(d.ordered_qty),
          sentQty: num(d.sent_qty),
          customerName: cust?.name ?? null,
          productName: prod?.name ?? null,
          loggedByName: usr?.name ?? null,
        };
      });
    },

    async listWeekRollup(
      window: DiscrepancyWindow,
    ): Promise<readonly DiscrepancyWeekRollupRow[]> {
      const { data, error } = await client
        .from("discrepancies")
        .select(WEEK_ROLLUP_COLS)
        .gte("created_at", window.from)
        .lte("created_at", window.to);
      if (error) {
        log.error("DiscrepanciesRepository.listWeekRollup DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as DiscrepancyRow[];
      return rows.map((d) => ({
        reason: d.reason, // RAW
        productName: one(d.products ?? null)?.name ?? null,
      }));
    },

    async findDetailById(id: string): Promise<DiscrepancyDetail | null> {
      const { data, error } = await client
        .from("discrepancies")
        .select(DETAIL_COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("DiscrepanciesRepository.findDetailById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("DB error", { cause: error });
      }
      if (data === null) return null;
      const d = data as unknown as DiscrepancyRow;
      const cust = one(d.customers ?? null) as IdNameJoinRow | null;
      const prod = one(d.products ?? null) as ProductJoinRow | null;
      const usr = one(d.users ?? null);
      return {
        id: d.id,
        createdAt: d.created_at,
        status: d.status as DiscrepancyStatus,
        reason: d.reason, // RAW
        orderedQty: num(d.ordered_qty),
        sentQty: num(d.sent_qty),
        unit: d.unit ?? null,
        note: d.note ?? null,
        customerId: cust?.id ?? null,
        customerName: cust?.name ?? null,
        productId: prod?.id ?? null,
        productName: prod?.name ?? null,
        productCategory: prod?.category ?? null,
        loggedByName: usr?.name ?? null,
      };
    },
  };
}

export const supabaseDiscrepanciesRepository: DiscrepanciesRepository =
  createSupabaseDiscrepanciesRepository(supabaseService);
