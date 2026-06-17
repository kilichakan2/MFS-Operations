/**
 * lib/api/kds/schemas.ts
 *
 * zod schemas for the KDS route boundary (F-08, plan §5.5). The KDS
 * endpoints are public (kiosk model — no session); the line-done
 * mutation's inbound contract is exactly what the legacy route
 * checked inline at app/api/kds/lines/[lineId]/done/route.ts:47-55:
 * a uuid lineId path param and a uuid butcher_id in the body.
 *
 * zod confinement: lib/api/** only — see lib/api/validate.ts header.
 */
import { z } from "zod";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `[lineId]` path param (legacy regex equivalent). */
export const kdsLineIdParamSchema = z
  .string("invalid lineId")
  .regex(UUID_RE, "invalid lineId");

/** POST line-done body → `{ butcherId }` (legacy: trim + uuid regex). */
export const kdsLineDoneBodySchema = z
  .object({
    butcher_id: z
      .string("butcher_id required")
      .transform((s) => s.trim())
      .refine((s) => UUID_RE.test(s), "butcher_id required"),
  })
  .transform((b) => ({ butcherId: b.butcher_id }));

/**
 * POST line-undo body → `{ butcherId }` (F-PROD-02). Same inbound
 * contract as line-done (a single uuid butcher_id); a distinct export
 * name keeps the two route boundaries independently evolvable.
 */
export const kdsLineUndoneBodySchema = kdsLineDoneBodySchema;
