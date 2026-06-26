/**
 * lib/services/DashboardService.ts
 *
 * The "dashboard desk" (F-21) — one place that gathers numbers from the
 * repositories and does EVERY rollup/tally the GET /api/dashboard route did
 * inline. Depends ONLY on ports (+ the pure `londonToday` date helper), never on
 * adapters or another service file (F-TD-05 services-fence; F-TD-11 wiring
 * fence). The composition root in `lib/wiring/dashboard.ts` bolts the concrete
 * adapters to this factory.
 *
 * Determinism (R2): `now` and the `window` are INJECTED — the service NEVER
 * calls `new Date()`. The route reads the clock once, derives the window, and
 * hands both in, so unit tests can freeze time and check every total to the
 * digit.
 *
 * Byte-identity: `load` returns the `DashboardPayload` whose 19 top-level keys
 * are EXACTLY what the route emitted; the route does `NextResponse.json(payload)`
 * unchanged. All the presentation transforms (reason/category/visitType/outcome
 * underscore→space, the `?? 'Unknown'` / `?? 'Prospect'` fallbacks, the
 * hoursAgo arithmetic) live HERE now (lifted verbatim from the route), so the
 * wire output is identical.
 */

import { londonToday } from "@/lib/dates";
import type {
  ComplaintsRepository,
  VisitsRepository,
  DiscrepanciesRepository,
  OrdersRepository,
  PricingRepository,
} from "@/lib/ports";

// ─── injected dependencies + input ───────────────────────────────────

export interface DashboardServiceDeps {
  readonly discrepancies: DiscrepanciesRepository;
  readonly complaints: ComplaintsRepository;
  readonly visits: VisitsRepository;
  readonly orders: OrdersRepository;
  readonly pricing: PricingRepository;
}

export interface DashboardWindow {
  readonly from: string;
  readonly to: string;
}

// ─── the byte-identical payload shape (19 top-level keys) ─────────────

interface OpenComplaint48hRow {
  id: string;
  customer: string;
  category: string;
  description: string;
  loggedBy: string;
  hoursAgo: number;
}
interface AtRiskRow {
  id: string;
  customer: string;
  outcome: "at_risk" | "lost";
  rep: string;
  hoursAgo: number;
}
interface CommitmentRow {
  id: string;
  customer: string;
  detail: string;
  rep: string;
  hoursAgo: number;
}
interface DiscrepancyTodayRow {
  id: string;
  customer: string;
  product: string;
  status: "short" | "not_sent";
  reason: string;
  orderedQty: number | null;
  sentQty: number | null;
  loggedBy: string;
  createdAt: string;
}
interface ComplaintTodayRow {
  id: string;
  customer: string;
  category: string;
  status: "open" | "resolved";
  description: string;
  resolutionNote: string | null;
  loggedBy: string;
  createdAt: string;
}
interface VisitTodayDrill {
  id: string;
  customer: string;
  visitType: string;
  outcome: string;
  pipelineStatus: string;
  notes: string | null;
}
interface VisitsByRepRow {
  rep: string;
  count: number;
  outcomes: Record<string, number>;
  visits: VisitTodayDrill[];
}
interface ReasonCount {
  reason: string;
  count: number;
}
interface ProductCount {
  product: string;
  count: number;
}
interface CategoryCount {
  category: string;
  count: number;
}
interface WeekVisitsByRepRow {
  rep: string;
  total: number;
  types: Record<string, number>;
}
interface ProspectRow {
  name: string;
  postcode: string;
  outcome: string;
  visitType: string;
  rep: string;
}
interface HunterFarmer {
  existing: number;
  prospects: number;
}
interface OrdersToday {
  placed: number;
  printed: number;
  completed: number;
  total: number;
}

export interface DashboardPayload {
  // Zone 1
  openComplaints48h: OpenComplaint48hRow[];
  atRiskAccounts: AtRiskRow[];
  unreviewedCommitments: CommitmentRow[];
  // Zone 2
  discrepanciesToday: DiscrepancyTodayRow[];
  complaintsTodayList: ComplaintTodayRow[];
  visitsToday: VisitsByRepRow[];
  // Zone 3
  weekDiscrepancyReasons: ReasonCount[];
  weekDiscrepancyProducts: ProductCount[];
  weekComplaintCategories: CategoryCount[];
  weekVisitsByRep: WeekVisitsByRepRow[];
  prospectsThisWeek: ProspectRow[];
  hunterFarmer: HunterFarmer;
  // Pricing
  activePricing: number;
  draftPricing: number;
  expiredPricing: number;
  // Item 5a — Orders KPI tile
  ordersToday: OrdersToday;
  // Extras
  avgResolutionHours: number | null;
  totalComplaintsWeek: number;
  openComplaintsWeek: number;
}

export interface DashboardService {
  /** Build the entire Screen-4 payload. `now` and `window` are INJECTED so all
   *  time maths is deterministic — the service NEVER calls new Date(). */
  load(input: { now: Date; window: DashboardWindow }): Promise<DashboardPayload>;
}

// ─── factory ──────────────────────────────────────────────────────────

export function createDashboardService(
  deps: DashboardServiceDeps,
): DashboardService {
  return {
    async load(input: {
      now: Date;
      window: DashboardWindow;
    }): Promise<DashboardPayload> {
      const { now, window } = input;
      const ago48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const ago7d = new Date(
        now.getTime() - 7 * 24 * 60 * 60 * 1000,
      ).toISOString();

      const hoursAgo = (createdAt: string): number =>
        Math.round((now.getTime() - new Date(createdAt).getTime()) / 3_600_000);

      // Fan out the repo reads (mirrors the route's Promise.all).
      const [
        openComplaints,
        atRiskVisits,
        commitmentVisits,
        discToday,
        complaintsToday,
        visitsTodayRows,
        weekDisc,
        weekComplaints,
        weekVisits,
        prospects,
        pricingRows,
        ordersRows,
      ] = await Promise.all([
        deps.complaints.listOpenOlderThan(ago48h),
        deps.visits.listAtRiskSince(ago7d), // R1: gte-only (no upper bound)
        deps.visits.listCommitments({ from: null, to: ago24h }),
        deps.discrepancies.listToday(window),
        deps.complaints.listTodayWithNames(window),
        deps.visits.listTodayForDashboard(window),
        deps.discrepancies.listWeekRollup(window),
        deps.complaints.listWeekRollup(window),
        deps.visits.listWeekForDashboard(window),
        deps.visits.listProspects(window),
        deps.pricing.listAgreements({}),
        deps.orders.listOrders({ deliveryDate: londonToday(now) }),
      ]);

      // ── Shape Zone 1 ─────────────────────────────────────────────────────

      const openComplaints48h: OpenComplaint48hRow[] = openComplaints.map(
        (c) => ({
          id: c.id,
          customer: c.customerName ?? "Unknown",
          category: String(c.category ?? "").replace(/_/g, " "),
          description: String(c.description ?? ""),
          loggedBy: c.loggedByName ?? "Unknown",
          hoursAgo: hoursAgo(c.createdAt),
        }),
      );

      const atRiskAccounts: AtRiskRow[] = atRiskVisits.map((v) => ({
        id: v.id,
        customer: v.customerName ?? v.prospectName ?? "Unknown",
        outcome: v.outcome as "at_risk" | "lost",
        rep: v.loggedByName ?? "Unknown",
        hoursAgo: hoursAgo(v.createdAt),
      }));

      const unreviewedCommitments: CommitmentRow[] = commitmentVisits.map(
        (v) => ({
          id: v.id,
          customer: v.customerName ?? v.prospectName ?? "Unknown",
          detail: v.commitmentDetail ?? "",
          rep: v.loggedByName ?? "Unknown",
          hoursAgo: hoursAgo(v.createdAt),
        }),
      );

      // ── Shape Zone 2 ─────────────────────────────────────────────────────

      const discrepanciesToday: DiscrepancyTodayRow[] = discToday.map((d) => ({
        id: d.id,
        customer: d.customerName ?? "Unknown",
        product: d.productName ?? "Unknown",
        status: d.status,
        reason: String(d.reason ?? "").replace(/_/g, " "),
        orderedQty: d.orderedQty,
        sentQty: d.sentQty,
        loggedBy: d.loggedByName ?? "Unknown",
        createdAt: d.createdAt,
      }));

      const complaintsTodayList: ComplaintTodayRow[] = complaintsToday.map(
        (c) => ({
          id: c.id,
          customer: c.customerName ?? "Unknown",
          category: String(c.category ?? "").replace(/_/g, " "),
          status: c.status,
          description: String(c.description ?? ""),
          resolutionNote: c.resolutionNote ? String(c.resolutionNote) : null,
          loggedBy: c.loggedByName ?? "Unknown",
          createdAt: c.createdAt,
        }),
      );

      // Group visits today by rep — also keep individual visit list for drill-down.
      const visitsByRepMap = new Map<string, VisitsByRepRow>();
      for (const v of visitsTodayRows) {
        const rep = v.loggedByName ?? "Unknown";
        if (!visitsByRepMap.has(rep)) {
          visitsByRepMap.set(rep, {
            rep,
            count: 0,
            outcomes: { positive: 0, neutral: 0, at_risk: 0, lost: 0 },
            visits: [],
          });
        }
        const entry = visitsByRepMap.get(rep)!;
        const outcome = String(v.outcome ?? "neutral");
        entry.count++;
        entry.outcomes[outcome] = (entry.outcomes[outcome] ?? 0) + 1;
        entry.visits.push({
          id: String(v.id ?? ""),
          customer: v.customerName ?? String(v.prospectName ?? "Prospect"),
          visitType: String(v.visitType ?? "").replace(/_/g, " "),
          outcome,
          pipelineStatus: String(v.pipelineStatus ?? "Logged"),
          notes: v.notes ?? null,
        });
      }
      const visitsToday = Array.from(visitsByRepMap.values());

      // Hunter/Farmer: count existing customers vs prospects across full week.
      const hunterFarmer: HunterFarmer = {
        existing: weekVisits.filter(
          (v) => v.customerId != null || v.prospectName == null,
        ).length,
        prospects: weekVisits.filter((v) => v.prospectName != null).length,
      };

      // ── Shape Zone 3 ─────────────────────────────────────────────────────

      // Discrepancies by reason + product.
      const reasonMap = new Map<string, number>();
      const productMap = new Map<string, number>();
      for (const d of weekDisc) {
        const reason = String(d.reason ?? "other").replace(/_/g, " ");
        const prod = d.productName ?? "Unknown";
        reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1);
        productMap.set(prod, (productMap.get(prod) ?? 0) + 1);
      }
      const weekDiscrepancyReasons: ReasonCount[] = Array.from(
        reasonMap.entries(),
      )
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count);
      const weekDiscrepancyProducts: ProductCount[] = Array.from(
        productMap.entries(),
      )
        .map(([product, count]) => ({ product, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Complaints by category + resolution stats.
      const catMap = new Map<string, number>();
      let totalResolutionMs = 0;
      let resolvedWithTime = 0;
      for (const c of weekComplaints) {
        const cat = String(c.category ?? "other").replace(/_/g, " ");
        catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
        if (c.status === "resolved" && c.resolvedAt && c.createdAt) {
          const ms =
            new Date(c.resolvedAt).getTime() - new Date(c.createdAt).getTime();
          if (ms > 0) {
            totalResolutionMs += ms;
            resolvedWithTime++;
          }
        }
      }
      const weekComplaintCategories: CategoryCount[] = Array.from(
        catMap.entries(),
      )
        .map(([category, count]) => ({ category, count }))
        .sort((a, b) => b.count - a.count);
      const avgResolutionHours =
        resolvedWithTime > 0
          ? Math.round(totalResolutionMs / resolvedWithTime / 3_600_000)
          : null;

      // Visits by rep (week).
      const repMap = new Map<string, WeekVisitsByRepRow>();
      for (const v of weekVisits) {
        const rep = v.loggedByName ?? "Unknown";
        if (!repMap.has(rep)) {
          repMap.set(rep, {
            rep,
            total: 0,
            types: {
              routine: 0,
              new_pitch: 0,
              complaint_followup: 0,
              delivery_issue: 0,
            },
          });
        }
        const entry = repMap.get(rep)!;
        entry.total++;
        const type = String(v.visitType ?? "routine");
        entry.types[type] = (entry.types[type] ?? 0) + 1;
      }
      const weekVisitsByRep = Array.from(repMap.values());

      // Prospects (R1-aware: listProspects preserves raw null pipeline_status,
      // but the dashboard does not surface stage here — only the 5 fields below).
      const prospectsThisWeek: ProspectRow[] = prospects.map((v) => ({
        name: String(v.prospectName ?? ""),
        postcode: String(v.prospectPostcode ?? ""),
        outcome: String(v.outcome ?? "").replace(/_/g, " "),
        visitType: String(v.visitType ?? "").replace(/_/g, " "),
        rep: v.loggedByName ?? "Unknown",
      }));

      // ── Pricing snapshot ─────────────────────────────────────────────────
      // londonToday() so an agreement whose validUntil is UK-local-today is not
      // mis-flagged expired in the late-evening UTC roll-over during BST.
      const todayStr = londonToday(now);
      const activePricing = pricingRows.filter(
        (p) =>
          p.status === "active" &&
          !(p.validUntil && p.validUntil < todayStr),
      ).length;
      const draftPricing = pricingRows.filter(
        (p) => p.status === "draft",
      ).length;
      const expiredPricing = pricingRows.filter(
        (p) =>
          p.status === "active" &&
          p.validUntil != null &&
          p.validUntil < todayStr,
      ).length;

      // ── Orders today (Item 5a Orders KPI) ────────────────────────────────
      const ordersToday: OrdersToday = {
        placed: ordersRows.filter((o) => o.state === "placed").length,
        printed: ordersRows.filter((o) => o.state === "printed").length,
        completed: ordersRows.filter((o) => o.state === "completed").length,
        total: ordersRows.length,
      };

      return {
        // Zone 1
        openComplaints48h,
        atRiskAccounts,
        unreviewedCommitments,
        // Zone 2
        discrepanciesToday,
        complaintsTodayList,
        visitsToday,
        // Zone 3
        weekDiscrepancyReasons,
        weekDiscrepancyProducts,
        weekComplaintCategories,
        weekVisitsByRep,
        prospectsThisWeek,
        hunterFarmer,
        // Pricing
        activePricing,
        draftPricing,
        expiredPricing,
        // Item 5a — Orders KPI tile
        ordersToday,
        // Extras
        avgResolutionHours,
        totalComplaintsWeek: Array.from(catMap.values()).reduce(
          (s, n) => s + n,
          0,
        ),
        openComplaintsWeek: weekComplaints.filter((c) => c.status === "open")
          .length,
      };
    },
  };
}
