/**
 * lib/domain/Discrepancy.ts
 *
 * App-owned Discrepancy domain types (F-21). Pure TypeScript — no framework
 * imports, no vendor imports. The database's snake_case spelling
 * (ordered_qty, sent_qty, created_at, …) never appears here; the Supabase
 * adapter maps it to these camelCase fields and the rest of the app only ever
 * sees these shapes (ADR-0002 line 27).
 *
 * Important byte-identity note on `reason`: the existing dashboard + detail
 * routes return `reason.replace(/_/g, ' ')` — a PRESENTATION transform. That
 * transform STAYS IN THE ROUTE/SERVICE (F-21); the domain types carry the RAW
 * enum value (`out_of_stock`, `supplier_short`), mirroring how Visit/Complaint
 * carry their raw enums.
 *
 * `status` is the DB `discrepancy_status` enum (`short` | `not_sent`).
 */

/** DB `discrepancy_status` enum. */
export type DiscrepancyStatus = "short" | "not_sent";

/** A discrepancies row for the dashboard's "discrepancies today" list
 *  (Zone 2). customers(name) + products(name) + logged-by users(name) resolved;
 *  RAW reason (the route/service does the `.replace`). orderedQty/sentQty are
 *  carried as `number | null` (sent_qty is nullable in the schema). */
export interface DiscrepancyToday {
  readonly id: string;
  readonly createdAt: string;
  readonly status: DiscrepancyStatus;
  readonly reason: string; // RAW (route/service does the .replace)
  readonly orderedQty: number | null;
  readonly sentQty: number | null;
  readonly customerName: string | null; // ?? 'Unknown' applied in route/service
  readonly productName: string | null;
  readonly loggedByName: string | null;
}

/** A trimmed discrepancies row for the dashboard's week rollup (Zone 3) — the
 *  reason-tally + product top-5 feed. Only `reason` + `productName` are read. */
export interface DiscrepancyWeekRollupRow {
  readonly reason: string; // RAW
  readonly productName: string | null;
}

/** One discrepancy with customer{id,name} + product{id,name,category} +
 *  logged-by rep name — the GET /api/detail/discrepancy shape. RAW reason. */
export interface DiscrepancyDetail {
  readonly id: string;
  readonly createdAt: string;
  readonly status: DiscrepancyStatus;
  readonly reason: string; // RAW
  readonly orderedQty: number | null;
  readonly sentQty: number | null;
  readonly unit: string | null;
  readonly note: string | null;
  readonly customerId: string | null;
  readonly customerName: string | null;
  readonly productId: string | null;
  readonly productName: string | null;
  readonly productCategory: string | null;
  readonly loggedByName: string | null;
}
