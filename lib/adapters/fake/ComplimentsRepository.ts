/**
 * lib/adapters/fake/ComplimentsRepository.ts
 *
 * In-memory implementation of `ComplimentsRepository`
 * (lib/ports/ComplimentsRepository.ts). No Supabase SDK import — pure
 * JavaScript Map storage of DOMAIN types. The faithful twin of the Supabase
 * adapter: it reproduces the same observable behaviour so the service unit
 * tests (and PR2 later) can rely on parity.
 *
 * It deliberately mirrors the database's hard rules so both adapters answer
 * identically:
 *   - compliments_body_check (len > 0) → createCompliment rejects a blank body.
 *   - listRecent: newest-first, limit 100, poster/recipient joins resolved.
 *   - listActiveRecipients: active-only, name-ordered.
 *
 * Construction:
 *   - `createFakeComplimentsRepository(seed?)` factory — tests inject the
 *     people the poster/recipient joins resolve against + the active-user
 *     directory, mirroring `createFakeCashRepository`.
 *   - `fakeComplimentsRepository` singleton — empty; barrel symmetry.
 */

import type {
  Compliment,
  ComplimentRecipient,
  CreateComplimentInput,
} from "@/lib/domain";
import type { ComplimentsRepository } from "@/lib/ports";
import { ServiceError } from "@/lib/errors";

/** A user the poster/recipient joins resolve against; `active` + `role` feed
 *  the recipient dropdown read. */
export interface FakeComplimentsUserRef {
  readonly id: string;
  readonly name: string;
  readonly role: string;
  readonly active: boolean;
}

/** Optional directory so reads return populated joins + the recipient list. */
export interface FakeComplimentsSeed {
  /** user id → user (poster / recipient / active-recipient dropdown). */
  readonly users?: Readonly<Record<string, FakeComplimentsUserRef>>;
}

interface StoredCompliment {
  id: string;
  body: string;
  createdAt: string;
  postedBy: string;
  recipientId: string | null;
}

let fakeIdCounter = 0;
function nextId(): string {
  fakeIdCounter += 1;
  const suffix = String(fakeIdCounter).padStart(12, "0");
  return `00000000-0000-0000-0000-${suffix}`;
}

export function createFakeComplimentsRepository(
  seed?: FakeComplimentsSeed,
): ComplimentsRepository {
  const compliments = new Map<string, StoredCompliment>();
  const users = seed?.users ?? {};

  function toCompliment(c: StoredCompliment): Compliment {
    const poster = users[c.postedBy];
    const recipient = c.recipientId ? users[c.recipientId] : undefined;
    return {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      postedById: poster?.id ?? null,
      postedByName: poster?.name ?? "Unknown",
      recipientId: recipient?.id ?? null,
      recipientName: recipient?.name ?? null,
    };
  }

  return {
    async listRecent(): Promise<readonly Compliment[]> {
      return [...compliments.values()]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 100)
        .map(toCompliment);
    },

    async createCompliment(
      input: CreateComplimentInput,
    ): Promise<Compliment> {
      // compliments_body_check: body len > 0 (route trims first).
      const body = input.body.trim();
      if (body.length === 0) {
        throw new ServiceError(
          'new row for relation "compliments" violates check ' +
            'constraint "compliments_body_check"',
        );
      }
      const id = nextId();
      const row: StoredCompliment = {
        id,
        body,
        createdAt: new Date().toISOString(),
        postedBy: input.postedBy,
        recipientId: input.recipientId || null,
      };
      compliments.set(id, row);
      return toCompliment(row);
    },

    async listActiveRecipients(): Promise<readonly ComplimentRecipient[]> {
      return Object.values(users)
        .filter((u) => u.active)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((u) => ({ id: u.id, name: u.name, role: u.role }));
    },
  };
}

export const fakeComplimentsRepository: ComplimentsRepository =
  createFakeComplimentsRepository();
