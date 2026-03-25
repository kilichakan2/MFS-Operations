export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard
 *
 * Returns all data for Screen 4 (Management Dashboard) in one request.
 * All queries run in parallel via Promise.all for minimal latency.
 * Uses the service role key — bypasses RLS.
 *
 * Accessible to admin role only (middleware enforces via /api/admin path,
 * but this route is under /api/dashboard which is added to ROLE_PERMISSIONS).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const now    = new Date()
    const ago48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString()
    const ago24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // Zone 1 alerts use rolling server-side windows (timezone-independent).
    // Zone 1 at-risk: rolling 7-day window
    const ago7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()

    // Zone 2 + 3: use client-supplied ISO strings so timezone is correct.
    // The browser computes midnight in local time and sends the ISO string.
    // If absent (e.g. direct API call), fall back to UTC today.
    const todayUTC = new Date(now); todayUTC.setUTCHours(0, 0, 0, 0)
    const searchParams = req.nextUrl.searchParams
    const zoneFrom  = searchParams.get('from') ?? todayUTC.toISOString()
    const zoneTo    = searchParams.get('to')   ?? now.toISOString()
    // Keep for Zone 1 at-risk query
    const weekStartISO = ago7d

    const [
      openComplaintsRes,
      atRiskRes,
      commitmentsRes,
      discTodayRes,
      complaintsTodayRes,
      visitsTodayRes,
      weekDiscRes,
      weekComplaintsRes,
      weekVisitsRes,
      prospectsRes,
    ] = await Promise.all([

      // ── Zone 1: Open complaints > 48h ──────────────────────────────────────
      supabase
        .from('complaints')
        .select('id, created_at, category, description, user_id, customers(name), users!complaints_user_id_fkey(name)')
        .eq('status', 'open')
        .lt('created_at', ago48h)
        .order('created_at', { ascending: true }),

      // ── Zone 1: At risk / Lost visits this week ─────────────────────────────
      supabase
        .from('visits')
        .select('id, created_at, outcome, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)')
        .in('outcome', ['at_risk', 'lost'])
        .gte('created_at', weekStartISO)
        .order('created_at', { ascending: false }),

      // ── Zone 1: Unreviewed commitments > 24h ───────────────────────────────
      supabase
        .from('visits')
        .select('id, created_at, commitment_detail, customer_id, prospect_name, user_id, customers(name), users!visits_user_id_fkey(name)')
        .eq('commitment_made', true)
        .lt('created_at', ago24h)
        .order('created_at', { ascending: true }),

      // ── Zone 2: Discrepancies today ────────────────────────────────────────
      supabase
        .from('discrepancies')
        .select('id, created_at, status, reason, ordered_qty, sent_qty, customers(name), products(name), users!discrepancies_user_id_fkey(name)')
        .gte('created_at', zoneFrom)
        .lte('created_at', zoneTo)
        .order('created_at', { ascending: false })
        .limit(50),

      // ── Zone 2: Complaints today ───────────────────────────────────────────
      supabase
        .from('complaints')
        .select('id, created_at, category, status, description, resolution_note, customers(name), users!complaints_user_id_fkey(name)')
        .gte('created_at', zoneFrom)
        .lte('created_at', zoneTo)
        .order('created_at', { ascending: false })
        .limit(50),

      // ── Zone 2: Visits today ───────────────────────────────────────────────
      supabase
        .from('visits')
        .select('id, created_at, outcome, visit_type, notes, customer_id, prospect_name, customers(name), users!visits_user_id_fkey(name)')
        .gte('created_at', zoneFrom)
        .lte('created_at', zoneTo)
        .order('created_at', { ascending: false })
        .limit(50),

      // ── Zone 3: Discrepancies this week ────────────────────────────────────
      supabase
        .from('discrepancies')
        .select('reason, products(name)')
        .gte('created_at', zoneFrom)
        .lte('created_at', zoneTo),

      // ── Zone 3: Complaints this week ───────────────────────────────────────
      supabase
        .from('complaints')
        .select('category, status, created_at, resolved_at')
        .gte('created_at', zoneFrom)
        .lte('created_at', zoneTo),

      // ── Zone 3: Visits this week ────────────────────────────────────────────
      supabase
        .from('visits')
        .select('visit_type, outcome, user_id, customer_id, prospect_name, users!visits_user_id_fkey(name)')
        .gte('created_at', zoneFrom)
        .lte('created_at', zoneTo),

      // ── Zone 3: Prospects this week ────────────────────────────────────────
      supabase
        .from('visits')
        .select('prospect_name, prospect_postcode, outcome, visit_type, users!visits_user_id_fkey(name)')
        .not('prospect_name', 'is', null)
        .gte('created_at', zoneFrom)
        .lte('created_at', zoneTo)
        .order('created_at', { ascending: false }),
    ])

    // ── Shape Zone 1 ──────────────────────────────────────────────────────────

    const openComplaints48h = (openComplaintsRes.data ?? []).map((c: Record<string, unknown>) => {
      const cust = c.customers as { name: string } | null
      const usr  = (c['users'] as { name: string } | null)
      return {
        id:          c.id,
        customer:    cust?.name ?? 'Unknown',
        category:    String(c.category ?? '').replace(/_/g, ' '),
        description: String(c.description ?? ''),
        loggedBy:    usr?.name ?? 'Unknown',
        hoursAgo:    Math.round((now.getTime() - new Date(c.created_at as string).getTime()) / 3_600_000),
      }
    })

    const atRiskAccounts = (atRiskRes.data ?? []).map((v: Record<string, unknown>) => {
      const cust = v.customers as { name: string } | null
      const usr  = (v['users'] as { name: string } | null)
      return {
        id:       v.id,
        customer: cust?.name ?? (v.prospect_name as string) ?? 'Unknown',
        outcome:  v.outcome as 'at_risk' | 'lost',
        rep:      usr?.name ?? 'Unknown',
        hoursAgo: Math.round((now.getTime() - new Date(v.created_at as string).getTime()) / 3_600_000),
      }
    })

    const unreviewedCommitments = (commitmentsRes.data ?? []).map((v: Record<string, unknown>) => {
      const cust = v.customers as { name: string } | null
      const usr  = (v['users'] as { name: string } | null)
      return {
        id:       v.id,
        customer: cust?.name ?? (v.prospect_name as string) ?? 'Unknown',
        detail:   v.commitment_detail as string ?? '',
        rep:      usr?.name ?? 'Unknown',
        hoursAgo: Math.round((now.getTime() - new Date(v.created_at as string).getTime()) / 3_600_000),
      }
    })

    // ── Shape Zone 2 ──────────────────────────────────────────────────────────

    const discrepanciesToday = (discTodayRes.data ?? []).map((d: Record<string, unknown>) => {
      const cust = d.customers as { name: string } | null
      const prod = d.products  as { name: string } | null
      const usr  = d['users']  as { name: string } | null
      return {
        id:          d.id,
        customer:    cust?.name ?? 'Unknown',
        product:     prod?.name ?? 'Unknown',
        status:      d.status as 'short' | 'not_sent',
        reason:      String(d.reason ?? '').replace(/_/g, ' '),
        orderedQty:  d.ordered_qty != null ? Number(d.ordered_qty) : null,
        sentQty:     d.sent_qty    != null ? Number(d.sent_qty)    : null,
        loggedBy:    usr?.name ?? 'Unknown',
        createdAt:   d.created_at as string,
      }
    })

    const complaintsTodayList = (complaintsTodayRes.data ?? []).map((c: Record<string, unknown>) => {
      const cust = c.customers as { name: string } | null
      const usr  = (c['users'] as { name: string } | null)
      return {
        id:             c.id,
        customer:       cust?.name ?? 'Unknown',
        category:       String(c.category ?? '').replace(/_/g, ' '),
        status:         c.status as 'open' | 'resolved',
        description:    String(c.description ?? ''),
        resolutionNote: c.resolution_note ? String(c.resolution_note) : null,
        loggedBy:       usr?.name ?? 'Unknown',
        createdAt:      c.created_at as string,
      }
    })

    // Group visits today by rep — also keep individual visit list for drill-down
    const visitsByRepMap = new Map<string, {
      rep: string; count: number; outcomes: Record<string, number>
      visits: { id: string; customer: string; visitType: string; outcome: string }[]
    }>()
    for (const v of (visitsTodayRes.data ?? [])) {
      const vr  = v as Record<string, unknown>
      const usr  = (vr['users']     as { name: string } | null)
      const cust = (vr['customers'] as { name: string } | null)
      const rep  = usr?.name ?? 'Unknown'
      if (!visitsByRepMap.has(rep)) {
        visitsByRepMap.set(rep, { rep, count: 0, outcomes: { positive: 0, neutral: 0, at_risk: 0, lost: 0 }, visits: [] })
      }
      const entry   = visitsByRepMap.get(rep)!
      const outcome = String(vr.outcome ?? 'neutral')
      entry.count++
      entry.outcomes[outcome] = (entry.outcomes[outcome] ?? 0) + 1
      entry.visits.push({
        id:        String(vr.id ?? ''),
        customer:  cust?.name ?? String(vr.prospect_name ?? 'Prospect'),
        visitType: String(vr.visit_type ?? '').replace(/_/g, ' '),
        outcome,
        notes:     (vr.notes as string | null) ?? null,
      })
    }
    const visitsToday = Array.from(visitsByRepMap.values())

    // Hunter/Farmer: count existing customers vs prospects across full week
    const allWeekVisits = weekVisitsRes.data ?? []
    const hunterFarmer = {
      existing:  (allWeekVisits as Record<string, unknown>[]).filter(v => v.customer_id != null || (v as Record<string,unknown>).prospect_name == null).length,
      prospects: (allWeekVisits as Record<string, unknown>[]).filter(v => (v as Record<string,unknown>).prospect_name != null).length,
    }

    // ── Shape Zone 3 ──────────────────────────────────────────────────────────

    // Discrepancies by reason
    const reasonMap = new Map<string, number>()
    const productMap = new Map<string, number>()
    for (const d of (weekDiscRes.data ?? [])) {
      const dr = d as Record<string, unknown>
      const reason  = String(dr.reason ?? 'other').replace(/_/g, ' ')
      const prod    = (dr.products as { name: string } | null)?.name ?? 'Unknown'
      reasonMap.set(reason, (reasonMap.get(reason) ?? 0) + 1)
      productMap.set(prod,  (productMap.get(prod)  ?? 0) + 1)
    }
    const weekDiscrepancyReasons = Array.from(reasonMap.entries())
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
    const weekDiscrepancyProducts = Array.from(productMap.entries())
      .map(([product, count]) => ({ product, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    // Complaints by category
    const catMap = new Map<string, number>()
    let resolvedCount = 0
    let totalResolutionMs = 0
    let resolvedWithTime = 0
    for (const c of (weekComplaintsRes.data ?? [])) {
      const cr = c as Record<string, unknown>
      const cat = String(cr.category ?? 'other').replace(/_/g, ' ')
      catMap.set(cat, (catMap.get(cat) ?? 0) + 1)
      if (cr.status === 'resolved' && cr.resolved_at && cr.created_at) {
        resolvedCount++
        const ms = new Date(cr.resolved_at as string).getTime() - new Date(cr.created_at as string).getTime()
        if (ms > 0) { totalResolutionMs += ms; resolvedWithTime++ }
      }
    }
    const weekComplaintCategories = Array.from(catMap.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
    const avgResolutionHours = resolvedWithTime > 0
      ? Math.round(totalResolutionMs / resolvedWithTime / 3_600_000)
      : null

    // Visits by rep
    const repMap = new Map<string, { rep: string; total: number; types: Record<string, number> }>()
    for (const v of (weekVisitsRes.data ?? [])) {
      const vr  = v as Record<string, unknown>
      const usr = (vr['users'] as { name: string } | null)
      const rep = usr?.name ?? 'Unknown'
      if (!repMap.has(rep)) {
        repMap.set(rep, { rep, total: 0, types: { routine: 0, new_pitch: 0, complaint_followup: 0, delivery_issue: 0 } })
      }
      const entry = repMap.get(rep)!
      entry.total++
      const type = String(vr.visit_type ?? 'routine')
      entry.types[type] = (entry.types[type] ?? 0) + 1
    }
    const weekVisitsByRep = Array.from(repMap.values())

    // Prospects
    const prospectsThisWeek = (prospectsRes.data ?? []).map((v: Record<string, unknown>) => {
      const usr = (v['users'] as { name: string } | null)
      return {
        name:      String(v.prospect_name ?? ''),
        postcode:  String(v.prospect_postcode ?? ''),
        outcome:   String(v.outcome ?? '').replace(/_/g, ' '),
        visitType: String(v.visit_type ?? '').replace(/_/g, ' '),
        rep:       usr?.name ?? 'Unknown',
      }
    })

    return NextResponse.json({
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
      // Extras
      avgResolutionHours,
      totalComplaintsWeek: Array.from(catMap.values()).reduce((s, n) => s + n, 0),
      openComplaintsWeek:  (weekComplaintsRes.data ?? []).filter((c: Record<string, unknown>) => (c as Record<string, unknown>).status === 'open').length,
    })

  } catch (err) {
    console.error('[dashboard] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
