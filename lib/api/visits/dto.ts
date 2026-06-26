/**
 * lib/api/visits/dto.ts
 *
 * DTO translators: the Visit domain shapes (camelCase) → the EXACT wire shapes
 * the visit screens read today (F-18 PR2). Pure functions, no I/O, unit-tested
 * key-for-key AND key-order — these are the wire-compat tripwire for the route
 * re-point.
 *
 * Key ORDER is load-bearing: NextResponse.json serialises object keys in
 * insertion order, so the order below must match each route's current response
 * literal verbatim:
 *   - screen3/today  (snake_case)  — route.ts:88–102 raw.map literal
 *   - screen3/visit/notes (snake_case) — route.ts:64–72 GET shaped + 124–133 POST echo
 *   - screen3/visit/notes PATCH (snake_case) — route.ts:171 {note:data} 3-key echo
 *   - detail/visit   (camelCase)   — route.ts:36–49 response literal
 *   - admin/visits   (camelCase)   — route.ts:88–97 res.data.map literal
 *
 * MIXED wire shapes: the snake_case routes (today, notes) stay snake_case; the
 * camelCase routes (detail, admin) stay camelCase. The domain is camelCase
 * internally — these translators re-map to each route's own wire spelling.
 *
 * RAW enum discipline (plan §3 / lib/domain/Visit.ts lines 10–14): `visit_type`/
 * `visitType` and `outcome` are emitted RAW here. The underscore→space
 * presentation transform stays at the ROUTE edge for the two camelCase routes
 * (detail/visit, admin/visits prettify after the dto). screen3/today emits the
 * enums RAW to the client today, so the raw value IS the wire value there.
 *
 * Function count: 5. There is deliberately NO helper for the screen3/visit
 * PATCH echo ({ id, pipeline_status }): that 2-key literal is built from the
 * REQUEST values, not a domain object, so a dto helper would be a shallow
 * pass-through (fails the deletion test). The route keeps it inline (plan §3.6).
 *
 * Import domain types only (ADR-0002) — no vendor, no framework, no adapter.
 */
import type { Visit, VisitDetail, VisitNote } from "@/lib/domain";

// ─── Wire shapes (what the visit screens were built to read) ──

/** A visit in the screen3/today `visits` array (snake_case). */
export interface TodayVisitDto {
  id: string;
  created_at: string;
  visit_type: string; // RAW — emitted raw to the client today
  outcome: string; // RAW
  pipeline_status: string;
  commitment_made: boolean;
  commitment_detail: string | null;
  notes: string | null;
  customer_id: string | null;
  customer_name: string | null;
  prospect_name: string | null;
  prospect_postcode: string | null;
  logged_by_name: string | null;
  logged_by_id: string | null;
}

/** A note in the screen3/visit/notes GET array AND the POST echo (snake_case). */
export interface VisitNoteDto {
  id: string;
  visit_id: string;
  body: string;
  created_at: string;
  updated_at: string | null;
  author_id: string | null;
  author_name: string;
}

/** The trimmed screen3/visit/notes PATCH echo ({ id, body, updated_at }). */
export interface NoteUpdateDto {
  id: string;
  body: string;
  updated_at: string | null;
}

/** The detail/visit GET object (camelCase, RAW enums — route prettifies). */
export interface VisitDetailDto {
  id: string;
  createdAt: string;
  visitType: string; // RAW — route prettifies at the edge
  outcome: string; // RAW — route prettifies at the edge
  commitmentMade: boolean;
  commitmentDetail: string | null;
  notes: string | null;
  customer: string | null;
  prospectName: string | null;
  prospectPostcode: string | null;
  loggedBy: string;
  pipelineStatus: string;
}

/** An admin/visits row (camelCase, RAW enums — route prettifies). */
export interface AdminVisitDto {
  id: string;
  customer: string;
  rep: string;
  visitType: string; // RAW — route prettifies at the edge
  outcome: string; // RAW — route prettifies at the edge
  notes: string | null;
  pipelineStatus: string | null;
  createdAt: string;
}

// ─── Translators ─────────────────────────────────────────────

/**
 * A Visit → a screen3/today list item (snake_case). `visit_type`/`outcome` are
 * RAW (today emits them raw to the client). Key order = the route's `raw.map`
 * literal.
 */
export function toTodayVisitWireDto(v: Visit): TodayVisitDto {
  return {
    id: v.id,
    created_at: v.createdAt,
    visit_type: v.visitType,
    outcome: v.outcome,
    // `Visit.pipelineStatus` is `string | null` since F-20 PR2 (the prospects
    // read keeps raw null). This today path always comes through `toVisit`'s
    // `?? 'Logged'`, so it is never actually null here — the `?? 'Logged'`
    // keeps the field a non-null string for the DTO type and preserves today's
    // exact wire value byte-for-byte.
    pipeline_status: v.pipelineStatus ?? "Logged",
    commitment_made: v.commitmentMade,
    commitment_detail: v.commitmentDetail,
    notes: v.notes,
    customer_id: v.customerId,
    customer_name: v.customerName,
    prospect_name: v.prospectName,
    prospect_postcode: v.prospectPostcode,
    logged_by_name: v.loggedByName,
    logged_by_id: v.loggedById,
  };
}

/**
 * A VisitNote → the screen3/visit/notes GET row / POST echo (snake_case). Maps
 * camelCase domain → snake_case wire. `author_name` is copied verbatim — the
 * adapter's toNote already defaults it to 'Unknown', so do NOT re-default here.
 * Key order = the route literal (id, visit_id, body, created_at, updated_at,
 * author_id, author_name).
 */
export function toVisitNoteWireDto(n: VisitNote): VisitNoteDto {
  return {
    id: n.id,
    visit_id: n.visitId,
    body: n.body,
    created_at: n.createdAt,
    updated_at: n.updatedAt,
    author_id: n.authorId,
    author_name: n.authorName,
  };
}

/**
 * A VisitNote → the trimmed screen3/visit/notes PATCH echo (snake_case). The
 * route's `.select('id, body, updated_at')` returns exactly these 3 keys.
 * Key order = (id, body, updated_at).
 */
export function toNoteUpdateWireDto(n: VisitNote): NoteUpdateDto {
  return {
    id: n.id,
    body: n.body,
    updated_at: n.updatedAt,
  };
}

/**
 * A VisitDetail → the detail/visit GET object (camelCase). `visitType`/`outcome`
 * are RAW (the route prettifies BOTH at the edge). Maps customerName→customer,
 * loggedByName→loggedBy (?? 'Unknown' to preserve the wire default). Key order =
 * the route's response literal.
 */
export function toVisitDetailWireDto(d: VisitDetail): VisitDetailDto {
  return {
    id: d.id,
    createdAt: d.createdAt,
    visitType: d.visitType,
    outcome: d.outcome,
    commitmentMade: d.commitmentMade,
    commitmentDetail: d.commitmentDetail,
    notes: d.notes,
    customer: d.customerName,
    prospectName: d.prospectName,
    prospectPostcode: d.prospectPostcode,
    loggedBy: d.loggedByName ?? "Unknown",
    // `Visit.pipelineStatus` is `string | null` since F-20 PR2; the detail read
    // comes through `toVisit`'s `?? 'Logged'`, so it is never null here. The
    // `?? 'Logged'` keeps the DTO field a non-null string and preserves today's
    // exact wire value.
    pipelineStatus: d.pipelineStatus ?? "Logged",
  };
}

/**
 * A Visit → an admin/visits row (camelCase). `visitType`/`outcome` are RAW (the
 * route prettifies at the edge). `customer` is the fallback chain
 * customerName → prospectName → 'Unknown'; `rep` defaults to 'Unknown';
 * `notes`/`pipelineStatus` null-coalesce to null. Key order = the route's
 * `res.data.map` literal.
 */
export function toAdminVisitWireDto(v: Visit): AdminVisitDto {
  return {
    id: v.id,
    customer: v.customerName ?? v.prospectName ?? "Unknown",
    rep: v.loggedByName ?? "Unknown",
    visitType: v.visitType,
    outcome: v.outcome,
    notes: v.notes ? String(v.notes) : null,
    pipelineStatus: v.pipelineStatus ? String(v.pipelineStatus) : null,
    createdAt: v.createdAt,
  };
}
