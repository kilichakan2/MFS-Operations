/**
 * tests/unit/nav/role-nav-matrices.test.ts
 *
 * L1 unit tests for the per-role nav matrix builder + translation
 * dictionary entries that the bottom nav depends on.
 *
 * No jsdom — pure data assertions.
 */

import { describe, it, expect } from 'vitest'
import t from '@/lib/translations'

describe('navCompliments translation', () => {
  it('navCompliments EN is "Compliments"', () => {
    expect(t.navCompliments.en).toBe('Compliments')
  })

  it('navCompliments TR is "Övgüler"', () => {
    expect(t.navCompliments.tr).toBe('Övgüler')
  })
})
