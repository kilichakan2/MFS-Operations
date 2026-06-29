/**
 * tests/unit/printing/labelFetch.test.ts
 *
 * Unit tests for the pure label-response classifier (F-PROD-04 Pass 1).
 *
 * Written BEFORE implementation per workflow rules. Covers every shape of
 * response the print path can receive: a genuine label, a login auth-bounce,
 * hard HTTP errors, and the tricky look-alikes (an empty url, and a label url
 * that merely *contains* the string "/login" in a query param).
 *
 * The classifier is a pure function with no browser dependency — the whole
 * detection decision is testable here without an iframe or a device.
 */

import { describe, it, expect } from 'vitest'
import { classifyLabelResponse } from '@/lib/printing/labelFetch'

describe('classifyLabelResponse', () => {
  it('classifies a real label (no redirect, ok) as "label"', () => {
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: false,
        url: 'https://mfsops.com/api/labels?type=delivery&id=1&format=html',
        status: 200,
      }),
    ).toBe('label')
  })

  it('classifies a redirect to /login as "auth-bounce"', () => {
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: true,
        url: 'https://mfsops.com/login?from=/api/labels',
        status: 200,
      }),
    ).toBe('auth-bounce')
  })

  it('classifies a /login final url as "auth-bounce" even if redirected flag is false', () => {
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: false,
        url: 'https://mfsops.com/login',
        status: 200,
      }),
    ).toBe('auth-bounce')
  })

  it('classifies a 401 as "error"', () => {
    expect(
      classifyLabelResponse({
        ok: false,
        redirected: false,
        url: 'https://mfsops.com/api/labels?type=delivery&id=1',
        status: 401,
      }),
    ).toBe('error')
  })

  it('classifies a 404 as "error"', () => {
    expect(
      classifyLabelResponse({
        ok: false,
        redirected: false,
        url: 'https://mfsops.com/api/labels?type=delivery&id=1',
        status: 404,
      }),
    ).toBe('error')
  })

  it('classifies a 500 as "error"', () => {
    expect(
      classifyLabelResponse({
        ok: false,
        redirected: false,
        url: 'https://mfsops.com/api/labels?type=delivery&id=1',
        status: 500,
      }),
    ).toBe('error')
  })

  it('classifies a malformed/empty url as "error" (guarded, no throw)', () => {
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: false,
        url: '',
        status: 200,
      }),
    ).toBe('error')
  })

  it('does NOT misclassify a label url that merely contains "/login" in a query param', () => {
    // The path is /api/labels — the "/login" is only in the ?from= query string.
    // We match on pathname, not the raw url string, so this stays a real label.
    expect(
      classifyLabelResponse({
        ok: true,
        redirected: false,
        url: 'https://mfsops.com/api/labels?from=/login',
        status: 200,
      }),
    ).toBe('label')
  })
})
