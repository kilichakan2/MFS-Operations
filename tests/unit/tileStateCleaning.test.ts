/**
 * tests/unit/tileStateCleaning.test.ts
 *
 * Cleaning tile state logic.
 * Expected: at least one clean logged per shift.
 * Overdue threshold: 15:00 if nothing logged.
 */

import { describe, it, expect } from 'vitest'

type TileState = 'complete' | 'overdue' | 'due' | 'deviation' | 'neutral'

function cleaningState(countToday: number, hasIssues: boolean, hour: number): TileState {
  if (countToday > 0 && hasIssues)  return 'deviation'
  if (countToday > 0)               return 'complete'
  if (hour >= 15)                   return 'overdue'
  return 'neutral'
}

function cleaningBadge(countToday: number, hasIssues: boolean, hour: number): string {
  if (countToday > 0 && hasIssues)  return `${countToday} logged · issue`
  if (countToday > 0)               return `${countToday} logged`
  if (hour >= 15)                   return 'Overdue'
  return 'None yet'
}

describe('Cleaning tile state', () => {
  it('neutral before 15:00 with nothing logged', () => {
    expect(cleaningState(0, false, 9)).toBe('neutral')
    expect(cleaningState(0, false, 14)).toBe('neutral')
  })

  it('overdue at and after 15:00 with nothing logged', () => {
    expect(cleaningState(0, false, 15)).toBe('overdue')
    expect(cleaningState(0, false, 17)).toBe('overdue')
  })

  it('complete when cleans logged and no issues', () => {
    expect(cleaningState(1, false, 10)).toBe('complete')
    expect(cleaningState(3, false, 16)).toBe('complete')
  })

  it('deviation when cleans logged but issues flagged', () => {
    expect(cleaningState(1, true, 10)).toBe('deviation')
    expect(cleaningState(2, true, 14)).toBe('deviation')
  })
})

describe('Cleaning badge text', () => {
  it('None yet before 15:00', () => {
    expect(cleaningBadge(0, false, 9)).toBe('None yet')
  })

  it('Overdue at and after 15:00', () => {
    expect(cleaningBadge(0, false, 15)).toBe('Overdue')
  })

  it('count logged with no issues', () => {
    expect(cleaningBadge(2, false, 11)).toBe('2 logged')
  })

  it('count logged with issue flag', () => {
    expect(cleaningBadge(1, true, 11)).toBe('1 logged · issue')
  })
})
