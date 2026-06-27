"use client";

/**
 * app/orders/page.tsx
 *
 * Order dashboard — the queue view for office, warehouse, sales, and
 * admin. Butchers do not use this page (they're on the KDS in SB5).
 *
 * Filters: date range, state, customer search, sales rep.
 * Default view: today + tomorrow, excluding completed.
 *
 * Refresh: polls /api/orders every 8 seconds. Realtime subscriptions
 * (Supabase channels) deferred to SB5 (KDS) where sub-second updates
 * matter — for the office dashboard 8-second lag is acceptable and
 * dodges the RLS-vs-anon-key complexity for now.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB3)
 */

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import AppHeader from "@/components/AppHeader";
import RoleNav from "@/components/RoleNav";
import BottomSheetSelector from "@/components/BottomSheetSelector";
import OrderPipelinePausedNotice from "@/components/OrderPipelinePausedNotice";
import OrderCutoverBanner from "@/components/OrderCutoverBanner";
import { useCustomers } from "@/hooks/useReferenceData";
import { isOrderPipelineEnabled } from "@/lib/orders/featureFlag";

import type { OrderState, OrderUom } from "@/lib/domain/Order";
import {
  applyDashboardFilters,
  type DashboardDateFilter,
  type DashboardStateFilter,
} from "@/lib/orders/dashboardFilters";

const POLL_INTERVAL_MS = 8000;

// ─── Types ─────────────────────────────────────────────────────

interface OrderLine {
  id: string;
  line_number: number;
  product_id: string | null;
  ad_hoc_description: string | null;
  quantity: number;
  uom: OrderUom;
  notes: string | null;
  done_at: string | null;
  done_by: string | null;
}

interface OrderRow {
  id: string;
  reference: string;
  delivery_date: string;
  delivery_notes: string | null;
  order_notes: string | null;
  state: OrderState;
  created_at: string;
  printed_at: string | null;
  completed_at: string | null;
  customer: { id: string; name: string; postcode: string | null } | null;
  creator: { id: string; name: string } | null;
  lines: OrderLine[];
}

type DateFilter = DashboardDateFilter;
type StateFilter = DashboardStateFilter;

// ─── Helpers ──────────────────────────────────────────────────

function fmtDeliveryDate(date: string): string {
  return new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

// ─── Page ─────────────────────────────────────────────────────

export default function OrdersDashboardPage() {
  // Feature flag — when disabled, render the paused notice and bail
  // before any of the data-loading hooks run
  if (!isOrderPipelineEnabled()) {
    return <OrderPipelinePausedNotice />;
  }

  return <OrdersDashboardPageInner />;
}

function OrdersDashboardPageInner() {
  const customers = useCustomers();

  // ── Filters ─────────────────────────────────────────────────
  const [dateFilter, setDateFilter] = useState<DateFilter>("today_tomorrow");
  const [stateFilter, setStateFilter] = useState<StateFilter>("active");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);

  // ── Data ────────────────────────────────────────────────────
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastLoad, setLastLoad] = useState<number>(0);

  // Polling — 8s interval, pauses while tab is in background
  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/orders?limit=200", { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(body?.message ?? `Server error (${res.status})`);
        } else {
          setOrders(body.orders ?? []);
          setError(null);
          setLastLoad(Date.now());
        }
      } catch (e) {
        console.error("[OrdersDashboardPage] load failed", e);
        if (!cancelled) setError("Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const filtered = useMemo(
    () =>
      applyDashboardFilters(orders, {
        dateFilter,
        stateFilter,
        customerId,
        search,
      }),
    [orders, dateFilter, stateFilter, customerId, search],
  );

  const selectedCustomerName = customerId
    ? customers.find((c) => c.id === customerId)?.label
    : null;

  // ─────────────────────────────────────────────────────────────

  return (
    <>
      <AppHeader
        title="Orders"
        maxWidth="4xl"
        actions={
          <Link
            href="/orders/new"
            className="rounded-lg bg-slate-900 text-white text-xs font-bold px-3 py-2 hover:bg-slate-800"
          >
            + New order
          </Link>
        }
      />

      <main className="max-w-4xl mx-auto px-4 py-4 pb-32 space-y-3">
        <OrderCutoverBanner />

        {/* Date filter pills */}
        <section className="bg-white rounded-xl border border-slate-200 p-3 space-y-3">
          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Delivery date
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {(
                [
                  ["today", "Today"],
                  ["tomorrow", "Tomorrow"],
                  ["today_tomorrow", "Today + tomorrow"],
                  ["this_week", "This week"],
                  ["all", "All"],
                ] as Array<[DateFilter, string]>
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setDateFilter(k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    dateFilter === k
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
              Status
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {(
                [
                  ["active", "Active"],
                  ["placed", "Placed"],
                  ["printed", "Printed"],
                  ["completed", "Completed"],
                  ["all", "All"],
                ] as Array<[StateFilter, string]>
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setStateFilter(k)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    stateFilter === k
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowCustomerPicker(true)}
              className="flex-1 text-left rounded-xl border-2 border-slate-200 px-3 py-2 text-sm hover:border-slate-300"
            >
              {selectedCustomerName ? (
                <span className="font-semibold text-slate-900">
                  {selectedCustomerName}
                </span>
              ) : (
                <span className="text-slate-400">Filter by customer…</span>
              )}
            </button>
            {customerId && (
              <button
                type="button"
                onClick={() => setCustomerId(null)}
                className="rounded-xl border-2 border-slate-200 px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, customer, sales rep…"
            className="w-full rounded-xl border-2 border-slate-200 px-3 py-2 text-sm"
          />
        </section>

        {/* Status / count line */}
        <div className="flex items-center justify-between px-2 text-xs text-slate-500">
          <span>
            {loading
              ? "Loading…"
              : `${filtered.length} order${filtered.length === 1 ? "" : "s"}`}
          </span>
          {lastLoad > 0 && (
            <span className="text-[10px]">
              Auto-refresh · last update {timeSince(lastLoad)}
            </span>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="rounded-xl bg-red-50 border border-red-300 px-4 py-3 text-sm text-red-900">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <p className="text-slate-400 text-sm">
              No orders match these filters.
            </p>
            <Link
              href="/orders/new"
              className="inline-block mt-3 text-sm font-bold text-blue-600 hover:text-blue-700"
            >
              + Place a new order
            </Link>
          </div>
        )}

        {/* Order list */}
        <ul className="space-y-2">
          {filtered.map((order) => (
            <li key={order.id}>
              <OrderCard order={order} />
            </li>
          ))}
        </ul>
      </main>

      {showCustomerPicker && (
        <BottomSheetSelector
          items={customers}
          onSelect={(c) => {
            setCustomerId(c.id);
            setShowCustomerPicker(false);
          }}
          onDismiss={() => setShowCustomerPicker(false)}
          searchPlaceholder="Search customers"
          title="Filter by customer"
          selectedId={customerId ?? undefined}
        />
      )}

      <RoleNav />
    </>
  );
}

// ─── Card ─────────────────────────────────────────────────────

function OrderCard({ order }: { order: OrderRow }) {
  const doneLineCount = order.lines.filter((l) => l.done_at !== null).length;
  const totalLineCount = order.lines.length;

  return (
    <Link
      href={`/orders/${order.id}`}
      className="block bg-white rounded-xl border border-slate-200 p-3 hover:border-slate-300 active:scale-[0.99] transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-bold bg-slate-900 text-white px-1.5 py-0.5 rounded font-mono">
              {order.reference}
            </span>
            <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
              {fmtDeliveryDate(order.delivery_date)}
            </span>
            <p className="text-slate-900 font-semibold text-sm truncate">
              {order.customer?.name ?? "—"}
            </p>
          </div>

          <div className="mt-1 flex items-center gap-3 text-xs">
            <span className="text-slate-500">
              {totalLineCount} line{totalLineCount === 1 ? "" : "s"}
              {order.state === "printed" && totalLineCount > 0 && (
                <span className="text-slate-400">
                  {" "}
                  · {doneLineCount}/{totalLineCount} done
                </span>
              )}
            </span>
            {order.creator?.name && (
              <span className="text-slate-400">by {order.creator.name}</span>
            )}
          </div>

          {order.delivery_notes && (
            <p className="text-[11px] text-amber-700 mt-1 italic truncate">
              ⏰ {order.delivery_notes}
            </p>
          )}
        </div>

        <StateChip state={order.state} />
      </div>
    </Link>
  );
}

function StateChip({ state }: { state: OrderState }) {
  const styles: Record<OrderState, string> = {
    placed: "bg-blue-100  text-blue-700",
    printed: "bg-amber-100 text-amber-800",
    completed: "bg-green-100 text-green-700",
  };
  const label: Record<OrderState, string> = {
    placed: "Placed",
    printed: "Printed",
    completed: "Completed",
  };
  return (
    <span
      className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${styles[state]}`}
    >
      {label[state]}
    </span>
  );
}

// ─── Time-since helper ───────────────────────────────────────

function timeSince(epochMs: number): string {
  const seconds = Math.floor((Date.now() - epochMs) / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}
