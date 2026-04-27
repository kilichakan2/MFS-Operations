/**
 * hooks/useHACCPAlarm.ts
 *
 * In-app escalating alarm when HACCP checks are overdue.
 * Uses Web Audio API — works when app is in foreground with screen on.
 *
 * Escalation (every 5 minutes):
 * Round 1: 1 beep, 30% vol, 880Hz
 * Round 2: 2 beeps, 50% vol, 880Hz
 * Round 3: 3 beeps, 70% vol, 1100Hz
 * Round 4: 4 beeps, 90% vol, 1100Hz
 * Round 5+: 5 beeps, 100% vol, 1320Hz
 *
 * Stops automatically when all overdue items are resolved.
 */

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getOverdueItems, getAlarmLevel }            from '@/lib/haccp-alarm-status'

const ALARM_INTERVAL_MS = 5 * 60 * 1000  // 5 minutes
const BEEP_DURATION_MS  = 180             // each beep is 180ms
const BEEP_GAP_MS       = 120             // gap between beeps

// ── Shared AudioContext with iOS unlock ───────────────────────────────────────
// iOS blocks Web Audio until a user gesture. We create the context once and
// resume it on the first touchstart. Subsequent playBeeps() calls reuse it.

let sharedCtx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') {
    sharedCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
  }
  return sharedCtx
}

function unlockAudio() {
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') ctx.resume()
  } catch { /* ignore */ }
}

if (typeof window !== 'undefined') {
  window.addEventListener('touchstart', unlockAudio, { passive: true, capture: true })
  window.addEventListener('touchend',   unlockAudio, { passive: true, capture: true })
  window.addEventListener('click',      unlockAudio, { capture: true })
}

// ── Web Audio beep player ─────────────────────────────────────────────────────

async function playBeeps(count: number, frequency: number, volume: number): Promise<void> {
  try {
    const ctx = getAudioContext()
    // Resume in case iOS suspended it (e.g. after a phone call or background)
    if (ctx.state === 'suspended') await ctx.resume()
    if (ctx.state !== 'running') return  // still blocked — no user gesture yet

    for (let i = 0; i < count; i++) {
      const oscillator = ctx.createOscillator()
      const gainNode   = ctx.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(ctx.destination)

      oscillator.type      = 'sine'
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime)

      // Smooth envelope: ramp up then down to avoid clicks
      gainNode.gain.setValueAtTime(0, ctx.currentTime)
      gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01)
      gainNode.gain.linearRampToValueAtTime(0, ctx.currentTime + BEEP_DURATION_MS / 1000)

      const start = ctx.currentTime + (i * (BEEP_DURATION_MS + BEEP_GAP_MS)) / 1000
      oscillator.start(start)
      oscillator.stop(start + BEEP_DURATION_MS / 1000 + 0.01)
    }

    // Wait for all beeps to finish
    const totalDuration = count * (BEEP_DURATION_MS + BEEP_GAP_MS)
    await new Promise((resolve) => setTimeout(resolve, totalDuration + 100))

  } catch (err) {
    console.warn('[useHACCPAlarm] Web Audio not available:', err)
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

interface HACCPAlarmStatus {
  cold_storage?:    { am_overdue?: boolean; pm_overdue?: boolean }
  processing_room?: { am_overdue?: boolean; pm_overdue?: boolean }
  daily_diary?:     { opening_overdue?: boolean; closing_overdue?: boolean }
  corrective_actions?: { open?: number }
}

interface UseHACCPAlarmResult {
  isAlarming:    boolean
  overdueCount:  number
  alarmLevel:    number   // 1-5, increases every 5 min
  overdueLabels: string[] // human-readable list for display
}

export function useHACCPAlarm(status: HACCPAlarmStatus | null): UseHACCPAlarmResult {
  const [isAlarming,   setIsAlarming]   = useState(false)
  const [alarmLevel,   setAlarmLevel]   = useState(1)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const levelRef    = useRef(1)
  const playingRef  = useRef(false)

  // Map status to overdue items (normalise corrective_actions.open → unresolved_cas)
  const overdueItems = status
    ? getOverdueItems({
        cold_storage:    status.cold_storage,
        processing_room: status.processing_room,
        daily_diary:     status.daily_diary,
        unresolved_cas:  status.corrective_actions?.open ?? 0,
      })
    : []

  const isCurrentlyOverdue = overdueItems.length > 0

  const fireAlarm = useCallback(async () => {
    if (playingRef.current) return  // prevent overlap
    playingRef.current = true

    const level = levelRef.current
    const { beepCount, volume, frequency } = getAlarmLevel(level)

    await playBeeps(beepCount, frequency, volume)
    playingRef.current = false

    // Escalate for next round (cap at 5)
    const next = Math.min(level + 1, 5)
    levelRef.current = next
    setAlarmLevel(next)
  }, [])

  useEffect(() => {
    if (isCurrentlyOverdue) {
      if (!isAlarming) {
        // Start alarm — play immediately then every 5 minutes
        setIsAlarming(true)
        levelRef.current = 1
        setAlarmLevel(1)
        fireAlarm()
        intervalRef.current = setInterval(fireAlarm, ALARM_INTERVAL_MS)
      }
    } else {
      // All clear — stop alarm
      if (isAlarming) {
        setIsAlarming(false)
        setAlarmLevel(1)
        levelRef.current = 1
        if (intervalRef.current) {
          clearInterval(intervalRef.current)
          intervalRef.current = null
        }
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isCurrentlyOverdue, isAlarming, fireAlarm])

  return {
    isAlarming,
    overdueCount:  overdueItems.length,
    alarmLevel,
    overdueLabels: overdueItems.map((i) => i.label),
  }
}
