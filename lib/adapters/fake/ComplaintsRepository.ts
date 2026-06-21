/**
 * lib/adapters/fake/ComplaintsRepository.ts
 *
 * In-memory implementation of `ComplaintsRepository`
 * (lib/ports/ComplaintsRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage of DOMAIN types. The faithful twin of the Supabase
 * adapter: it reproduces the same observable behaviour so the service unit
 * tests (and PR2 later) can rely on parity.
 *
 * It deliberately mirrors the database's hard rules so both adapters answer
 * identically:
 *   - complaints_description_check (len >= 5) → createComplaint rejects.
 *   - complaints_resolution_check → status='resolved' ⇒ all three resolution
 *     fields NOT NULL; status='open' ⇒ all three NULL. createComplaint builds
 *     the payload so the constraint holds; a resolved create with a missing
 *     resolution_note is rejected.
 *   - complaint_notes_body_check (trimmed len >= 1) → createNote rejects.
 *   - createComplaint duplicate: a second insert with the same client-supplied
 *     id → duplicate:true (UNIQUE pk), matching screen2/sync's 200.
 *   - resolveOpen only matches currently-open rows (returns null otherwise).
 *
 * Construction:
 *   - `createFakeComplaintsRepository(seed?)` factory — tests inject the
 *     people/customers the joins resolve against, mirroring
 *     `createFakeCashRepository`.
 *   - `fakeComplaintsRepository` singleton — empty; exists for barrel symmetry.
 */

import type {
  Complaint,
  ComplaintDetail,
  ComplaintNote,
  ComplaintCategory,
  ComplaintReceivedVia,
  ComplaintStatus,
  ComplaintEmailContext,
  CreateComplaintInput,
  CreatedComplaint,
  ResolveComplaintInput,
  CreateNoteInput,
  CreatedNote,
} from "@/lib/domain";
import type { ComplaintsRepository } from "@/lib/ports";
import { ServiceError } from "@/lib/errors";

/** A trimmed person reference the user joins resolve against. */
export interface FakeComplaintsPersonRef {
  readonly id: string;
  readonly name: string;
}
/** A trimmed customer reference the customer join resolves against. */
export interface FakeComplaintsCustomerRef {
  readonly id: string;
  readonly name: string;
}

/** Optional join directories so reads return populated joins. */
export interface FakeComplaintsSeed {
  /** user id → person (logger / resolver / note author). */
  readonly people?: Readonly<Record<string, FakeComplaintsPersonRef>>;
  /** customer id → customer (complaint customer join). */
  readonly customers?: Readonly<Record<string, FakeComplaintsCustomerRef>>;
}

interface StoredComplaint {
  id: string;
  createdAt: string;
  customerId: string;
  category: ComplaintCategory;
  description: string;
  receivedVia: ComplaintReceivedVia;
  userId: string; // logger
  status: ComplaintStatus;
  resolutionNote: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
}

interface StoredNote {
  id: string;
  complaintId: string;
  userId: string; // author
  body: string;
  createdAt: string;
}

let fakeIdCounter = 0;
function nextId(): string {
  fakeIdCounter += 1;
  const suffix = String(fakeIdCounter).padStart(12, "0");
  return `00000000-0000-0000-0000-${suffix}`;
}

export function createFakeComplaintsRepository(
  seed?: FakeComplaintsSeed,
): ComplaintsRepository {
  const complaints = new Map<string, StoredComplaint>();
  const notes = new Map<string, StoredNote>();
  const people = seed?.people ?? {};
  const customers = seed?.customers ?? {};

  function nameOf(userId: string | null): string | undefined {
    return userId ? people[userId]?.name : undefined;
  }

  function customerNameOf(customerId: string | null): string {
    if (!customerId) return "Unknown";
    return customers[customerId]?.name ?? "Unknown";
  }

  function notesFor(complaintId: string): ComplaintNote[] {
    return [...notes.values()]
      .filter((n) => n.complaintId === complaintId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map(toNote);
  }

  function toNote(n: StoredNote): ComplaintNote {
    return {
      id: n.id,
      complaintId: n.complaintId,
      body: n.body,
      authorName: nameOf(n.userId) ?? "Unknown",
      createdAt: n.createdAt,
    };
  }

  function toComplaint(
    c: StoredComplaint,
    withNotes: readonly ComplaintNote[],
  ): Complaint {
    return {
      id: c.id,
      createdAt: c.createdAt,
      category: c.category,
      description: c.description,
      receivedVia: c.receivedVia,
      status: c.status,
      resolutionNote: c.resolutionNote,
      resolvedAt: c.resolvedAt,
      customerName: customerNameOf(c.customerId),
      loggedByName: nameOf(c.userId) ?? "Unknown",
      loggedById: c.userId,
      resolvedByName: c.resolvedBy ? (nameOf(c.resolvedBy) ?? null) : null,
      notes: withNotes,
    };
  }

  return {
    async listAllWithNotes(): Promise<readonly Complaint[]> {
      return [...complaints.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((c) => toComplaint(c, notesFor(c.id)));
    },

    async listOpen(): Promise<readonly Complaint[]> {
      return [...complaints.values()]
        .filter((c) => c.status === "open")
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((c) => toComplaint(c, []));
    },

    async findDetailById(id: string): Promise<ComplaintDetail | null> {
      const c = complaints.get(id);
      if (!c) return null;
      const base = toComplaint(c, []);
      return {
        ...base,
        customerId: c.customerId,
        customerName: customerNameOf(c.customerId),
      };
    },

    async createComplaint(
      input: CreateComplaintInput,
    ): Promise<CreatedComplaint> {
      // UNIQUE pk — a replayed insert with the same client id → duplicate:true.
      if (input.id && complaints.has(input.id)) {
        return {
          id: input.id,
          customerName: customerNameOf(input.customerId),
          duplicate: true,
        };
      }
      // complaints_description_check: description trimmed len >= 5.
      if (input.description.trim().length < 5) {
        throw new ServiceError(
          'new row for relation "complaints" violates check ' +
            'constraint "complaints_description_check"',
        );
      }
      // complaints_resolution_check: resolved ⇒ resolution_note present.
      const isResolved = input.status === "resolved";
      if (isResolved && !input.resolutionNote?.trim()) {
        throw new ServiceError(
          'new row for relation "complaints" violates check ' +
            'constraint "complaints_resolution_check"',
        );
      }
      const id = input.id ?? nextId();
      const row: StoredComplaint = {
        id,
        createdAt: new Date().toISOString(),
        customerId: input.customerId,
        category: input.category,
        description: input.description.trim(),
        receivedVia: input.receivedVia,
        userId: input.loggedBy,
        status: input.status,
        // resolved ⇒ all three set; open ⇒ all three null.
        resolutionNote: isResolved
          ? (input.resolutionNote?.trim() ?? null)
          : null,
        resolvedBy: isResolved ? input.loggedBy : null,
        resolvedAt: isResolved ? new Date().toISOString() : null,
      };
      complaints.set(id, row);
      return {
        id,
        customerName: customerNameOf(input.customerId),
        duplicate: false,
      };
    },

    async resolveOpen(
      input: ResolveComplaintInput,
    ): Promise<{ id: string } | null> {
      const c = complaints.get(input.complaintId);
      // Only resolve currently-open rows (wrong id or already resolved → null).
      if (!c || c.status !== "open") return null;
      const updated: StoredComplaint = {
        ...c,
        status: "resolved",
        resolutionNote: input.resolutionNote.trim(),
        resolvedBy: input.resolvedBy,
        resolvedAt: new Date().toISOString(),
      };
      complaints.set(c.id, updated);
      return { id: c.id };
    },

    async findEmailContext(
      id: string,
    ): Promise<ComplaintEmailContext | null> {
      const c = complaints.get(id);
      if (!c) return null;
      return {
        id: c.id,
        category: c.category,
        description: c.description,
        status: c.status,
        customerName: customerNameOf(c.customerId),
      };
    },

    async createNote(input: CreateNoteInput): Promise<CreatedNote> {
      // complaint_notes_body_check: body trimmed len >= 1.
      const body = input.body.trim();
      if (body.length < 1) {
        throw new ServiceError(
          'new row for relation "complaint_notes" violates check ' +
            'constraint "complaint_notes_body_check"',
        );
      }
      const id = nextId();
      const createdAt = new Date().toISOString();
      const row: StoredNote = {
        id,
        complaintId: input.complaintId,
        userId: input.userId,
        body,
        createdAt,
      };
      notes.set(id, row);
      return { id, body, createdAt };
    },
  };
}

export const fakeComplaintsRepository: ComplaintsRepository =
  createFakeComplaintsRepository();
