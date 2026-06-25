/**
 * lib/adapters/fake/HaccpHandbookRepository.ts
 *
 * In-memory implementation of `HaccpHandbookRepository`
 * (lib/ports/HaccpHandbookRepository.ts). No Supabase SDK import — pure
 * JavaScript storage of DOMAIN types. The faithful twin of the Supabase adapter
 * so the service unit tests can rely on parity.
 *
 * Reads return the seeded fixtures (or [] when unseeded). `listSopContent`
 * returns the seeded `sopContent` regardless of the section/doc inputs — the
 * branch logic lives in the real adapter's `.eq`/`.ilike`; the service's job
 * (which branch + response shape) is what the unit tests exercise.
 *
 * Construction:
 *   - `createFakeHaccpHandbookRepository(seed?)` factory — tests inject fixtures.
 *   - `fakeHaccpHandbookRepository` singleton — empty; barrel symmetry.
 */

import type {
  SopContentEntry,
  SearchResult,
  HaccpDocument,
} from "@/lib/domain";
import type { HaccpHandbookRepository } from "@/lib/ports";

export interface FakeHaccpHandbookSeed {
  readonly sopContent?: readonly SopContentEntry[];
  readonly searchResults?: readonly SearchResult[];
  readonly documents?: readonly HaccpDocument[];
}

export function createFakeHaccpHandbookRepository(
  seed?: FakeHaccpHandbookSeed,
): HaccpHandbookRepository {
  return {
    async listSopContent(): Promise<readonly SopContentEntry[]> {
      return seed?.sopContent ?? [];
    },
    async searchSop(): Promise<readonly SearchResult[]> {
      return seed?.searchResults ?? [];
    },
    async listDocuments(): Promise<readonly HaccpDocument[]> {
      return seed?.documents ?? [];
    },
  };
}

export const fakeHaccpHandbookRepository: HaccpHandbookRepository =
  createFakeHaccpHandbookRepository();
