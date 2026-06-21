/**
 * lib/domain/Visit.ts
 *
 * App-owned Visit domain types (F-18). Pure TypeScript — no framework
 * imports, no vendor imports. The database's snake_case spelling
 * (visit_type, pipeline_status, prospect_postcode, …) never appears here;
 * the Supabase adapter maps it to these camelCase fields and the rest of
 * the app only ever sees these shapes (ADR-0002).
 *
 * Important byte-identity note on the enums: the existing GET routes
 * (detail/visit, admin/visits) return `visit_type.replace(/_/g, ' ')` and
 * `outcome.replace(/_/g, ' ')` — a PRESENTATION transform. That transform
 * STAYS IN THE ROUTE (PR2); the domain type carries the RAW enum value
 * (`new_pitch`, `at_risk`).
 */

export type VisitType =
  | "routine"
  | "new_pitch"
  | "complaint_followup"
  | "delivery_issue";

export type VisitOutcome = "positive" | "neutral" | "at_risk" | "lost";

// pipeline_status is free text in the DB (default 'Logged'); the valid set is
// enforced in the route/service, not the column. Carry as the literal union +
// the canonical constant (lifted verbatim from screen3/visit/route.ts:15-23).
export type PipelineStatus =
  | "Logged"
  | "In Talks"
  | "Not Progressing"
  | "Trial Order Placed"
  | "Awaiting Feedback"
  | "Won"
  | "Not Won";

export const VALID_PIPELINE_STATUSES: readonly PipelineStatus[] = [
  "Logged",
  "In Talks",
  "Not Progressing",
  "Trial Order Placed",
  "Awaiting Feedback",
  "Won",
  "Not Won",
];

/** A visit_notes row, author join resolved. */
export interface VisitNote {
  readonly id: string;
  readonly visitId: string;
  readonly body: string;
  readonly authorId: string | null; // author users.id
  readonly authorName: string; // author users.name ?? 'Unknown'
  readonly createdAt: string; // ISO-8601
  readonly updatedAt: string | null;
}

/** Rich superset visit shape for list contexts (today + admin). A given query
 *  populates only the columns it selects; PR2 routes pick the subset they emit,
 *  so wire output stays byte-identical. */
export interface Visit {
  readonly id: string;
  readonly createdAt: string;
  readonly userId: string | null; // logger (rep) id
  readonly loggedById: string | null; // rep users.id (today exposes via rep join)
  readonly loggedByName: string | null; // rep users.name ?? 'Unknown'/null
  readonly customerId: string | null;
  readonly customerName: string | null; // customers.name ?? null
  readonly visitType: VisitType; // RAW enum (no replace)
  readonly outcome: VisitOutcome; // RAW enum (no replace)
  readonly pipelineStatus: string; // ?? 'Logged'
  readonly commitmentMade: boolean;
  readonly commitmentDetail: string | null;
  readonly notes: string | null;
  readonly prospectName: string | null;
  readonly prospectPostcode: string | null;
}

/** detail/visit shape — adds the customer id+name pair. */
export interface VisitDetail extends Visit {
  readonly customerId: string | null; // customers.id (detail selects customers(id,name))
}

// ── Inputs / contexts ──

export interface CreateVisitInput {
  readonly id?: string; // optional client-supplied id (offline replay)
  readonly upsert?: boolean; // body._upsert → on_conflict=id merge
  readonly userId: string; // x-mfs-user-id
  readonly customerId: string | null;
  readonly prospectName: string | null;
  readonly prospectPostcode: string | null;
  readonly visitType: VisitType;
  readonly outcome: VisitOutcome;
  readonly commitmentMade: boolean;
  readonly commitmentDetail: string | null; // forced null unless commitmentMade
  readonly notes: string | null;
}

/** createVisit returns the new id + duplicate flag (23505/409 → 200 path). */
export interface CreatedVisit {
  readonly id: string;
  readonly duplicate: boolean;
}

export interface ProspectLocation {
  readonly visitId: string;
  readonly lat: number;
  readonly lng: number;
  readonly approximate: boolean;
}

export interface UpdatePipelineStatusInput {
  readonly id: string;
  readonly status: string;
  readonly userId: string;
  readonly isManager: boolean; // manager → no owner filter
}

export interface CreateVisitNoteInput {
  readonly visitId: string;
  readonly body: string;
  readonly userId: string;
}

export interface UpdateVisitNoteInput {
  readonly id: string;
  readonly body: string;
  readonly userId: string;
  readonly isManager: boolean;
}

export interface AdminVisitFilter {
  readonly from: string; // ISO
  readonly to: string; // ISO
  readonly repId?: string | null;
  readonly type?: string | null;
  readonly outcome?: string | null;
}
