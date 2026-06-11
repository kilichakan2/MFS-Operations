/**
 * lib/api/orders/schemas.ts
 *
 * zod schemas for the Orders route boundary (F-08, plan §5.5). Every
 * inbound body/query/param on the five Orders endpoints is validated
 * here BEFORE anything reaches the service layer.
 *
 * Semantics replicate the retired hand-rolled validator
 * (lib/orders/validation.ts) case for case — same XOR rule for
 * catalogued vs ad-hoc lines, same calendar-true date check, same
 * trim-to-null normalisation, same `Line N: …` message texts (now
 * delivered per-field inside ValidationError.fields instead of a
 * single string).
 *
 * Output shapes are DOMAIN inputs (camelCase `CreateOrderInput`,
 * `OrderPatch`) — the snake_case wire shape never crosses into the
 * service layer.
 *
 * zod confinement: this file (and its lib/api siblings) is the only
 * place zod is imported — see lib/api/validate.ts header.
 */
import { z } from "zod";
import { ValidationError } from "@/lib/errors";
import type {
  CreateOrderInput,
  CreateOrderLineInput,
  OrderFilter,
  OrderPatch,
} from "@/lib/domain";

// ─── Shared primitives ───────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Calendar-true YYYY-MM-DD (same check as the legacy `isYmdDate`). */
function isYmdDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const ymdDateSchema = z
  .string("delivery_date must be a valid YYYY-MM-DD date")
  .refine(isYmdDate, "delivery_date must be a valid YYYY-MM-DD date");

const uuidSchema = (label: string) =>
  z.string(`${label} must be a UUID`).regex(UUID_RE, `${label} must be a UUID`);

/** Trim to string; empty / non-string becomes null (legacy `nullableTrim`). */
function nullableTrim(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// ─── Per-line validation + transform (legacy parity) ─────────

/**
 * Validate one line, emitting issues with the legacy `Line N: …`
 * message texts under path `lines.<i>`. Mirrors
 * lib/orders/validation.ts:79-106 exactly — including the rule that a
 * non-UUID `product_id` counts as NOT set (falls to the
 * "must have either" branch, never a uuid-format error).
 */
function checkLine(line: unknown, i: number, ctx: z.RefinementCtx): void {
  const n = i + 1;
  // Path note (zod v4): issue paths inside superRefine are RELATIVE to
  // the refined schema. linesSchema sits at the `lines` key in both
  // body schemas, so `[i]` surfaces as `lines.<i>` on the wire.
  const issue = (message: string) =>
    ctx.addIssue({ code: "custom", message, path: [i] });

  if (!line || typeof line !== "object") {
    issue(`Line ${n}: not an object`);
    return;
  }
  const l = line as Record<string, unknown>;

  // product_id XOR ad_hoc_description — same rule as the DB CHECK.
  const hasProduct =
    typeof l.product_id === "string" && UUID_RE.test(l.product_id);
  const hasAdHoc =
    typeof l.ad_hoc_description === "string" &&
    l.ad_hoc_description.trim().length > 0;
  if (hasProduct && hasAdHoc) {
    issue(`Line ${n}: cannot have both product_id and ad_hoc_description`);
  }
  if (!hasProduct && !hasAdHoc) {
    issue(`Line ${n}: must have either product_id or ad_hoc_description`);
  }

  if (
    typeof l.quantity !== "number" ||
    !Number.isFinite(l.quantity) ||
    l.quantity <= 0
  ) {
    issue(`Line ${n}: quantity must be a positive number`);
  }

  if (l.uom !== "kg" && l.uom !== "unit") {
    issue(`Line ${n}: uom must be 'kg' or 'unit'`);
  }
}

/** Map a VALIDATED raw line to the domain input (legacy normalisation). */
function toLineInput(line: unknown): CreateOrderLineInput {
  const l = line as Record<string, unknown>;
  const hasProduct =
    typeof l.product_id === "string" && UUID_RE.test(l.product_id);
  return {
    productId: hasProduct ? (l.product_id as string) : null,
    adHocDescription: hasProduct ? null : nullableTrim(l.ad_hoc_description),
    quantity: l.quantity as number,
    uom: l.uom as "kg" | "unit",
    notes: nullableTrim(l.notes),
  };
}

const linesSchema = z
  .array(z.unknown(), "Order must have at least one line")
  .min(1, "Order must have at least one line")
  .superRefine((lines, ctx) => {
    lines.forEach((line, i) => checkLine(line, i, ctx));
  });

// ─── listOrdersQuerySchema ───────────────────────────────────

/**
 * GET /api/orders query params. Input: the raw `searchParams.get(…)`
 * values (string | null). Output: camelCase `OrderFilter`.
 *
 * The legacy limit clamp is preserved verbatim: an invalid limit
 * silently becomes 50 (NOT a 400) — `app/api/orders/route.ts:48`.
 */
export const listOrdersQuerySchema = z
  .object({
    state: z
      .enum(
        ["placed", "printed", "completed"],
        "state must be one of placed, printed, completed",
      )
      .nullish(),
    delivery_date: ymdDateSchema.nullish(),
    customer_id: uuidSchema("customer_id").nullish(),
    created_by: uuidSchema("created_by").nullish(),
    limit: z.string().nullish(),
  })
  .transform(
    (q): OrderFilter => ({
      state: q.state ?? undefined,
      deliveryDate: q.delivery_date ?? undefined,
      customerId: q.customer_id ?? undefined,
      createdBy: q.created_by ?? undefined,
      limit: q.limit
        ? Math.min(200, Math.max(1, parseInt(q.limit, 10) || 50))
        : 50,
    }),
  );

// ─── createOrderBodySchema ───────────────────────────────────

/** POST /api/orders body → domain `CreateOrderInput`. */
export const createOrderBodySchema = z
  .object({
    customer_id: uuidSchema("customer_id"),
    delivery_date: ymdDateSchema,
    delivery_notes: z.unknown().optional(),
    order_notes: z.unknown().optional(),
    lines: linesSchema,
  })
  .transform(
    (b): CreateOrderInput => ({
      customerId: b.customer_id,
      deliveryDate: b.delivery_date,
      deliveryNotes: nullableTrim(b.delivery_notes),
      orderNotes: nullableTrim(b.order_notes),
      lines: b.lines.map(toLineInput),
    }),
  );

// ─── updateOrderBodySchema ───────────────────────────────────

/**
 * PUT /api/orders/[id] body → `{ patch, lineReplacement? }`.
 * Preserves the undefined-vs-null distinction the port contract
 * documents: a field absent from the body is absent from the patch
 * ("leave alone"); an explicit null means "set to NULL".
 */
export const updateOrderBodySchema = z
  .object({
    delivery_date: ymdDateSchema.optional(),
    delivery_notes: z.string().nullable().optional(),
    order_notes: z.string().nullable().optional(),
    lines: linesSchema.optional(),
  })
  .transform(
    (
      b,
    ): {
      patch: OrderPatch;
      lineReplacement?: readonly CreateOrderLineInput[];
    } => {
      const patch: {
        deliveryDate?: string;
        deliveryNotes?: string | null;
        orderNotes?: string | null;
      } = {};
      if (b.delivery_date !== undefined) patch.deliveryDate = b.delivery_date;
      if (b.delivery_notes !== undefined)
        patch.deliveryNotes = b.delivery_notes;
      if (b.order_notes !== undefined) patch.orderNotes = b.order_notes;
      return {
        patch,
        lineReplacement: b.lines ? b.lines.map(toLineInput) : undefined,
      };
    },
  );

// ─── orderIdParamSchema ──────────────────────────────────────

/** `[id]` path param on the detail + picking-list routes. */
export const orderIdParamSchema = uuidSchema("id");

// ─── Idempotency-Key header ──────────────────────────────────

/**
 * Read the optional `Idempotency-Key` header value: absent/blank →
 * undefined (today's code path, bit-for-bit); longer than 200 chars →
 * 400 ValidationError (matches the DB CHECK on the ledger table).
 */
export function idempotencyKeyFromHeader(
  value: string | null,
): string | undefined {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) return undefined;
  if (trimmed.length > 200) {
    throw new ValidationError("Invalid request", {
      "idempotency-key": ["Idempotency-Key must be at most 200 characters"],
    });
  }
  return trimmed;
}
