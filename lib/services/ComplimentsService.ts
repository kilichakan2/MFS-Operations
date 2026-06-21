/**
 * lib/services/ComplimentsService.ts
 *
 * The Compliments service (F-17) — business orchestration for the
 * Compliments domain. Factory here, wiring in `lib/wiring/compliments.ts`;
 * depends on the `compliments` port alone, never on another service and
 * never on the adapters folder (lint-enforced, ADR-0002 / F-TD-11).
 *
 * The only logic the routes carry is the `body required` 400 — lifted here
 * with the EXACT message string. Everything else is a thin passthrough to
 * the repository so PR2's routes call ONE object.
 */

import type {
  Compliment,
  ComplimentRecipient,
  CreateComplimentInput,
} from "@/lib/domain";
import type { ComplimentsRepository } from "@/lib/ports";

// ─── Repository bundle ──────────────────────────────────────

export interface ComplimentsServiceDeps {
  readonly compliments: ComplimentsRepository;
}

// ─── Validation result ──────────────────────────────────────

type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; message: string };

// ─── The ComplimentsService interface ───────────────────────

export interface ComplimentsService {
  listRecent(): Promise<readonly Compliment[]>;

  /** Validate body non-empty (the compliments POST `body required` 400). */
  validateCreate(input: CreateComplimentInput): ValidationResult;

  createCompliment(input: CreateComplimentInput): Promise<Compliment>;
  listActiveRecipients(): Promise<readonly ComplimentRecipient[]>;
}

// ─── The factory ────────────────────────────────────────────

export function createComplimentsService(
  deps: ComplimentsServiceDeps,
): ComplimentsService {
  const { compliments } = deps;

  return {
    listRecent: () => compliments.listRecent(),

    validateCreate(input: CreateComplimentInput): ValidationResult {
      if (!input.body?.trim()) {
        return { ok: false, status: 400, message: "body required" };
      }
      return { ok: true };
    },

    createCompliment: (input) => compliments.createCompliment(input),
    listActiveRecipients: () => compliments.listActiveRecipients(),
  };
}
