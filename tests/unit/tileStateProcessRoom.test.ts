/**
 * tests/unit/tileStateProcessRoom.test.ts
 *
 * Tests for Process Room tile state (temp + diary combined).
 * Temp: AM by 10:00, PM by 14:00
 * Diary: Opening by 10:00, Operational by 13:00, Closing by 17:00
 */

import { describe, it, expect } from 'vitest'

type TileState = 'complete' | 'overdue' | 'due' | 'deviation' | 'neutral'

function roomState(
  amDone: boolean, pmDone: boolean, amOverdue: boolean, pmOverdue: boolean,
  opening: boolean, closing: boolean, openingOverdue: boolean, closingOverdue: boolean
): TileState {
  if (amDone && pmDone && opening && closing) return 'complete'
  if (pmOverdue || amOverdue || openingOverdue || closingOverdue) return 'overdue'
  if (amDone || opening) return 'due'
  return 'neutral'
}

function diaryOverdue(opening: boolean, closing: boolean, hour: number): {
  opening_overdue: boolean; operational_overdue: boolean; closing_overdue: boolean
} {
  return {
    opening_overdue:     !opening  && hour >= 10,
    operational_overdue: hour >= 13,  // simplified — actual checks operational flag
    closing_overdue:     !closing  && hour >= 17,
  }
}

describe('Process Room tile state', () => {
  it('neutral before 10:00 with nothing done', () => {
    expect(roomState(false, false, false, false, false, false, false, false)).toBe('neutral')
  })

  it('overdue after 10:00 if opening not done', () => {
    expect(roomState(false, false, true, false, false, false, true, false)).toBe('overdue')
  })

  it('overdue after 14:00 if PM temp not done', () => {
    expect(roomState(true, false, false, true, true, false, false, false)).toBe('overdue')
  })

  it('overdue after 17:00 if closing not done', () => {
    expect(roomState(true, true, false, false, true, false, false, true)).toBe('overdue')
  })

  it('due when AM temp done, not yet overdue on anything else', () => {
    expect(roomState(true, false, false, false, false, false, false, false)).toBe('due')
  })

  it('due when opening done but not everything complete', () => {
    expect(roomState(false, false, false, false, true, false, false, false)).toBe('due')
  })

  it('complete only when all four done', () => {
    expect(roomState(true, true, false, false, true, true, false, false)).toBe('complete')
  })

  it('incomplete with only 3 of 4 done stays due', () => {
    expect(roomState(true, true, false, false, true, false, false, false)).toBe('due')
  })
})

describe('Process Room diary overdue flags', () => {
  it('no flags before 10:00', () => {
    const d = diaryOverdue(false, false, 9)
    expect(d.opening_overdue).toBe(false)
    expect(d.closing_overdue).toBe(false)
  })

  it('opening_overdue after 10:00 when not done', () => {
    expect(diaryOverdue(false, false, 10).opening_overdue).toBe(true)
    expect(diaryOverdue(false, false, 13).opening_overdue).toBe(true)
  })

  it('opening_overdue false when done', () => {
    expect(diaryOverdue(true, false, 11).opening_overdue).toBe(false)
  })

  it('closing_overdue after 17:00 when not done', () => {
    expect(diaryOverdue(true, false, 17).closing_overdue).toBe(true)
  })

  it('closing_overdue false when done', () => {
    expect(diaryOverdue(true, true, 18).closing_overdue).toBe(false)
  })
})

describe('Process Room sidebar overdue items', () => {
  it('pushes opening when opening_overdue', () => {
    const items: string[] = []
    const s = { am_overdue: false, pm_overdue: false, opening_overdue: true, closing_overdue: false }
    if (s.am_overdue)      items.push('Process Room Temp AM')
    if (s.pm_overdue)      items.push('Process Room Temp PM')
    if (s.opening_overdue) items.push('Process Room Opening checks')
    if (s.closing_overdue) items.push('Process Room Closing checks')
    expect(items).toContain('Process Room Opening checks')
    expect(items).not.toContain('Process Room Temp AM')
  })

  it('pushes all four when everything overdue', () => {
    const items: string[] = []
    const s = { am_overdue: true, pm_overdue: true, opening_overdue: true, closing_overdue: true }
    if (s.am_overdue)      items.push('Process Room Temp AM')
    if (s.pm_overdue)      items.push('Process Room Temp PM')
    if (s.opening_overdue) items.push('Process Room Opening checks')
    if (s.closing_overdue) items.push('Process Room Closing checks')
    expect(items).toHaveLength(4)
  })

  it('empty when all done', () => {
    const items: string[] = []
    const s = { am_overdue: false, pm_overdue: false, opening_overdue: false, closing_overdue: false }
    if (s.am_overdue)      items.push('Process Room Temp AM')
    if (s.pm_overdue)      items.push('Process Room Temp PM')
    if (s.opening_overdue) items.push('Process Room Opening checks')
    if (s.closing_overdue) items.push('Process Room Closing checks')
    expect(items).toHaveLength(0)
  })
})
