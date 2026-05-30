/**
 * tests/unit/orders/featureFlag.test.ts
 *
 * Unit tests for lib/orders/featureFlag.ts — the order pipeline
 * feature-flag check.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB6)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { isOrderPipelineEnabled } from '../../../lib/orders/featureFlag'

describe('isOrderPipelineEnabled', () => {
  // Snapshot the env var so each test starts clean. Vitest doesn't
  // sandbox process.env between tests by default.
  const ENV_KEY = 'NEXT_PUBLIC_ORDER_PIPELINE_ENABLED'
  let originalValue: string | undefined

  beforeEach(() => {
    originalValue = process.env[ENV_KEY]
    delete process.env[ENV_KEY]
  })

  afterEach(() => {
    if (originalValue === undefined) {
      delete process.env[ENV_KEY]
    } else {
      process.env[ENV_KEY] = originalValue
    }
  })

  it('defaults to enabled when env var is unset', () => {
    expect(isOrderPipelineEnabled()).toBe(true)
  })

  it('returns true for empty string (treated as unset)', () => {
    process.env[ENV_KEY] = ''
    expect(isOrderPipelineEnabled()).toBe(true)
  })

  it('returns true for "true"', () => {
    process.env[ENV_KEY] = 'true'
    expect(isOrderPipelineEnabled()).toBe(true)
  })

  it('returns true for "TRUE" (case-insensitive)', () => {
    process.env[ENV_KEY] = 'TRUE'
    expect(isOrderPipelineEnabled()).toBe(true)
  })

  it('returns true for "1"', () => {
    process.env[ENV_KEY] = '1'
    expect(isOrderPipelineEnabled()).toBe(true)
  })

  it('returns true for arbitrary truthy-looking strings', () => {
    process.env[ENV_KEY] = 'yes'
    expect(isOrderPipelineEnabled()).toBe(true)
  })

  it('returns false for "false"', () => {
    process.env[ENV_KEY] = 'false'
    expect(isOrderPipelineEnabled()).toBe(false)
  })

  it('returns false for "FALSE" (case-insensitive)', () => {
    process.env[ENV_KEY] = 'FALSE'
    expect(isOrderPipelineEnabled()).toBe(false)
  })

  it('returns false for "False" (mixed case)', () => {
    process.env[ENV_KEY] = 'False'
    expect(isOrderPipelineEnabled()).toBe(false)
  })

  it('returns false for "0"', () => {
    process.env[ENV_KEY] = '0'
    expect(isOrderPipelineEnabled()).toBe(false)
  })
})
