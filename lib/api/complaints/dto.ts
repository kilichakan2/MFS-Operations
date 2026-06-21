/**
 * lib/api/complaints/dto.ts
 *
 * DTO translators: the Complaint domain shapes (camelCase) → the EXACT
 * camelCase wire shapes the complaints screens read today (F-17 PR2). Pure
 * functions, no I/O, unit-tested key-for-key AND key-order — these are the
 * wire-compat tripwire for the route re-point.
 *
 * Key ORDER is load-bearing: NextResponse.json serialises object keys in
 * insertion order, so the order below must match each route's current response
 * literal verbatim (screen2/all lines 88–105, screen2/open lines 47–54,
 * screen2/note lines 112–117, detail/complaint lines 36–48).
 *
 * RAW enum discipline (plan §5, G1 / lib/domain/Complaint.ts lines 10–13):
 * `category` (all shapes) and `receivedVia` (detail) are emitted RAW here.
 * The underscore→space presentation transform stays at the ROUTE edge — the
 * domain carries the raw enum and the translator is a pure structural reshape.
 * Import domain types only (ADR-0002).
 */
import type {
  Complaint,
  ComplaintDetail,
  ComplaintNote,
} from "@/lib/domain";

// ─── Wire shapes (what the complaints screens were built to read) ──

/** A note in the screen2/all `notes` array AND the screen2/note POST echo. */
export interface ComplaintNoteDto {
  id: string;
  body: string;
  author: string;
  createdAt: string;
}

/** A complaint in the screen2/all bare array (full shape + notes). */
export interface ComplaintListItemDto {
  id: string;
  createdAt: string;
  category: string; // RAW — route prettifies at the edge
  description: string;
  status: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  customer: string;
  loggedBy: string;
  resolvedBy: string | null;
  notes: ComplaintNoteDto[];
}

/** A complaint in the screen2/open bare array (trimmed open-only shape). */
export interface OpenComplaintDto {
  id: string;
  createdAt: string;
  category: string; // RAW — route prettifies at the edge
  description: string;
  customer: string;
  loggedBy: string;
}

/** The detail/complaint GET object (full single shape with receivedVia). */
export interface ComplaintDetailDto {
  id: string;
  createdAt: string;
  category: string; // RAW — route prettifies at the edge
  description: string;
  receivedVia: string; // RAW — route prettifies at the edge
  status: string;
  resolutionNote: string | null;
  resolvedAt: string | null;
  customer: string;
  loggedBy: string;
  resolvedBy: string | null;
}

// ─── Translators ─────────────────────────────────────────────

/**
 * A ComplaintNote → the screen2/all note row / screen2/note POST echo. Maps
 * `authorName` → `author`. Key order = the route literal (id, body, author,
 * createdAt).
 */
export function toNoteWireDto(n: ComplaintNote): ComplaintNoteDto {
  return {
    id: n.id,
    body: n.body,
    author: n.authorName,
    createdAt: n.createdAt,
  };
}

/**
 * A Complaint → a screen2/all list item (with its notes thread). `category` is
 * RAW (route prettifies). Maps customerName→customer, loggedByName→loggedBy,
 * resolvedByName→resolvedBy. Key order = the route's `result.map` literal.
 */
export function toComplaintListItemWireDto(
  c: Complaint,
): ComplaintListItemDto {
  return {
    id: c.id,
    createdAt: c.createdAt,
    category: c.category,
    description: c.description,
    status: c.status,
    resolutionNote: c.resolutionNote,
    resolvedAt: c.resolvedAt,
    customer: c.customerName,
    loggedBy: c.loggedByName,
    resolvedBy: c.resolvedByName,
    notes: c.notes.map(toNoteWireDto),
  };
}

/**
 * A Complaint → a screen2/open list item. `category` is RAW (route prettifies).
 * Key order = the route's `complaints.map` literal (id, createdAt, category,
 * description, customer, loggedBy).
 */
export function toOpenComplaintWireDto(c: Complaint): OpenComplaintDto {
  return {
    id: c.id,
    createdAt: c.createdAt,
    category: c.category,
    description: c.description,
    customer: c.customerName,
    loggedBy: c.loggedByName,
  };
}

/**
 * A ComplaintDetail → the detail/complaint GET object. BOTH `category` and
 * `receivedVia` are RAW (the route prettifies BOTH at the edge — G1). Key
 * order = the route's response literal (id, createdAt, category, description,
 * receivedVia, status, resolutionNote, resolvedAt, customer, loggedBy,
 * resolvedBy).
 */
export function toComplaintDetailWireDto(
  d: ComplaintDetail,
): ComplaintDetailDto {
  return {
    id: d.id,
    createdAt: d.createdAt,
    category: d.category,
    description: d.description,
    receivedVia: d.receivedVia,
    status: d.status,
    resolutionNote: d.resolutionNote,
    resolvedAt: d.resolvedAt,
    customer: d.customerName,
    loggedBy: d.loggedByName,
    resolvedBy: d.resolvedByName,
  };
}
