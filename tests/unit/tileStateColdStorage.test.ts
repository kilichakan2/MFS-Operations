/**
 * tests/unit/tileStateColdStorage.test.ts
 *
 * Tests for Cold Storage tile state and badge derivation.
 * AM expected by 10:00, PM expected by 14:00.
 */

import { describe, it, expect } from 'vitest'

// ── Mirror the tile state logic from the page ─────────────────────────────────

type TileState = 'complete' | 'overdue' | 'due' | 'deviation' | 'neutral'

function coldStorageState(
  amDone: boolean,
  pmDone: boolean,
  hour: number
): TileState {
  if (amDone && pmDone)                      return 'complete'
  if (!pmDone && hour >= 14)                 return 'overdue'   // PM overdue
  if (!amDone && hour >= 10)                 return 'overdue'   // AM overdue
  if (amDone && !pmDone)                     return 'due'       // PM still needed
  return 'neutral'
}

function coldStorageBadge(
  amDone: boolean,
  pmDone: boolean,
  hour: number
): string {
  if (amDone && pmDone)      return 'Done ✓'
  if (!pmDone && hour >= 14) return 'PM overdue'
  if (!amDone && hour >= 10) return 'AM overdue'
  if (amDone && !pmDone)     return 'PM due'
  return 'AM due'
}

function coldStorageOverdueItems(
  amDone: boolean,
  pmDone: boolean,
  hour: number
): string[] {
  const items: string[] = []
  if (!amDone && hour >= 10) items.push('Cold Storage AM')
  if (!pmDone && hour >= 14) items.push('Cold Storage PM')
  return items
}

// ── State tests ───────────────────────────────────────────────────────────────

describe('Cold Storage tile state', () => {
  it('neutral before 10:00 when nothing logged', () => {
    expect(coldStorageState(false, false, 9)).toBe('neutral')
    expect(coldStorageState(false, false, 8)).toBe('neutral')
  })

  it('AM overdue after 10:00 when AM not done', () => {
    expect(coldStorageState(false, false, 10)).toBe('overdue')
    expect(coldStorageState(false, false, 13)).toBe('overdue')
  })

  it('due (amber) when AM done and PM not yet overdue', () => {
    expect(coldStorageState(true, false, 10)).toBe('due')
    expect(coldStorageState(true, false, 13)).toBe('due')
  })

  it('PM overdue after 14:00 when PM not done', () => {
    expect(coldStorageState(true, false, 14)).toBe('overdue')
    expect(coldStorageState(true, false, 17)).toBe('overdue')
    // Even if AM not done AND after 14:00 — still overdue
    expect(coldStorageState(false, false, 14)).toBe('overdue')
  })

  it('complete when both AM and PM done', () => {
    expect(coldStorageState(true, true, 10)).toBe('complete')
    expect(coldStorageState(true, true, 16)).toBe('complete')
  })
})

// ── Badge tests ───────────────────────────────────────────────────────────────

describe('Cold Storage badge text', () => {
  it('shows AM due before 10:00 with nothing logged', () => {
    expect(coldStorageBadge(false, false, 9)).toBe('AM due')
  })

  it('shows AM overdue after 10:00 when AM not done', () => {
    expect(coldStorageBadge(false, false, 10)).toBe('AM overdue')
    expect(coldStorageBadge(false, false, 13)).toBe('AM overdue')
  })

  it('shows PM due when AM done and before 14:00', () => {
    expect(coldStorageBadge(true, false, 11)).toBe('PM due')
    expect(coldStorageBadge(true, false, 13)).toBe('PM due')
  })

  it('shows PM overdue after 14:00 when PM not done', () => {
    expect(coldStorageBadge(true, false, 14)).toBe('PM overdue')
    expect(coldStorageBadge(false, false, 15)).toBe('PM overdue')
  })

  it('shows Done when both sessions logged', () => {
    expect(coldStorageBadge(true, true, 15)).toBe('Done ✓')
  })
})

// ── Sidebar overdue list tests ─────────────────────────────────────────────────

describe('Cold Storage sidebar overdue items', () => {
  it('no items before 10:00', () => {
    expect(coldStorageOverdueItems(false, false, 9)).toEqual([])
  })

  it('AM item after 10:00 when AM not done', () => {
    expect(coldStorageOverdueItems(false, false, 10)).toContain('Cold Storage AM')
  })

  it('PM item after 14:00 when PM not done', () => {
    expect(coldStorageOverdueItems(true, false, 14)).toContain('Cold Storage PM')
  })

  it('both items when neither done after 14:00', () => {
    const items = coldStorageOverdueItems(false, false, 15)
    expect(items).toContain('Cold Storage AM')
    expect(items).toContain('Cold Storage PM')
  })

  it('no items when both done', () => {
    expect(coldStorageOverdueItems(true, true, 15)).toEqual([])
  })
})
