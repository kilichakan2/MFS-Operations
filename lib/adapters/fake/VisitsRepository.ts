/**
 * lib/adapters/fake/VisitsRepository.ts
 *
 * In-memory implementation of `VisitsRepository`
 * (lib/ports/VisitsRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage of DOMAIN types. The faithful twin of the Supabase
 * adapter: it reproduces the same observable behaviour so the service unit
 * tests (and PR2 later) can rely on parity.
 *
 * It deliberately mirrors the database / route hard rules so both adapters
 * answer identically:
 *   - createVisit duplicate: a second insert with the same client-supplied id
 *     → duplicate:true (UNIQUE pk), matching screen3/sync's 200. With
 *     upsert:true the same id MERGES the row (on_conflict=id) and is NOT a
 *     duplicate.
 *   - listForCaller: manager → all reps; sales → own. Newest first.
 *   - deleteOwnVisit: only deletes a row owned by userId.
 *   - updatePipelineStatus: manager updates any; sales only own; no match →
 *     null (404).
 *   - verifyVisitOwnership: true iff the visit exists AND belongs to userId.
 *   - updateNote: manager edits any; sales only own; no match → null (W1: the
 *     maybeSingle no-throw path).
 *   - listNotes: oldest first.
 *
 * Construction:
 *   - `createFakeVisitsRepository(seed?)` factory — tests inject the
 *     people/customers the joins resolve against, mirroring
 *     `createFakeComplaintsRepository`.
 *   - `fakeVisitsRepository` singleton — empty; exists for barrel symmetry.
 */

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

/** A trimmed person reference the rep / note-author joins resolve against. */
export interface FakeVisitsPersonRef {
  readonly id: string;
  readonly name: string;
}
/** A trimmed customer reference the customer join resolves against. F-20 PR3
 *  adds optional lat/lng so the Map View read (listForMap) can resolve a
 *  customer visit's coords; absent coords = the row is skipped (customer side). */
export interface FakeVisitsCustomerRef {
  readonly id: string;
  readonly name: string;
  readonly lat?: number | null;
  readonly lng?: number | null;
}

/** A pre-seeded visit row (F-20 PR2 — lets the admin-insight reads' parity tests
 *  plant rows the fake then filters/orders, mirroring the Supabase reads). Only
 *  the fields the insight reads touch are required; the rest default sensibly.
 *  `pipelineStatus` is `string | null` so the R1 null-stage parity case can plant
 *  a null. */
export interface FakeVisitSeed {
  readonly id: string;
  readonly createdAt: string;
  readonly userId: string;
  readonly customerId?: string | null;
  readonly prospectName?: string | null;
  readonly prospectPostcode?: string | null;
  readonly visitType?: VisitType;
  readonly outcome: VisitOutcome;
  readonly pipelineStatus?: string | null;
  readonly commitmentMade?: boolean;
  readonly commitmentDetail?: string | null;
  readonly notes?: string | null;
  // F-20 PR3 — prospect coords for the Map View read (listForMap).
  readonly prospectLat?: number | null;
  readonly prospectLng?: number | null;
  readonly isApproximateLocation?: boolean | null;
}

/** Optional join directories + seed rows so reads return populated joins/data. */
export interface FakeVisitsSeed {
  /** user id → person (rep / note author). */
  readonly people?: Readonly<Record<string, FakeVisitsPersonRef>>;
  /** customer id → customer (visit customer join). */
  readonly customers?: Readonly<Record<string, FakeVisitsCustomerRef>>;
  /** Pre-planted visit rows (F-20 PR2 — admin-insight read parity). */
  readonly visits?: readonly FakeVisitSeed[];
}

interface StoredVisit {
  id: string;
  createdAt: string;
  userId: string; // logger (rep)
  customerId: string | null;
  prospectName: string | null;
  prospectPostcode: string | null;
  visitType: VisitType;
  outcome: VisitOutcome;
  // `string | null` since F-20 PR2: the admin `prospects` read preserves a raw
  // null pipeline_status (R1); every other read defaults a null to 'Logged' via
  // `toVisit`. A seeded row may carry null.
  pipelineStatus: string | null;
  commitmentMade: boolean;
  commitmentDetail: string | null;
  notes: string | null;
  prospectLat?: number | null;
  prospectLng?: number | null;
  isApproximateLocation?: boolean | null;
}

interface StoredNote {
  id: string;
  visitId: string;
  userId: string; // author
  body: string;
  createdAt: string;
  updatedAt: string | null;
}

let fakeIdCounter = 0;
function nextId(): string {
  fakeIdCounter += 1;
  const suffix = String(fakeIdCounter).padStart(12, "0");
  return `00000000-0000-0000-0000-${suffix}`;
}

/** Newest-first by created_at, tie-broken by descending id (later insert =
 *  higher id), so same-instant ordering is deterministic in tests. The real DB
 *  leaves exact-tie ordering unspecified — this never changes distinct order. */
function byNewestThenId(
  a: { createdAt: string; id: string },
  b: { createdAt: string; id: string },
): number {
  if (a.createdAt !== b.createdAt) return b.createdAt.localeCompare(a.createdAt);
  return b.id.localeCompare(a.id);
}

export function createFakeVisitsRepository(
  seed?: FakeVisitsSeed,
): VisitsRepository {
  const visits = new Map<string, StoredVisit>();
  const notes = new Map<string, StoredNote>();
  const people = seed?.people ?? {};
  const customers = seed?.customers ?? {};

  // F-20 PR2: plant any seeded visit rows so the admin-insight reads have data.
  for (const v of seed?.visits ?? []) {
    visits.set(v.id, {
      id: v.id,
      createdAt: v.createdAt,
      userId: v.userId,
      customerId: v.customerId ?? null,
      prospectName: v.prospectName ?? null,
      prospectPostcode: v.prospectPostcode ?? null,
      visitType: v.visitType ?? "routine",
      outcome: v.outcome,
      pipelineStatus: v.pipelineStatus ?? null,
      commitmentMade: v.commitmentMade ?? false,
      commitmentDetail: v.commitmentDetail ?? null,
      notes: v.notes ?? null,
      prospectLat: v.prospectLat ?? null,
      prospectLng: v.prospectLng ?? null,
      isApproximateLocation: v.isApproximateLocation ?? null,
    });
  }

  function nameOf(userId: string | null): string | undefined {
    return userId ? people[userId]?.name : undefined;
  }

  function customerNameOf(customerId: string | null): string | null {
    if (!customerId) return null;
    return customers[customerId]?.name ?? null;
  }

  function toVisit(v: StoredVisit): Visit {
    return {
      id: v.id,
      createdAt: v.createdAt,
      userId: v.userId,
      loggedById: v.userId,
      loggedByName: nameOf(v.userId) ?? null,
      customerId: v.customerId,
      customerName: customerNameOf(v.customerId),
      visitType: v.visitType,
      outcome: v.outcome,
      // Mirror the Supabase `toVisit`'s `?? 'Logged'` default so both adapters
      // answer identically. The admin `prospects` read is the ONE exception — it
      // uses `toProspectVisit` below to keep a raw null (F-20 PR2, R1).
      pipelineStatus: v.pipelineStatus ?? "Logged",
      commitmentMade: v.commitmentMade,
      commitmentDetail: v.commitmentDetail,
      notes: v.notes,
      prospectName: v.prospectName,
      prospectPostcode: v.prospectPostcode,
    };
  }

  /** Prospects-read mapper (F-20 PR2, R1) — IDENTICAL to `toVisit` EXCEPT it
   *  preserves a RAW null `pipeline_status` instead of coercing it to 'Logged',
   *  mirroring the Supabase adapter's `toProspectVisit`. */
  function toProspectVisit(v: StoredVisit): Visit {
    return { ...toVisit(v), pipelineStatus: v.pipelineStatus ?? null };
  }

  function toNote(n: StoredNote): VisitNote {
    return {
      id: n.id,
      visitId: n.visitId,
      body: n.body,
      authorId: n.userId,
      authorName: nameOf(n.userId) ?? "Unknown",
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }

  return {
    async createVisit(input: CreateVisitInput): Promise<CreatedVisit> {
      const commitmentDetail = input.commitmentMade
        ? (input.commitmentDetail ?? null)
        : null;

      if (input.id && visits.has(input.id)) {
        // upsert → merge (on_conflict=id); plain insert → duplicate:true.
        if (input.upsert) {
          const existing = visits.get(input.id)!;
          visits.set(input.id, {
            ...existing,
            userId: input.userId,
            customerId: input.customerId,
            prospectName: input.prospectName,
            prospectPostcode: input.prospectPostcode,
            visitType: input.visitType,
            outcome: input.outcome,
            commitmentMade: input.commitmentMade,
            commitmentDetail,
            notes: input.notes,
          });
          return { id: input.id, duplicate: false };
        }
        return { id: input.id, duplicate: true };
      }

      const id = input.id ?? nextId();
      const row: StoredVisit = {
        id,
        createdAt: new Date().toISOString(),
        userId: input.userId,
        customerId: input.customerId,
        prospectName: input.prospectName,
        prospectPostcode: input.prospectPostcode,
        visitType: input.visitType,
        outcome: input.outcome,
        pipelineStatus: "Logged",
        commitmentMade: input.commitmentMade,
        commitmentDetail,
        notes: input.notes,
      };
      visits.set(id, row);
      return { id, duplicate: false };
    },

    async updateProspectLocation(loc: ProspectLocation): Promise<void> {
      // Best-effort — silently no-op if the visit is absent (the route swallows
      // geocode failures too).
      const v = visits.get(loc.visitId);
      if (!v) return;
      visits.set(loc.visitId, {
        ...v,
        prospectLat: loc.lat,
        prospectLng: loc.lng,
        isApproximateLocation: loc.approximate,
      });
    },

    async listForCaller(opts: {
      userId: string;
      isManager: boolean;
    }): Promise<readonly Visit[]> {
      return [...visits.values()]
        .filter((v) => opts.isManager || v.userId === opts.userId)
        .sort(byNewestThenId)
        .map(toVisit);
    },

    async deleteOwnVisit(id: string, userId: string): Promise<void> {
      const v = visits.get(id);
      // Owner-only filter — a non-owner delete matches no row (no-op, no error,
      // mirroring PostgREST's filtered DELETE returning 0 rows with 2xx).
      if (v && v.userId === userId) visits.delete(id);
    },

    async updatePipelineStatus(
      input: UpdatePipelineStatusInput,
    ): Promise<{ id: string } | null> {
      const v = visits.get(input.id);
      // Manager updates any; sales only own. No match → null (404).
      if (!v || (!input.isManager && v.userId !== input.userId)) return null;
      visits.set(v.id, { ...v, pipelineStatus: input.status });
      return { id: v.id };
    },

    async verifyVisitOwnership(
      visitId: string,
      userId: string,
    ): Promise<boolean> {
      const v = visits.get(visitId);
      return !!v && v.userId === userId;
    },

    async listNotes(visitId: string): Promise<readonly VisitNote[]> {
      return [...notes.values()]
        .filter((n) => n.visitId === visitId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map(toNote);
    },

    async createNote(input: CreateVisitNoteInput): Promise<VisitNote> {
      const id = nextId();
      const createdAt = new Date().toISOString();
      const row: StoredNote = {
        id,
        visitId: input.visitId,
        userId: input.userId,
        body: input.body.trim(),
        createdAt,
        updatedAt: null,
      };
      notes.set(id, row);
      return toNote(row);
    },

    async updateNote(input: UpdateVisitNoteInput): Promise<VisitNote | null> {
      const n = notes.get(input.id);
      // Manager edits any; sales only own. No match → null (W1 — maybeSingle).
      if (!n || (!input.isManager && n.userId !== input.userId)) return null;
      const updated: StoredNote = {
        ...n,
        body: input.body.trim(),
        updatedAt: new Date().toISOString(),
      };
      notes.set(n.id, updated);
      // The route's PATCH select is `id, body, updated_at` — the visitId /
      // author are NOT re-selected, so the Supabase adapter returns blanks for
      // them. Mirror that shape exactly.
      return {
        id: updated.id,
        visitId: "",
        body: updated.body,
        authorId: null,
        authorName: "Unknown",
        createdAt: "",
        updatedAt: updated.updatedAt,
      };
    },

    async findDetailById(id: string): Promise<VisitDetail | null> {
      const v = visits.get(id);
      if (!v) return null;
      const base = toVisit(v);
      return {
        ...base,
        customerId: v.customerId,
        customerName: customerNameOf(v.customerId),
      };
    },

    async listAllWithFilters(
      filter: AdminVisitFilter,
    ): Promise<readonly Visit[]> {
      return [...visits.values()]
        .filter((v) => v.createdAt >= filter.from && v.createdAt <= filter.to)
        .filter((v) => !filter.repId || v.userId === filter.repId)
        .filter((v) => !filter.type || v.visitType === filter.type)
        .filter((v) => !filter.outcome || v.outcome === filter.outcome)
        .sort(byNewestThenId)
        .slice(0, 200)
        .map(toVisit);
    },

    // ── F-20 PR2 — admin insights reads (mirror the Supabase semantics) ──────

    async listProspects(window: {
      from: string;
      to: string;
    }): Promise<readonly Visit[]> {
      // prospect_name NOT NULL; [from,to] inclusive; newest first. R1:
      // toProspectVisit keeps a raw null pipeline_status.
      return [...visits.values()]
        .filter((v) => v.prospectName !== null)
        .filter((v) => v.createdAt >= window.from && v.createdAt <= window.to)
        .sort(byNewestThenId)
        .map(toProspectVisit);
    },

    async listAtRisk(window: {
      from: string;
      to: string;
    }): Promise<readonly Visit[]> {
      // outcome IN (at_risk, lost); [from,to] inclusive; newest first.
      return [...visits.values()]
        .filter((v) => v.outcome === "at_risk" || v.outcome === "lost")
        .filter((v) => v.createdAt >= window.from && v.createdAt <= window.to)
        .sort(byNewestThenId)
        .map(toVisit);
    },

    async listCommitments(window: {
      from: string | null;
      to: string;
    }): Promise<readonly Visit[]> {
      // R2: commitment_made=true; created_at < to (STRICT lt); from applied ONLY
      // when present (>=); OLDEST first (ASC).
      return [...visits.values()]
        .filter((v) => v.commitmentMade === true)
        .filter((v) => v.createdAt < window.to)
        .filter((v) => window.from === null || v.createdAt >= window.from)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
        .map(toVisit);
    },

    // ── F-20 PR3 — Map View read (mirrors the Supabase semantics) ────────────

    async listForMap(window: {
      from: string | null;
      to: string | null;
    }): Promise<readonly MapVisit[]> {
      const inWindow = (createdAt: string): boolean =>
        (window.from === null || createdAt >= window.from) &&
        (window.to === null || createdAt <= window.to);

      const all = [...visits.values()].filter((v) => inWindow(v.createdAt));

      // Customer-side first (skip rows whose customer coords are null), then
      // prospect-side — the same order the Supabase adapter appends them. Each
      // side newest-first, capped at 500.
      const custVisits = all
        .filter((v) => v.customerId !== null)
        .sort(byNewestThenId)
        .slice(0, 500);
      const out: MapVisit[] = [];
      for (const v of custVisits) {
        const cust = v.customerId ? customers[v.customerId] : undefined;
        const lat = cust?.lat;
        const lng = cust?.lng;
        if (lat == null || lng == null) continue;
        out.push({
          id: v.id,
          lat,
          lng,
          visit_type: v.visitType,
          outcome: v.outcome,
          rep: nameOf(v.userId) ?? "Unknown",
          customer_name: cust?.name ?? "Unknown",
          created_at: v.createdAt,
          is_prospect: false,
          is_approximate: false,
        });
      }

      const prospectVisits = all
        .filter((v) => v.customerId === null && v.prospectLat != null)
        .sort(byNewestThenId)
        .slice(0, 500);
      for (const v of prospectVisits) {
        out.push({
          id: v.id,
          lat: v.prospectLat as number,
          lng: v.prospectLng as number,
          visit_type: v.visitType,
          outcome: v.outcome,
          rep: nameOf(v.userId) ?? "Unknown",
          customer_name: v.prospectName ?? "Prospect",
          created_at: v.createdAt,
          is_prospect: true,
          is_approximate: v.isApproximateLocation ?? false,
        });
      }

      return out;
    },
  };
}

export const fakeVisitsRepository: VisitsRepository =
  createFakeVisitsRepository();
