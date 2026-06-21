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

/** A trimmed person reference the rep / note-author joins resolve against. */
export interface FakeVisitsPersonRef {
  readonly id: string;
  readonly name: string;
}
/** A trimmed customer reference the customer join resolves against. */
export interface FakeVisitsCustomerRef {
  readonly id: string;
  readonly name: string;
}

/** Optional join directories so reads return populated joins. */
export interface FakeVisitsSeed {
  /** user id → person (rep / note author). */
  readonly people?: Readonly<Record<string, FakeVisitsPersonRef>>;
  /** customer id → customer (visit customer join). */
  readonly customers?: Readonly<Record<string, FakeVisitsCustomerRef>>;
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
  pipelineStatus: string;
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
      pipelineStatus: v.pipelineStatus,
      commitmentMade: v.commitmentMade,
      commitmentDetail: v.commitmentDetail,
      notes: v.notes,
      prospectName: v.prospectName,
      prospectPostcode: v.prospectPostcode,
    };
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
  };
}

export const fakeVisitsRepository: VisitsRepository =
  createFakeVisitsRepository();
