/**
 * lib/adapters/supabase/VisitsRepository.ts
 *
 * Supabase implementation of `VisitsRepository`
 * (lib/ports/VisitsRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the lib/adapters/supabase
 * tree at .eslintrc.json). The ONLY file that imports the vendor SDK for the
 * Visits DB.
 *
 * Boundary discipline (ADR-0002 line 27): PostgREST row shapes are touched
 * only inside the method bodies. Vendor column names (visit_type,
 * pipeline_status, prospect_postcode, …) are mapped to camelCase domain
 * fields, so the rest of the app never sees the database's spelling. The
 * `.select(…)` column lists are copied VERBATIM from the six visit routes the
 * PR2 re-point will replace, so the wire output stays byte-identical.
 *
 * NOTE: four of the six routes use raw `fetch` to PostgREST today; this
 * adapter standardises on the supabase-js client (the createSupabase…(client)
 * pattern, matching ComplaintsRepository), asking for the exact same columns.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabaseVisitsRepository(client)` factory — tests pass a
 *     test-scoped client; wiring passes the service-role singleton.
 *   - `supabaseVisitsRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract (per the port JSDoc): reads return null/empty on miss;
 * every DB failure throws ServiceError. The screen3/sync 23505/409 case is
 * NOT an error — it maps to `duplicate: true` (the route returns 200 on
 * duplicate). The geocode PATCH is best-effort — it swallows errors (the
 * route's fire-and-forget posture). updateNote uses `.maybeSingle()` so a
 * no-match returns null → 404 in PR2, never a throw/500 (W1).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import type {
  Visit,
  VisitDetail,
  VisitNote,
  VisitType,
  VisitOutcome,
  CreateVisitInput,
  CreatedVisit,
  ProspectLocation,
  UpdatePipelineStatusInput,
  CreateVisitNoteInput,
  UpdateVisitNoteInput,
  AdminVisitFilter,
} from "@/lib/domain";
import type { VisitsRepository } from "@/lib/ports";
import type { MapVisit } from "@/lib/services/mapScene";

// Select field lists copied VERBATIM from the routes the PR2 re-point will
// replace, so the wire output stays byte-identical. The route files remain the
// source of truth for which keys each endpoint returns.

// GET /api/screen3/today select (route builds the array joined by ',').
const TODAY_COLS = [
  "id",
  "created_at",
  "visit_type",
  "outcome",
  "pipeline_status",
  "commitment_made",
  "commitment_detail",
  "notes",
  "customer_id",
  "prospect_name",
  "prospect_postcode",
  "customers!visits_customer_id_fkey(name)",
  "rep:users!visits_user_id_fkey(id,name)",
].join(",");

// GET /api/detail/visit select (route builds the array joined by ',').
const DETAIL_COLS = [
  "id",
  "created_at",
  "visit_type",
  "outcome",
  "pipeline_status",
  "commitment_made",
  "commitment_detail",
  "notes",
  "prospect_name",
  "prospect_postcode",
  "customers(id,name)",
  "users!visits_user_id_fkey(name)",
].join(",");

// GET /api/admin/visits select — verbatim single-line spaced string.
const ADMIN_COLS =
  "id, created_at, outcome, visit_type, notes, pipeline_status, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)";

// ── F-20 PR2 admin insights selects — copied VERBATIM from the routes ────────
// GET /api/admin/prospects select.
const PROSPECTS_COLS =
  "id, created_at, prospect_name, prospect_postcode, outcome, visit_type, pipeline_status, users!visits_user_id_fkey(name)";

// GET /api/admin/at-risk select.
const AT_RISK_COLS =
  "id, created_at, outcome, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)";

// GET /api/admin/commitments select.
const COMMITMENTS_COLS =
  "id, created_at, commitment_detail, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)";

// ── F-21 admin dashboard selects — copied VERBATIM from app/api/dashboard ────
// Zone 2: visits today (route line 105). Same column set as ADMIN_COLS — kept
// as its own named constant so the dashboard read's verbatim origin is explicit.
const DASHBOARD_TODAY_COLS =
  "id, created_at, outcome, visit_type, notes, pipeline_status, customer_id, prospect_name, customers(name), users!visits_user_id_fkey(name)";
// Zone 3: visits this week (route line 128).
const DASHBOARD_WEEK_COLS =
  "visit_type, outcome, user_id, customer_id, prospect_name, users!visits_user_id_fkey(name)";

// ── F-20 PR3 Map View selects — copied VERBATIM from app/api/map/data ────────
// Existing-customer visits: join lat/lng from the customers table.
const MAP_CUST_VISIT_COLS =
  "id,visit_type,outcome,created_at,users!visits_user_id_fkey(name),customers!visits_customer_id_fkey(name,lat,lng)";
// Prospect visits: use prospect_lat/lng stored on the visit row.
const MAP_PROSPECT_VISIT_COLS =
  "id,visit_type,outcome,created_at,prospect_name,prospect_lat,prospect_lng,is_approximate_location,users!visits_user_id_fkey(name)";

// GET/POST /api/screen3/visit/notes select — verbatim multiline template.
const NOTE_COLS = `
      id, visit_id, body, created_at, updated_at,
      author:users!visit_notes_user_id_fkey(id, name)
    `;

// PATCH /api/screen3/visit/notes select — verbatim.
const NOTE_UPDATE_COLS = "id, body, updated_at";

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

interface VisitRow {
  id: string;
  created_at: string;
  visit_type: string;
  outcome: string;
  pipeline_status?: string | null;
  commitment_made?: boolean | null;
  commitment_detail?: string | null;
  notes?: string | null;
  customer_id?: string | null;
  prospect_name?: string | null;
  prospect_postcode?: string | null;
  user_id?: string | null;
  customers?: IdNameJoinRow | NameJoinRow | (IdNameJoinRow | NameJoinRow)[] | null;
  // today aliases the rep as rep(id,name); detail/admin use users(name).
  rep?: IdNameJoinRow | IdNameJoinRow[] | null;
  users?: NameJoinRow | NameJoinRow[] | null;
}

interface NoteRow {
  id: string;
  visit_id: string;
  body: string;
  created_at: string;
  updated_at?: string | null;
  author?: IdNameJoinRow | IdNameJoinRow[] | null;
}

// ─── row → domain mappers ────────────────────────────────────────────

/** Map a visit row to the FULL Visit shape. The rep may arrive as `rep`
 *  (today, id+name) or `users` (admin, name only). A given query populates
 *  only the columns it selected; un-selected fields default to null/false. */
function toVisit(row: VisitRow): Visit {
  const rep = one(row.rep ?? null);
  const usersJoin = one(row.users ?? null);
  const customer = one(row.customers ?? null) as
    | (IdNameJoinRow | NameJoinRow)
    | null;
  return {
    id: row.id,
    createdAt: row.created_at,
    userId: row.user_id ?? null,
    loggedById: rep?.id ?? null,
    loggedByName: rep?.name ?? usersJoin?.name ?? null,
    customerId: row.customer_id ?? null,
    customerName: customer?.name ?? null,
    visitType: row.visit_type as VisitType,
    outcome: row.outcome as VisitOutcome,
    pipelineStatus: row.pipeline_status ?? "Logged",
    commitmentMade: row.commitment_made ?? false,
    commitmentDetail: row.commitment_detail ?? null,
    notes: row.notes ?? null,
    prospectName: row.prospect_name ?? null,
    prospectPostcode: row.prospect_postcode ?? null,
  };
}

/** Prospects-read mapper (F-20 PR2, risk R1). IDENTICAL to `toVisit` EXCEPT it
 *  preserves a RAW null `pipeline_status` instead of coercing it to 'Logged'.
 *  The admin `prospects` route emits `stage: pipeline_status ? … : null`, so a
 *  null DB value must stay null on the wire — `toVisit`'s `?? 'Logged'` would
 *  silently flip it. This mapper is the documented deviation. */
function toProspectVisit(row: VisitRow): Visit {
  return {
    ...toVisit(row),
    pipelineStatus: row.pipeline_status ?? null,
  };
}

function toNote(row: NoteRow): VisitNote {
  const author = one(row.author ?? null);
  return {
    id: row.id,
    visitId: row.visit_id,
    body: row.body,
    authorId: author?.id ?? null,
    authorName: author?.name ?? "Unknown",
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? null,
  };
}

export function createSupabaseVisitsRepository(
  client: SupabaseClient,
): VisitsRepository {
  return {
    async createVisit(input: CreateVisitInput): Promise<CreatedVisit> {
      const payload: Record<string, unknown> = {
        ...(input.id ? { id: input.id } : {}),
        user_id: input.userId,
        customer_id: input.customerId,
        prospect_name: input.prospectName,
        prospect_postcode: input.prospectPostcode,
        visit_type: input.visitType,
        outcome: input.outcome,
        commitment_made: input.commitmentMade,
        commitment_detail: input.commitmentMade
          ? (input.commitmentDetail ?? null)
          : null,
        notes: input.notes,
      };

      const insert = input.upsert
        ? client.from("visits").upsert(payload, { onConflict: "id" })
        : client.from("visits").insert(payload);

      const { data, error } = await insert.select("id").single();

      if (error || !data) {
        // 23505/409 = unique_violation — already inserted on a previous retry.
        // screen3/sync returns 200 {id, duplicate:true} (NOT an error).
        const code = (error as { code?: string } | null)?.code;
        if (code === "23505") {
          return { id: input.id ?? "", duplicate: true };
        }
        log.error("VisitsRepository.createVisit DB error", {
          error: error?.message,
        });
        throw new ServiceError("Insert failed", {
          cause: error ?? new Error("no row returned"),
        });
      }

      const recordId = (data as { id: string }).id;
      return { id: recordId, duplicate: false };
    },

    async updateProspectLocation(loc: ProspectLocation): Promise<void> {
      // Best-effort fire-and-forget — the route swallows geocode failures.
      try {
        const { error } = await client
          .from("visits")
          .update({
            prospect_lat: loc.lat,
            prospect_lng: loc.lng,
            is_approximate_location: loc.approximate,
          })
          .eq("id", loc.visitId);
        if (error) {
          log.warn("VisitsRepository.updateProspectLocation DB error (non-fatal)", {
            visitId: loc.visitId,
            error: error.message,
          });
        }
      } catch (e) {
        log.warn("VisitsRepository.updateProspectLocation failed (non-fatal)", {
          visitId: loc.visitId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },

    async listForCaller(opts: {
      userId: string;
      isManager: boolean;
    }): Promise<readonly Visit[]> {
      let query = client
        .from("visits")
        .select(TODAY_COLS)
        .order("created_at", { ascending: false });
      // Non-managers see only their own visits.
      if (!opts.isManager) query = query.eq("user_id", opts.userId);

      const { data, error } = await query;
      if (error) {
        log.error("VisitsRepository.listForCaller DB error", {
          error: error.message,
        });
        throw new ServiceError("Failed to fetch visits", { cause: error });
      }
      const rows = (data ?? []) as unknown as VisitRow[];
      return rows.map(toVisit);
    },

    async deleteOwnVisit(id: string, userId: string): Promise<void> {
      const { error } = await client
        .from("visits")
        .delete()
        .eq("id", id)
        .eq("user_id", userId);
      if (error) {
        log.error("VisitsRepository.deleteOwnVisit DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Delete failed", { cause: error });
      }
    },

    async updatePipelineStatus(
      input: UpdatePipelineStatusInput,
    ): Promise<{ id: string } | null> {
      let query = client
        .from("visits")
        .update({ pipeline_status: input.status })
        .eq("id", input.id);
      // Manager updates any; sales restricted to their own.
      if (!input.isManager) query = query.eq("user_id", input.userId);

      const { data, error } = await query.select("id");
      if (error) {
        log.error("VisitsRepository.updatePipelineStatus DB error", {
          id: input.id,
          error: error.message,
        });
        throw new ServiceError("Update failed", { cause: error });
      }
      const rows = (data ?? []) as { id: string }[];
      if (rows.length === 0) return null; // wrong id or not owned
      return { id: rows[0].id };
    },

    async verifyVisitOwnership(
      visitId: string,
      userId: string,
    ): Promise<boolean> {
      const { data, error } = await client
        .from("visits")
        .select("id")
        .eq("id", visitId)
        .eq("user_id", userId)
        .maybeSingle();
      // The route treats (vErr || !visit) as "not authorised" → false.
      if (error || data === null) return false;
      return true;
    },

    async listNotes(visitId: string): Promise<readonly VisitNote[]> {
      const { data, error } = await client
        .from("visit_notes")
        .select(NOTE_COLS)
        .eq("visit_id", visitId)
        .order("created_at", { ascending: true });
      if (error) {
        log.error("VisitsRepository.listNotes DB error", {
          visitId,
          error: error.message,
        });
        throw new ServiceError("Failed to load notes", { cause: error });
      }
      const rows = (data ?? []) as unknown as NoteRow[];
      return rows.map(toNote);
    },

    async createNote(input: CreateVisitNoteInput): Promise<VisitNote> {
      const { data, error } = await client
        .from("visit_notes")
        .insert({
          visit_id: input.visitId,
          user_id: input.userId,
          body: input.body.trim(),
          created_at: new Date().toISOString(),
        })
        .select(NOTE_COLS)
        .single();
      if (error || !data) {
        log.error("VisitsRepository.createNote DB error", {
          visitId: input.visitId,
          error: error?.message,
        });
        throw new ServiceError("Failed to add note", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return toNote(data as unknown as NoteRow);
    },

    async updateNote(input: UpdateVisitNoteInput): Promise<VisitNote | null> {
      let query = client
        .from("visit_notes")
        .update({ body: input.body.trim(), updated_at: new Date().toISOString() })
        .eq("id", input.id);
      // Manager edits any; sales only their own.
      if (!input.isManager) query = query.eq("user_id", input.userId);

      // W1: maybeSingle (NOT single) so a no-match returns null → 404 in PR2,
      // never a throw/500.
      const { data, error } = await query
        .select(NOTE_UPDATE_COLS)
        .maybeSingle();
      if (error) {
        log.error("VisitsRepository.updateNote DB error", {
          id: input.id,
          error: error.message,
        });
        throw new ServiceError("Update failed", { cause: error });
      }
      if (data === null) return null; // no row matched the owner filter
      const row = data as { id: string; body: string; updated_at: string | null };
      return {
        id: row.id,
        visitId: "",
        body: row.body,
        authorId: null,
        authorName: "Unknown",
        createdAt: "",
        updatedAt: row.updated_at ?? null,
      };
    },

    async findDetailById(id: string): Promise<VisitDetail | null> {
      const { data, error } = await client
        .from("visits")
        .select(DETAIL_COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("VisitsRepository.findDetailById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("DB error", { cause: error });
      }
      if (data === null) return null;
      const row = data as unknown as VisitRow;
      const base = toVisit(row);
      const customer = one(row.customers ?? null) as IdNameJoinRow | null;
      return {
        ...base,
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? null,
      };
    },

    async listAllWithFilters(
      filter: AdminVisitFilter,
    ): Promise<readonly Visit[]> {
      let query = client
        .from("visits")
        .select(ADMIN_COLS)
        .gte("created_at", filter.from)
        .lte("created_at", filter.to)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filter.repId) query = query.eq("user_id", filter.repId);
      if (filter.type) query = query.eq("visit_type", filter.type);
      if (filter.outcome) query = query.eq("outcome", filter.outcome);

      const { data, error } = await query;
      if (error) {
        log.error("VisitsRepository.listAllWithFilters DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as VisitRow[];
      return rows.map(toVisit);
    },

    // ── F-20 PR2 — admin insights reads ──────────────────────────────────

    async listProspects(window: {
      from: string;
      to: string;
    }): Promise<readonly Visit[]> {
      const { data, error } = await client
        .from("visits")
        .select(PROSPECTS_COLS)
        .not("prospect_name", "is", null)
        .gte("created_at", window.from)
        .lte("created_at", window.to)
        .order("created_at", { ascending: false });
      if (error) {
        log.error("VisitsRepository.listProspects DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as VisitRow[];
      // R1: toProspectVisit (NOT toVisit) — preserves raw null pipeline_status.
      return rows.map(toProspectVisit);
    },

    async listAtRisk(window: {
      from: string;
      to: string;
    }): Promise<readonly Visit[]> {
      const { data, error } = await client
        .from("visits")
        .select(AT_RISK_COLS)
        .in("outcome", ["at_risk", "lost"])
        .gte("created_at", window.from)
        .lte("created_at", window.to)
        .order("created_at", { ascending: false });
      if (error) {
        log.error("VisitsRepository.listAtRisk DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as VisitRow[];
      return rows.map(toVisit);
    },

    async listCommitments(window: {
      from: string | null;
      to: string;
    }): Promise<readonly Visit[]> {
      // R2: `lt` (NOT lte) on `to`; ASC order; `from` applied ONLY when present.
      let query = client
        .from("visits")
        .select(COMMITMENTS_COLS)
        .eq("commitment_made", true)
        .lt("created_at", window.to)
        .order("created_at", { ascending: true });
      if (window.from) query = query.gte("created_at", window.from);

      const { data, error } = await query;
      if (error) {
        log.error("VisitsRepository.listCommitments DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as VisitRow[];
      return rows.map(toVisit);
    },

    // ── F-21 — admin dashboard reads ──────────────────────────────────────────

    async listTodayForDashboard(window: {
      from: string;
      to: string;
    }): Promise<readonly Visit[]> {
      const { data, error } = await client
        .from("visits")
        .select(DASHBOARD_TODAY_COLS)
        .gte("created_at", window.from)
        .lte("created_at", window.to)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        log.error("VisitsRepository.listTodayForDashboard DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as VisitRow[];
      return rows.map(toVisit);
    },

    async listWeekForDashboard(window: {
      from: string;
      to: string;
    }): Promise<readonly Visit[]> {
      const { data, error } = await client
        .from("visits")
        .select(DASHBOARD_WEEK_COLS)
        .gte("created_at", window.from)
        .lte("created_at", window.to);
      if (error) {
        log.error("VisitsRepository.listWeekForDashboard DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as VisitRow[];
      return rows.map(toVisit);
    },

    async listAtRiskSince(from: string): Promise<readonly Visit[]> {
      // R1 (byte-identity critical): gte-only, NO upper bound — the dashboard
      // at-risk query filters `created_at >= ago7d` with no `lte`, so this method
      // must NOT add one (unlike `listAtRisk({from,to})`).
      const { data, error } = await client
        .from("visits")
        .select(AT_RISK_COLS)
        .in("outcome", ["at_risk", "lost"])
        .gte("created_at", from)
        .order("created_at", { ascending: false });
      if (error) {
        log.error("VisitsRepository.listAtRiskSince DB error", {
          error: error.message,
        });
        throw new ServiceError("Database error", { cause: error });
      }
      const rows = (data ?? []) as unknown as VisitRow[];
      return rows.map(toVisit);
    },

    // ── F-20 PR3 — Map View read ──────────────────────────────────────────────

    async listForMap(window: {
      from: string | null;
      to: string | null;
    }): Promise<readonly MapVisit[]> {
      const out: MapVisit[] = [];

      // Query 1 — existing-customer visits (join customers.lat/lng).
      let custQuery = client
        .from("visits")
        .select(MAP_CUST_VISIT_COLS)
        .not("customer_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (window.from) custQuery = custQuery.gte("created_at", window.from);
      if (window.to) custQuery = custQuery.lte("created_at", window.to);

      const { data: custData, error: custError } = await custQuery;
      if (custError) {
        log.error("VisitsRepository.listForMap (customers) DB error", {
          error: custError.message,
        });
        throw new ServiceError("Map visits read failed", { cause: custError });
      }
      const custRows = (custData ?? []) as unknown as {
        id: string;
        visit_type: string;
        outcome: string;
        created_at: string;
        users: NameJoinRow | NameJoinRow[] | null;
        customers:
          | { name: string; lat: number | null; lng: number | null }
          | { name: string; lat: number | null; lng: number | null }[]
          | null;
      }[];
      for (const r of custRows) {
        const customer = one(r.customers ?? null);
        const lat = customer?.lat;
        const lng = customer?.lng;
        if (lat == null || lng == null) continue;
        const rep = one(r.users ?? null);
        out.push({
          id: r.id,
          lat,
          lng,
          visit_type: r.visit_type,
          outcome: r.outcome,
          rep: rep?.name ?? "Unknown",
          customer_name: customer?.name ?? "Unknown",
          created_at: r.created_at,
          is_prospect: false,
          // customer visits inherit customer coords — already verified.
          is_approximate: false,
        });
      }

      // Query 2 — prospect visits (use prospect_lat/lng on the visit row).
      let prospectQuery = client
        .from("visits")
        .select(MAP_PROSPECT_VISIT_COLS)
        .is("customer_id", null)
        .not("prospect_lat", "is", null)
        .order("created_at", { ascending: false })
        .limit(500);
      if (window.from)
        prospectQuery = prospectQuery.gte("created_at", window.from);
      if (window.to) prospectQuery = prospectQuery.lte("created_at", window.to);

      const { data: prospectData, error: prospectError } = await prospectQuery;
      if (prospectError) {
        log.error("VisitsRepository.listForMap (prospects) DB error", {
          error: prospectError.message,
        });
        throw new ServiceError("Map visits read failed", {
          cause: prospectError,
        });
      }
      const prospectRows = (prospectData ?? []) as unknown as {
        id: string;
        visit_type: string;
        outcome: string;
        created_at: string;
        prospect_name: string | null;
        prospect_lat: number;
        prospect_lng: number;
        is_approximate_location: boolean;
        users: NameJoinRow | NameJoinRow[] | null;
      }[];
      for (const r of prospectRows) {
        const rep = one(r.users ?? null);
        out.push({
          id: r.id,
          lat: r.prospect_lat,
          lng: r.prospect_lng,
          visit_type: r.visit_type,
          outcome: r.outcome,
          rep: rep?.name ?? "Unknown",
          customer_name: r.prospect_name ?? "Prospect",
          created_at: r.created_at,
          is_prospect: true,
          is_approximate: r.is_approximate_location,
        });
      }

      return out;
    },
  };
}

export const supabaseVisitsRepository: VisitsRepository =
  createSupabaseVisitsRepository(supabaseService);
