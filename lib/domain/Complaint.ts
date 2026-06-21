/**
 * lib/domain/Complaint.ts
 *
 * App-owned Complaint domain types (F-17). Pure TypeScript — no framework
 * imports, no vendor imports. The database's snake_case spelling
 * (resolution_note, received_via, resolved_at, …) never appears here; the
 * Supabase adapter maps it to these camelCase fields and the rest of the
 * app only ever sees these shapes (ADR-0002).
 *
 * Important byte-identity note on `category`: the existing GET routes
 * return `category.replace(/_/g, ' ')` (e.g. "missing item") — a
 * PRESENTATION transform. That transform STAYS IN THE ROUTE (PR2); the
 * domain type carries the RAW enum value. Same for `received_via`.
 */

export type ComplaintCategory =
  | "weight"
  | "quality"
  | "delivery"
  | "missing_item"
  | "pricing"
  | "service"
  | "other";

export type ComplaintReceivedVia =
  | "phone"
  | "in_person"
  | "whatsapp"
  | "email"
  | "other";

export type ComplaintStatus = "open" | "resolved";

/** A complaint_notes row, joins resolved (author name). */
export interface ComplaintNote {
  readonly id: string;
  readonly complaintId: string;
  readonly body: string;
  readonly authorName: string; // users.name ?? 'Unknown'
  readonly createdAt: string; // ISO-8601
}

/** A complaints row with joins resolved — the FULL shape (screen2/all). */
export interface Complaint {
  readonly id: string;
  readonly createdAt: string;
  readonly category: ComplaintCategory;
  readonly description: string;
  readonly receivedVia: ComplaintReceivedVia;
  readonly status: ComplaintStatus;
  readonly resolutionNote: string | null;
  readonly resolvedAt: string | null;
  readonly customerName: string; // customers.name ?? 'Unknown'
  readonly loggedByName: string; // logger users.name ?? 'Unknown'
  readonly loggedById: string | null; // logger users.id (screen2/all exposes logged_by.id)
  readonly resolvedByName: string | null;
  readonly notes: readonly ComplaintNote[]; // empty in summaries that don't fetch notes
}

/** A complaints row with the customer id+name pair (detail/complaint exposes both). */
export interface ComplaintDetail extends Complaint {
  readonly customerId: string;
  readonly customerName: string;
}

// ── Inputs / contexts ──

export interface CreateComplaintInput {
  readonly id?: string; // optional client-supplied id (offline-queue replay)
  readonly customerId: string;
  readonly category: ComplaintCategory;
  readonly description: string;
  readonly receivedVia: ComplaintReceivedVia;
  readonly status: ComplaintStatus;
  readonly resolutionNote: string | null; // required when status='resolved'
  readonly loggedBy: string; // x-mfs-user-id
}

/** Returned by createComplaint: the new id + the resolved customer name (so PR2
 *  can build the audit summary + email without a second customers read). */
export interface CreatedComplaint {
  readonly id: string;
  readonly customerName: string; // customers.name ?? 'Unknown'
  readonly duplicate: boolean; // true on 23505 retry (matches screen2/sync 200)
}

export interface ResolveComplaintInput {
  readonly complaintId: string;
  readonly resolutionNote: string;
  readonly resolvedBy: string; // x-mfs-user-id
}

/** Context read for the resolve/note email payloads (category/description/customer). */
export interface ComplaintEmailContext {
  readonly id: string;
  readonly category: ComplaintCategory;
  readonly description: string;
  readonly status: ComplaintStatus;
  readonly customerName: string; // ?? 'Unknown'
}

export interface CreateNoteInput {
  readonly complaintId: string;
  readonly body: string;
  readonly userId: string; // x-mfs-user-id
}

/** Returned by createNote (the screen2/note 201 body shape, author resolved). */
export interface CreatedNote {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
}
