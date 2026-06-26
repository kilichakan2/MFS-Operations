/**
 * lib/adapters/supabase/ComplaintsRepository.ts
 *
 * Supabase implementation of `ComplaintsRepository`
 * (lib/ports/ComplaintsRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the lib/adapters/supabase
 * tree at .eslintrc.json). The ONLY file that imports the vendor SDK for the
 * Complaints DB.
 *
 * Boundary discipline (ADR-0002 line 27): PostgREST row shapes are touched
 * only inside the method bodies. Vendor column names (resolution_note,
 * received_via, resolved_at, …) are mapped to camelCase domain fields, so the
 * rest of the app never sees the database's spelling. The `.select(…)` column
 * lists are copied VERBATIM from the eight complaint/compliment routes the
 * PR2 re-point will replace, so the wire output stays byte-identical.
 *
 * NOTE: six of the eight routes use raw `fetch` to PostgREST today; this
 * adapter standardises on the supabase-js client (the createSupabase…(client)
 * pattern, matching CashRepository), asking for the exact same columns.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseComplaintsRepository(client)` factory — tests pass a
 *     test-scoped client; wiring passes the service-role singleton.
 *   - `supabaseComplaintsRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract (per the port JSDoc): reads return null/empty on miss;
 * every DB failure throws ServiceError. The screen2/sync 23505 case is NOT
 * an error — it maps to `duplicate: true` (the route returns 200 on duplicate).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  Complaint,
  ComplaintDetail,
  ComplaintNote,
  ComplaintCategory,
  ComplaintReceivedVia,
  ComplaintStatus,
  ComplaintWeekRollupRow,
  ComplaintEmailContext,
  CreateComplaintInput,
  CreatedComplaint,
  ResolveComplaintInput,
  CreateNoteInput,
  CreatedNote,
} from "@/lib/domain";
import type { ComplaintsRepository } from "@/lib/ports";

// Select field lists copied VERBATIM from the routes the PR2 re-point will
// replace, so the wire output stays byte-identical. The route files remain the
// source of truth for which keys each endpoint returns.

// GET /api/screen2/all complaints select (no received_via — route omits it).
const ALL_COMPLAINT_COLS =
  "id,created_at,category,description,status,resolution_note,resolved_at," +
  "customers(name)," +
  "logged_by:users!complaints_user_id_fkey(id,name)," +
  "resolver:users!complaints_resolved_by_fkey(name)";

// GET /api/screen2/all notes select.
const ALL_NOTE_COLS =
  "id,complaint_id,body,created_at,author:users!complaint_notes_user_id_fkey(name)";

// GET /api/screen2/open select.
const OPEN_COLS =
  "id,created_at,category,description,customers(name),users!complaints_user_id_fkey(name)";

// GET /api/detail/complaint select.
const DETAIL_COLS = [
  "id",
  "created_at",
  "category",
  "description",
  "received_via",
  "status",
  "resolution_note",
  "resolved_at",
  "customers(id,name)",
  "users!complaints_user_id_fkey(name)",
  "resolvedBy:users!complaints_resolved_by_fkey(name)",
].join(",");

// resolve + note email/context select.
const EMAIL_CTX_COLS = "id,category,description,status,customers(name)";

// ── F-21 admin dashboard selects — copied VERBATIM from app/api/dashboard ────
// Zone 1: open complaints > 48h (route line 63).
const OPEN_OLDER_COLS =
  "id, created_at, category, description, user_id, customers(name), users!complaints_user_id_fkey(name)";
// Zone 2: complaints today (route line 96).
const TODAY_NAMES_COLS =
  "id, created_at, category, status, description, resolution_note, customers(name), users!complaints_user_id_fkey(name)";
// Zone 3: complaints this week — the trimmed rollup feed (route line 121).
const WEEK_ROLLUP_COLS = "category, status, created_at, resolved_at";

// ─── coercion helpers ────────────────────────────────────────────────

/** Supabase embeds a to-one join as either an object or a 1-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ─── row shapes (PostgREST) ──────────────────────────────────────────

interface NameJoinRow {
  name: string;
}
interface IdNameJoinRow {
  id: string;
  name: string;
}

interface ComplaintRow {
  id: string;
  created_at: string;
  category: string;
  description: string;
  received_via?: string | null;
  status: string;
  resolution_note?: string | null;
  resolved_at?: string | null;
  customers?: IdNameJoinRow | NameJoinRow | (IdNameJoinRow | NameJoinRow)[] | null;
  // screen2/all aliases the logger as logged_by(id,name); screen2/open as users(name).
  logged_by?: IdNameJoinRow | IdNameJoinRow[] | null;
  users?: NameJoinRow | NameJoinRow[] | null;
  resolver?: NameJoinRow | NameJoinRow[] | null;
  resolvedBy?: NameJoinRow | NameJoinRow[] | null;
}

interface NoteRow {
  id: string;
  complaint_id: string;
  body: string;
  created_at: string;
  author?: NameJoinRow | NameJoinRow[] | null;
}

// ─── row → domain mappers ────────────────────────────────────────────

function toNote(row: NoteRow): ComplaintNote {
  return {
    id: row.id,
    complaintId: row.complaint_id,
    body: row.body,
    authorName: one(row.author ?? null)?.name ?? "Unknown",
    createdAt: row.created_at,
  };
}

/** Map a complaint row to the FULL Complaint shape. The logger may arrive as
 *  `logged_by` (screen2/all, id+name) or `users` (screen2/open, name only). */
function toComplaint(
  row: ComplaintRow,
  notes: readonly ComplaintNote[],
): Complaint {
  const loggedBy = one(row.logged_by ?? null);
  const usersJoin = one(row.users ?? null);
  const customer = one(row.customers ?? null);
  return {
    id: row.id,
    createdAt: row.created_at,
    category: row.category as ComplaintCategory,
    description: row.description,
    receivedVia: (row.received_via ?? "") as ComplaintReceivedVia,
    status: row.status as ComplaintStatus,
    resolutionNote: row.resolution_note ?? null,
    resolvedAt: row.resolved_at ?? null,
    customerName: (customer as NameJoinRow | null)?.name ?? "Unknown",
    loggedByName: loggedBy?.name ?? usersJoin?.name ?? "Unknown",
    loggedById: loggedBy?.id ?? null,
    resolvedByName:
      one(row.resolver ?? null)?.name ??
      one(row.resolvedBy ?? null)?.name ??
      null,
    notes,
  };
}

export function createSupabaseComplaintsRepository(
  client: SupabaseClient,
): ComplaintsRepository {
  // Resolve the customer name for the audit summary + email (screen2/sync does
  // the same single-column lookup). 'Unknown' on miss or read failure — the
  // route treats a failed name lookup as non-fatal (falls back to the id).
  async function resolveCustomerName(customerId: string): Promise<string> {
    const { data, error } = await client
      .from("customers")
      .select("name")
      .eq("id", customerId)
      .maybeSingle();
    if (error) return "Unknown";
    return (data as { name?: string } | null)?.name ?? "Unknown";
  }

  return {
    async listAllWithNotes(): Promise<readonly Complaint[]> {
      // screen2/all fetches complaints + notes in parallel, then groups notes.
      const [complaintsRes, notesRes] = await Promise.all([
        client
          .from("complaints")
          .select(ALL_COMPLAINT_COLS)
          .order("created_at", { ascending: false }),
        client
          .from("complaint_notes")
          .select(ALL_NOTE_COLS)
          .order("created_at", { ascending: true }),
      ]);

      if (complaintsRes.error) {
        log.error("ComplaintsRepository.listAllWithNotes complaints DB error", {
          error: complaintsRes.error.message,
        });
        throw new ServiceError("Failed to fetch complaints", {
          cause: complaintsRes.error,
        });
      }
      if (notesRes.error) {
        log.error("ComplaintsRepository.listAllWithNotes notes DB error", {
          error: notesRes.error.message,
        });
        throw new ServiceError("Failed to fetch notes", {
          cause: notesRes.error,
        });
      }

      const noteRows = (notesRes.data ?? []) as unknown as NoteRow[];
      const notesByComplaint = new Map<string, ComplaintNote[]>();
      for (const n of noteRows) {
        const note = toNote(n);
        const bucket = notesByComplaint.get(n.complaint_id);
        if (bucket) bucket.push(note);
        else notesByComplaint.set(n.complaint_id, [note]);
      }

      const rows = (complaintsRes.data ?? []) as unknown as ComplaintRow[];
      return rows.map((r) =>
        toComplaint(r, notesByComplaint.get(r.id) ?? []),
      );
    },

    async listOpen(): Promise<readonly Complaint[]> {
      const { data, error } = await client
        .from("complaints")
        .select(OPEN_COLS)
        .eq("status", "open")
        .order("created_at", { ascending: false });
      if (error) {
        log.error("ComplaintsRepository.listOpen DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to fetch complaints", { cause: error });
      }
      const rows = (data ?? []) as unknown as ComplaintRow[];
      // screen2/open rows have no status column selected; they are all open.
      return rows.map((r) => toComplaint({ ...r, status: "open" }, []));
    },

    async findDetailById(id: string): Promise<ComplaintDetail | null> {
      const { data, error } = await client
        .from("complaints")
        .select(DETAIL_COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("ComplaintsRepository.findDetailById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("DB error", { cause: error });
      }
      if (data === null) return null;
      const row = data as unknown as ComplaintRow;
      const base = toComplaint(row, []);
      const customer = one(row.customers ?? null) as IdNameJoinRow | null;
      return {
        ...base,
        customerId: customer?.id ?? "",
        customerName: customer?.name ?? "Unknown",
      };
    },

    async createComplaint(
      input: CreateComplaintInput,
    ): Promise<CreatedComplaint> {
      const isResolved = input.status === "resolved";
      const payload: Record<string, unknown> = {
        ...(input.id ? { id: input.id } : {}),
        user_id: input.loggedBy,
        customer_id: input.customerId,
        category: input.category,
        description: input.description.trim(),
        received_via: input.receivedVia,
        status: input.status,
        resolution_note: isResolved
          ? (input.resolutionNote?.trim() ?? null)
          : null,
        resolved_by: isResolved ? input.loggedBy : null,
        resolved_at: isResolved ? new Date().toISOString() : null,
      };

      const { data, error } = await client
        .from("complaints")
        .insert(payload)
        .select("id")
        .single();

      if (error || !data) {
        // 23505 = unique_violation — already inserted on a previous retry.
        // screen2/sync returns 200 {id, duplicate:true} (NOT an error).
        if ((error as { code?: string } | null)?.code === "23505") {
          const customerName = await resolveCustomerName(input.customerId);
          return {
            id: input.id ?? "",
            customerName,
            duplicate: true,
          };
        }
        log.error("ComplaintsRepository.createComplaint DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }

      const recordId = (data as { id: string }).id;
      const customerName = await resolveCustomerName(input.customerId);
      return { id: recordId, customerName, duplicate: false };
    },

    async resolveOpen(
      input: ResolveComplaintInput,
    ): Promise<{ id: string } | null> {
      const { data, error } = await client
        .from("complaints")
        .update({
          status: "resolved",
          resolution_note: input.resolutionNote.trim(),
          resolved_by: input.resolvedBy,
          resolved_at: new Date().toISOString(),
        })
        .eq("id", input.complaintId)
        .eq("status", "open") // only resolve currently-open rows
        .select("id");
      if (error) {
        log.error("ComplaintsRepository.resolveOpen DB error", {
          complaintId: input.complaintId,
          error: error.message,
        });
        throw new ServiceError("Update failed", { cause: error });
      }
      const rows = (data ?? []) as { id: string }[];
      if (rows.length === 0) return null; // wrong id or already resolved
      return { id: rows[0].id };
    },

    async findEmailContext(
      id: string,
    ): Promise<ComplaintEmailContext | null> {
      const { data, error } = await client
        .from("complaints")
        .select(EMAIL_CTX_COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("ComplaintsRepository.findEmailContext DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Complaint lookup failed", { cause: error });
      }
      if (data === null) return null;
      const row = data as unknown as ComplaintRow;
      const customer = one(row.customers ?? null) as NameJoinRow | null;
      return {
        id: row.id,
        category: row.category as ComplaintCategory,
        description: row.description,
        status: row.status as ComplaintStatus,
        customerName: customer?.name ?? "Unknown",
      };
    },

    async createNote(input: CreateNoteInput): Promise<CreatedNote> {
      const { data, error } = await client
        .from("complaint_notes")
        .insert({
          complaint_id: input.complaintId,
          user_id: input.userId,
          body: input.body.trim(),
          created_at: new Date().toISOString(),
        })
        .select("id, created_at")
        .single();
      if (error || !data) {
        log.error("ComplaintsRepository.createNote DB error", {
          complaintId: input.complaintId,
          error: error?.message,
        });
        throw new ServiceError("Failed to save note", {
          cause: error ?? new Error("no row returned"),
        });
      }
      const row = data as { id: string; created_at: string };
      return { id: row.id, body: input.body.trim(), createdAt: row.created_at };
    },

    // ── F-21 — admin dashboard reads ────────────────────────────────────────

    async listOpenOlderThan(before: string): Promise<readonly Complaint[]> {
      const { data, error } = await client
        .from("complaints")
        .select(OPEN_OLDER_COLS)
        .eq("status", "open")
        .lt("created_at", before)
        .order("created_at", { ascending: true });
      if (error) {
        log.error("ComplaintsRepository.listOpenOlderThan DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as ComplaintRow[];
      // No status column selected; all rows are open by the filter.
      return rows.map((r) => toComplaint({ ...r, status: "open" }, []));
    },

    async listTodayWithNames(window: {
      from: string;
      to: string;
    }): Promise<readonly Complaint[]> {
      const { data, error } = await client
        .from("complaints")
        .select(TODAY_NAMES_COLS)
        .gte("created_at", window.from)
        .lte("created_at", window.to)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        log.error("ComplaintsRepository.listTodayWithNames DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as ComplaintRow[];
      return rows.map((r) => toComplaint(r, []));
    },

    async listWeekRollup(window: {
      from: string;
      to: string;
    }): Promise<readonly ComplaintWeekRollupRow[]> {
      const { data, error } = await client
        .from("complaints")
        .select(WEEK_ROLLUP_COLS)
        .gte("created_at", window.from)
        .lte("created_at", window.to);
      if (error) {
        log.error("ComplaintsRepository.listWeekRollup DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as ComplaintRow[];
      return rows.map((r) => ({
        category: r.category as ComplaintCategory, // RAW
        status: r.status as ComplaintStatus,
        createdAt: r.created_at,
        resolvedAt: r.resolved_at ?? null,
      }));
    },
  };
}

export const supabaseComplaintsRepository: ComplaintsRepository =
  createSupabaseComplaintsRepository(supabaseService);
