/**
 * lib/adapters/supabase/PricingRepository.ts
 *
 * Supabase implementation of `PricingRepository`
 * (lib/ports/PricingRepository.ts). One of the adapter files allowed to
 * import `@supabase/supabase-js` (allow-listed for the
 * `lib/adapters/supabase` directory tree at `.eslintrc.json`). The ONLY
 * file that imports the vendor SDK for Pricing.
 *
 * Boundary discipline (ADR-0002 line 27):
 *   PostgREST row shapes are touched only inside the method bodies.
 *   Vendor column names (reference_number, customer_id, prospect_name,
 *   agreed_by, valid_from, valid_until, product_name_override, …) are
 *   mapped to camelCase domain fields, so the rest of the app never sees
 *   the database's spelling. The select strings are copied VERBATIM from
 *   the 5 pricing routes the PR2 re-point will replace, so the wire output
 *   stays byte-identical.
 *
 * Depth (ADR-0002): the reads hide the multi-table embedded join + the
 * per-agreement line sort + the computed `is_expired` (active &&
 * valid_until != null && valid_until < londonToday(), matching the routes
 * exactly); `replaceLines` hides the atomic `replace_agreement_lines` RPC
 * (one Postgres transaction — NEVER adapter-side delete+insert);
 * `addLine` hides the "max position + 1" computation.
 *
 * Construction (factory + singleton — F-06 template):
 *   - `createSupabasePricingRepository(client)` factory — tests pass
 *     `getServiceClient()`; wiring passes the service-role singleton.
 *   - `supabasePricingRepository` singleton — pre-wired against
 *     `supabaseService` (the server-only service-role key).
 *
 * Error contract (per the port JSDoc): reads return null/empty on miss;
 * every DB failure throws ServiceError.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseService } from "@/lib/adapters/supabase/client";
import { ServiceError } from "@/lib/errors";
import { log } from "@/lib/observability/log";
import { londonToday } from "@/lib/dates";
import type {
  PriceAgreement,
  PriceAgreementWithLines,
  PriceLine,
  CreateAgreementInput,
  CreateLineInput,
  UpdateAgreementInput,
  UpdateLineInput,
  CreatedAgreement,
  PatchedAgreement,
  AgreementStatus,
  PriceUnit,
} from "@/lib/domain";
import type { PricingRepository, ListAgreementsFilter } from "@/lib/ports";

// Select field lists copied VERBATIM from the routes the PR2 re-point will
// replace, so the wire output stays byte-identical. The route file remains
// the source of truth for which keys each endpoint returns.
const LINE_COLS =
  "id, product_id, product_name_override, price, unit, notes, position, " +
  "product:products!price_agreement_lines_product_id_fkey(id, name, box_size, code)";

// The routes' wire output OMITS agreed_by, but the ADAPTER hydrates it so
// the domain object is honest and the Supabase read matches the Fake
// (adapter parity, pinned by the contract). PR2's route mapping — not this
// projection — keeps the wire byte-identical (it simply won't emit it).
const AGREEMENT_COLS = `
  id, reference_number, status, valid_from, valid_until, notes, created_at, updated_at,
  customer_id, prospect_name, agreed_by,
  customer:customers!price_agreements_customer_id_fkey(id, name),
  rep:users!price_agreements_agreed_by_fkey(id, name),
  price_agreement_lines(${LINE_COLS})
`;

// ─── coercion helpers ────────────────────────────────────────────────

/** Supabase embeds a to-one join as either an object or a 1-element array. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ─── row shapes (PostgREST) ──────────────────────────────────────────

interface ProductJoinRow {
  id: string;
  name: string;
  box_size: string | null;
  code: string | null;
}

interface LineRow {
  id: string;
  product_id: string | null;
  product_name_override: string | null;
  price: unknown;
  unit: string;
  notes: string | null;
  position: number;
  product?: ProductJoinRow | ProductJoinRow[] | null;
}

interface PersonJoinRow {
  id: string;
  name: string;
}

interface CustomerJoinRow {
  id: string;
  name: string;
}

interface AgreementRow {
  id: string;
  reference_number: string;
  status: string;
  valid_from: string;
  valid_until: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  customer_id: string | null;
  prospect_name: string | null;
  customer?: CustomerJoinRow | CustomerJoinRow[] | null;
  rep?: PersonJoinRow | PersonJoinRow[] | null;
  agreed_by?: string;
  price_agreement_lines?: LineRow[] | null;
}

// ─── row → domain mappers (route mapping copied verbatim) ─────────────

function toPriceLine(l: LineRow): PriceLine {
  const p = one(l.product ?? null);
  return {
    id: l.id,
    productId: l.product_id,
    productNameOverride: l.product_name_override,
    price: Number(l.price),
    unit: l.unit as PriceUnit,
    position: l.position,
    notes: l.notes,
    productName: p?.name ?? l.product_name_override ?? "Unknown",
    boxSize: p?.box_size ?? null,
    code: p?.code ?? null,
    isFreetext: !l.product_id,
  };
}

/** Map a header row to PriceAgreement; `today` drives the computed is_expired. */
function toAgreement(row: AgreementRow, today: string): PriceAgreement {
  const customer = one(row.customer ?? null);
  const rep = one(row.rep ?? null);
  return {
    id: row.id,
    referenceNumber: row.reference_number,
    status: row.status as AgreementStatus,
    customerId: row.customer_id,
    prospectName: row.prospect_name,
    agreedBy: row.agreed_by ?? "",
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isExpired:
      row.status === "active" &&
      row.valid_until != null &&
      row.valid_until < today,
    customerName: customer?.name ?? row.prospect_name ?? "Unknown",
    isProspect: !row.customer_id,
    repId: rep?.id ?? null,
    repName: rep?.name ?? "Unknown",
  };
}

function toAgreementWithLines(
  row: AgreementRow,
  today: string,
): PriceAgreementWithLines {
  const sortedLines = [...(row.price_agreement_lines ?? [])].sort(
    (a, b) => a.position - b.position,
  );
  return {
    ...toAgreement(row, today),
    lines: sortedLines.map(toPriceLine),
  };
}

export function createSupabasePricingRepository(
  client: SupabaseClient,
): PricingRepository {
  return {
    async listAgreements(
      _filter: ListAgreementsFilter,
    ): Promise<readonly PriceAgreement[]> {
      const { data, error } = await client
        .from("price_agreements")
        .select(AGREEMENT_COLS)
        .order("created_at", { ascending: false });
      if (error) {
        log.error("PricingRepository.listAgreements DB error", {
          error: error.message,
        });
        throw new ServiceError("Agreement list failed", { cause: error });
      }
      const today = londonToday();
      return (data ?? []).map((r) =>
        toAgreement(r as unknown as AgreementRow, today),
      );
    },

    async getAgreementById(
      id: string,
    ): Promise<PriceAgreementWithLines | null> {
      const { data, error } = await client
        .from("price_agreements")
        .select(AGREEMENT_COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("PricingRepository.getAgreementById DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Agreement lookup failed", { cause: error });
      }
      return data === null
        ? null
        : toAgreementWithLines(data as unknown as AgreementRow, londonToday());
    },

    async getAgreementForEmail(
      id: string,
    ): Promise<PriceAgreementWithLines | null> {
      // Same full re-fetch as getAgreementById; the PATCH route uses it to
      // build the email body when an agreement is activated.
      const { data, error } = await client
        .from("price_agreements")
        .select(AGREEMENT_COLS)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("PricingRepository.getAgreementForEmail DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Agreement lookup failed", { cause: error });
      }
      return data === null
        ? null
        : toAgreementWithLines(data as unknown as AgreementRow, londonToday());
    },

    async createAgreement(
      input: CreateAgreementInput,
    ): Promise<CreatedAgreement> {
      // 1. Insert the header (status literal 'draft' — today's value).
      const { data: agreement, error: aErr } = await client
        .from("price_agreements")
        .insert({
          customer_id: input.customerId || null,
          prospect_name: input.prospectName || null,
          agreed_by: input.agreedBy,
          valid_from: input.validFrom,
          valid_until: input.validUntil || null,
          notes: input.notes || null,
          status: "draft",
        })
        .select("id, reference_number")
        .single();
      if (aErr || !agreement) {
        log.error("PricingRepository.createAgreement header insert failed", {
          error: aErr?.message,
        });
        throw new ServiceError("Failed to create agreement", {
          cause: aErr ?? new Error("no row returned"),
        });
      }

      // 2. Insert valid lines. A line-insert failure does NOT undo the
      //    header — the route returns the agreement even if lines fail.
      const validLines = input.lines.filter((l) => {
        if (!l.price || l.price <= 0) return false;
        if (!l.productId && !(l.productNameOverride ?? "").trim()) return false;
        return true;
      });
      if (validLines.length) {
        const { error: lErr } = await client
          .from("price_agreement_lines")
          .insert(
            validLines.map((l, i) => ({
              agreement_id: agreement.id,
              product_id: l.productId || null,
              product_name_override: l.productNameOverride || null,
              price: l.price,
              unit: l.unit ?? "per_kg",
              notes: l.notes || null,
              position: l.position ?? i,
            })),
          );
        if (lErr) {
          // Agreement created — keep it even if lines fail (today's behaviour).
          log.error("PricingRepository.createAgreement lines insert failed", {
            agreementId: agreement.id,
            error: lErr.message,
          });
        }
      }

      return {
        id: agreement.id as string,
        referenceNumber: agreement.reference_number as string,
      };
    },

    async updateAgreement(
      id: string,
      patch: UpdateAgreementInput,
    ): Promise<PatchedAgreement | null> {
      const { data, error } = await client
        .from("price_agreements")
        .update(patch)
        .eq("id", id)
        .select("id, reference_number, status, updated_at")
        .maybeSingle();
      if (error) {
        log.error("PricingRepository.updateAgreement DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Update failed", { cause: error });
      }
      if (data === null) return null;
      return {
        id: data.id as string,
        referenceNumber: data.reference_number as string,
        status: data.status as AgreementStatus,
        updatedAt: data.updated_at as string,
      };
    },

    async deleteAgreement(id: string): Promise<void> {
      const { error } = await client
        .from("price_agreements")
        .delete()
        .eq("id", id);
      if (error) {
        log.error("PricingRepository.deleteAgreement DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
    },

    async addLine(
      agreementId: string,
      input: CreateLineInput,
    ): Promise<PriceLine> {
      // next position = max existing + 1 (today's computation), unless pinned.
      const { data: existing } = await client
        .from("price_agreement_lines")
        .select("position")
        .eq("agreement_id", agreementId)
        .order("position", { ascending: false })
        .limit(1);
      const nextPosition =
        input.position ?? ((existing?.[0]?.position ?? -1) + 1);

      const { data: line, error } = await client
        .from("price_agreement_lines")
        .insert({
          agreement_id: agreementId,
          product_id: input.productId || null,
          product_name_override: input.productNameOverride || null,
          price: input.price,
          unit: input.unit ?? "per_kg",
          notes: input.notes || null,
          position: nextPosition,
        })
        .select(LINE_COLS)
        .single();
      if (error || !line) {
        log.error("PricingRepository.addLine DB error", {
          agreementId,
          error: error?.message,
        });
        throw new ServiceError("Failed to add line", {
          cause: error ?? new Error("no row returned"),
        });
      }
      return toPriceLine(line as unknown as LineRow);
    },

    async replaceLines(
      agreementId: string,
      incoming: readonly CreateLineInput[],
    ): Promise<number> {
      // Single atomic Postgres call — delete old lines + insert new lines in
      // one transaction. NEVER adapter-side delete+insert (the transactional
      // guarantee lives in the RPC).
      const newLines = incoming.map((l, i) => ({
        agreement_id: agreementId,
        product_id: l.productId || null,
        product_name_override: l.productNameOverride || null,
        price: l.price,
        unit: l.unit ?? "per_kg",
        notes: l.notes || null,
        position: l.position ?? i,
      }));
      const { error } = await client.rpc("replace_agreement_lines", {
        p_agreement_id: agreementId,
        p_lines: newLines,
      });
      if (error) {
        log.error("PricingRepository.replaceLines DB error", {
          agreementId,
          error: error.message,
        });
        throw new ServiceError("Failed to replace lines", { cause: error });
      }
      return incoming.length;
    },

    async updateLine(
      lineId: string,
      patch: UpdateLineInput,
    ): Promise<PriceLine | null> {
      const { data, error } = await client
        .from("price_agreement_lines")
        .update(patch)
        .eq("id", lineId)
        .select(LINE_COLS)
        .maybeSingle();
      if (error) {
        log.error("PricingRepository.updateLine DB error", {
          lineId,
          error: error.message,
        });
        throw new ServiceError("Update failed", { cause: error });
      }
      return data === null ? null : toPriceLine(data as unknown as LineRow);
    },

    async deleteLine(lineId: string): Promise<void> {
      const { error } = await client
        .from("price_agreement_lines")
        .delete()
        .eq("id", lineId);
      if (error) {
        log.error("PricingRepository.deleteLine DB error", {
          lineId,
          error: error.message,
        });
        throw new ServiceError(error.message, { cause: error });
      }
    },

    async getAgreementOwner(
      id: string,
    ): Promise<{ agreedBy: string; status: AgreementStatus } | null> {
      const { data, error } = await client
        .from("price_agreements")
        .select("agreed_by, status")
        .eq("id", id)
        .maybeSingle();
      if (error) {
        log.error("PricingRepository.getAgreementOwner DB error", {
          id,
          error: error.message,
        });
        throw new ServiceError("Agreement owner lookup failed", {
          cause: error,
        });
      }
      if (data === null) return null;
      return {
        agreedBy: data.agreed_by as string,
        status: data.status as AgreementStatus,
      };
    },

    async getLineOwner(
      lineId: string,
    ): Promise<{ agreedBy: string } | null> {
      const { data, error } = await client
        .from("price_agreement_lines")
        .select("agreement_id, price_agreements!inner(agreed_by)")
        .eq("id", lineId)
        .maybeSingle();
      if (error) {
        log.error("PricingRepository.getLineOwner DB error", {
          lineId,
          error: error.message,
        });
        throw new ServiceError("Line owner lookup failed", { cause: error });
      }
      if (data === null) return null;
      const agreement = one(
        data.price_agreements as
          | { agreed_by: string }
          | { agreed_by: string }[]
          | null,
      );
      return agreement ? { agreedBy: agreement.agreed_by } : null;
    },
  };
}

export const supabasePricingRepository: PricingRepository =
  createSupabasePricingRepository(supabaseService);
