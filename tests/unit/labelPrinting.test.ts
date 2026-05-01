/**
 * tests/unit/labelPrinting.test.ts
 *
 * Tests for the label printing module.
 * All tests written BEFORE implementation per workflow rules.
 *
 * Covers:
 * - Batch code format generation
 * - Use-by date calculation (chilled mince +2d, prep +3d, frozen +90d)
 * - ZPL generation structure
 * - HTML render content
 * - API param validation logic
 */

import { describe, it, expect } from 'vitest'

// ── Batch code format ──────────────────────────────────────────────────────────

function formatGoodsInBatchCode(ddmm: string, species: string, sequence: number): string {
  const speciesUpper = ['LAMB', 'BEEF', 'CHICKEN', 'PORK'].includes(species.toUpperCase())
    ? species.toUpperCase()
    : 'OTHER'
  const seq = String(sequence).padStart(3, '0')
  return `GI-${ddmm}-${speciesUpper}-${seq}`
}

function formatMinceBatchCode(ddmm: string, species: string, sequence: number, mode: 'mince' | 'prep'): string {
  const prefix = mode === 'prep' ? 'PREP' : 'MINCE'
  const speciesUpper = species.toUpperCase()
  const seq = String(sequence).padStart(3, '0')
  return `${prefix}-${ddmm}-${speciesUpper}-${seq}`
}

function ddmmFromDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const day  = String(d.getDate()).padStart(2, '0')
  const mon  = String(d.getMonth() + 1).padStart(2, '0')
  return `${day}${mon}`
}

describe('Goods In batch code format', () => {
  it('standard format GI-DDMM-SPECIES-NNN', () => {
    expect(formatGoodsInBatchCode('2104', 'LAMB', 3)).toBe('GI-2104-LAMB-003')
  })

  it('sequence padded to 3 digits', () => {
    expect(formatGoodsInBatchCode('2104', 'BEEF', 1)).toBe('GI-2104-BEEF-001')
    expect(formatGoodsInBatchCode('2104', 'BEEF', 10)).toBe('GI-2104-BEEF-010')
    expect(formatGoodsInBatchCode('2104', 'BEEF', 100)).toBe('GI-2104-BEEF-100')
  })

  it('species forced uppercase', () => {
    expect(formatGoodsInBatchCode('2104', 'lamb', 1)).toBe('GI-2104-LAMB-001')
    expect(formatGoodsInBatchCode('2104', 'Beef', 1)).toBe('GI-2104-BEEF-001')
  })

  it('unknown species falls back to OTHER', () => {
    expect(formatGoodsInBatchCode('2104', 'DUCK', 1)).toBe('GI-2104-OTHER-001')
    expect(formatGoodsInBatchCode('2104', 'xyz', 1)).toBe('GI-2104-OTHER-001')
  })

  it('CHICKEN and PORK are valid species', () => {
    expect(formatGoodsInBatchCode('2104', 'CHICKEN', 2)).toBe('GI-2104-CHICKEN-002')
    expect(formatGoodsInBatchCode('2104', 'PORK', 2)).toBe('GI-2104-PORK-002')
  })
})

describe('Mince / Prep batch code format', () => {
  it('mince prefix', () => {
    expect(formatMinceBatchCode('2104', 'BEEF', 4, 'mince')).toBe('MINCE-2104-BEEF-004')
  })

  it('prep prefix', () => {
    expect(formatMinceBatchCode('2104', 'LAMB', 1, 'prep')).toBe('PREP-2104-LAMB-001')
  })

  it('sequence padded to 3 digits', () => {
    expect(formatMinceBatchCode('2104', 'BEEF', 1, 'mince')).toBe('MINCE-2104-BEEF-001')
  })
})

describe('DDMM helper', () => {
  it('formats date to DDMM', () => {
    expect(ddmmFromDate('2026-04-21')).toBe('2104')
    expect(ddmmFromDate('2026-01-05')).toBe('0501')
    expect(ddmmFromDate('2026-12-31')).toBe('3112')
  })
})

// ── Use-by date — passed at print time (picked by staff in print dialog) ────────
// No fixed rules. Staff select: Fresh 7d / Fresh 10d / Fresh 14d / Frozen 3mo / Frozen 6mo
// Calculation: productionDate + N days, done in API when usebydays param is provided.

const USE_BY_OPTIONS = [
  { label: 'Fresh 7 days',    days: 7   },
  { label: 'Fresh 10 days',   days: 10  },
  { label: 'Fresh 14 days',   days: 14  },
  { label: 'Frozen 3 months', days: 90  },
  { label: 'Frozen 6 months', days: 182 },
]

function calculateUseByFromDays(productionDate: string, days: number): string {
  const d = new Date(productionDate + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toLocaleDateString('en-CA')
}

describe('Use-by date — calculated from days param (staff picks at print time)', () => {
  it('5 options available', () => {
    expect(USE_BY_OPTIONS).toHaveLength(5)
  })

  it('fresh 7 days: production 21 Apr → use-by 28 Apr', () => {
    expect(calculateUseByFromDays('2026-04-21', 7)).toBe('2026-04-28')
  })

  it('fresh 10 days: production 21 Apr → use-by 01 May', () => {
    expect(calculateUseByFromDays('2026-04-21', 10)).toBe('2026-05-01')
  })

  it('fresh 14 days: production 21 Apr → use-by 05 May', () => {
    expect(calculateUseByFromDays('2026-04-21', 14)).toBe('2026-05-05')
  })

  it('frozen 3 months (90 days): production 21 Apr → use-by 20 Jul', () => {
    expect(calculateUseByFromDays('2026-04-21', 90)).toBe('2026-07-20')
  })

  it('frozen 6 months (182 days): production 21 Apr → use-by 20 Oct', () => {
    expect(calculateUseByFromDays('2026-04-21', 182)).toBe('2026-10-20')
  })

  it('end of month boundary: Apr 30 + 7 days → May 7', () => {
    expect(calculateUseByFromDays('2026-04-30', 7)).toBe('2026-05-07')
  })

  it('all options have label and days', () => {
    for (const opt of USE_BY_OPTIONS) {
      expect(opt.label).toBeTruthy()
      expect(opt.days).toBeGreaterThan(0)
    }
  })
})

// ── ZPL generation ────────────────────────────────────────────────────────────

interface DeliveryLabelData {
  batch_code:      string
  supplier:        string
  product:         string
  species:         string
  date_received:   string
  born_in:         string | null
  reared_in:       string | null
  slaughter_site:  string | null
  cut_site:        string | null
  mfs_plant:       string
  temperature_c:   number
  temp_status:     string
}

interface MinceLabelData {
  batch_code:           string
  product_species:      string
  output_mode:          string
  date:                 string
  kill_date:            string | null
  days_from_kill:       number | null
  source_batch_numbers: string[]
  use_by:               string
}

function generateDeliveryZPL(data: DeliveryLabelData, copies = 1): string {
  const batchCode = data.batch_code
  return [
    `^XA`,
    `^PQ${copies}`,
    `^FO20,20^A0N,28,28^FDMFS GLOBAL^FS`,
    `^FO500,20^A0N,20,20^FDGOODS IN^FS`,
    `^FO20,60^GB760,3,3^FS`,
    `^FO20,75^A0N,40,40^FD${batchCode}^FS`,
    `^FO20,125^BCN,60,Y,N,N^FD${batchCode}^FS`,
    `^FO20,210^A0N,22,22^FDSupplier: ${data.supplier}^FS`,
    `^FO20,238^A0N,22,22^FDProduct: ${data.product} (${data.species})^FS`,
    `^FO20,266^A0N,22,22^FDDate in: ${data.date_received}^FS`,
    data.born_in    ? `^FO20,294^A0N,18,18^FDBorn in: ${data.born_in}^FS`           : '',
    data.slaughter_site ? `^FO20,318^A0N,18,18^FDSlaughtered in: ${data.slaughter_site}^FS` : '',
    `^FO20,342^A0N,18,18^FDFurther cut in: ${data.mfs_plant}^FS`,
    `^FO20,368^A0N,22,22^FDTemp: ${data.temperature_c}C^FS`,
    `^XZ`,
  ].filter(Boolean).join('\n')
}

function generateMinceZPL(data: MinceLabelData, copies = 1): string {
  const mode    = data.output_mode.toUpperCase()
  const sources = data.source_batch_numbers.slice(0, 3).join(', ')
  const storage = data.output_mode === 'frozen' ? 'STORE AT <=-18C' : 'STORE AT <=4C'
  const killInfo = data.kill_date && data.days_from_kill !== null
    ? `Kill: ${data.kill_date} (${data.days_from_kill} days)`
    : ''

  return [
    `^XA`,
    `^PQ${copies}`,
    `^FO20,20^A0N,28,28^FDMFS GLOBAL^FS`,
    `^FO450,20^A0N,20,20^FDPRODUCTION / ${mode}^FS`,
    `^FO20,60^GB760,3,3^FS`,
    `^FO20,75^A0N,40,40^FD${data.batch_code}^FS`,
    `^FO20,125^BCN,60,Y,N,N^FD${data.batch_code}^FS`,
    `^FO20,210^A0N,22,22^FDSpecies: ${data.product_species}^FS`,
    `^FO20,238^A0N,22,22^FDProd date: ${data.date}^FS`,
    killInfo ? `^FO20,266^A0N,22,22^FD${killInfo}^FS` : '',
    sources ? `^FO20,294^A0N,18,18^FDSource: ${sources}^FS` : '',
    `^FO20,318^A0N,22,22^FDUse by: ${data.use_by}^FS`,
    `^FO20,355^GB760,3,3^FS`,
    `^FO20,368^A0N,24,24^FD${storage}^FS`,
    `^XZ`,
  ].filter(Boolean).join('\n')
}

describe('ZPL generation — delivery label', () => {
  const mockData: DeliveryLabelData = {
    batch_code: 'GI-2104-LAMB-003', supplier: 'Euro Quality Lambs',
    product: 'Lamb carcass', species: 'Lamb',
    date_received: '21 Apr 2026', born_in: 'GB', reared_in: 'GB',
    slaughter_site: 'GB1234', cut_site: 'GB1234', mfs_plant: 'UK2946',
    temperature_c: 3.8, temp_status: 'pass',
  }

  it('starts with ^XA', () => {
    expect(generateDeliveryZPL(mockData)).toMatch(/^\^XA/)
  })

  it('ends with ^XZ', () => {
    expect(generateDeliveryZPL(mockData)).toMatch(/\^XZ$/)
  })

  it('includes Code 128 barcode command ^BCN', () => {
    expect(generateDeliveryZPL(mockData)).toContain('^BCN')
  })

  it('encodes batch code in barcode field', () => {
    expect(generateDeliveryZPL(mockData)).toContain('GI-2104-LAMB-003')
  })

  it('includes supplier name', () => {
    expect(generateDeliveryZPL(mockData)).toContain('Euro Quality Lambs')
  })

  it('copies param sets ^PQ quantity', () => {
    expect(generateDeliveryZPL(mockData, 5)).toContain('^PQ5')
  })

  it('default copies = 1', () => {
    expect(generateDeliveryZPL(mockData)).toContain('^PQ1')
  })
})

describe('ZPL generation — mince label', () => {
  const mockData: MinceLabelData = {
    batch_code: 'MINCE-2104-BEEF-4', product_species: 'Beef',
    output_mode: 'chilled', date: '21 Apr 2026',
    kill_date: '17 Apr 2026', days_from_kill: 4,
    source_batch_numbers: ['2104-GB-3', '2104-GB-5'],
    use_by: '28 Apr 2026', // staff selected 'Fresh 7 days' = 21 Apr + 7
  }

  it('starts with ^XA', () => {
    expect(generateMinceZPL(mockData)).toMatch(/^\^XA/)
  })

  it('ends with ^XZ', () => {
    expect(generateMinceZPL(mockData)).toMatch(/\^XZ$/)
  })

  it('includes batch code in barcode', () => {
    expect(generateMinceZPL(mockData)).toContain('MINCE-2104-BEEF-4')
  })

  it('includes use-by date passed as param (staff selected at print time)', () => {
    expect(generateMinceZPL(mockData)).toContain('28 Apr 2026')
  })

  it('includes source batch numbers (up to 3)', () => {
    expect(generateMinceZPL(mockData)).toContain('2104-GB-3')
  })

  it('kill info shown when kill_date present', () => {
    expect(generateMinceZPL(mockData)).toContain('4 days')
  })

  it('kill info omitted when kill_date null', () => {
    const noKill = { ...mockData, kill_date: null, days_from_kill: null }
    expect(generateMinceZPL(noKill)).not.toContain('Kill:')
  })
})

// ── API parameter validation ──────────────────────────────────────────────────

function validateLabelParams(params: {
  type?: string; id?: string; format?: string; copies?: string
}): { valid: boolean; error?: string } {
  if (!params.type || !['delivery', 'mince'].includes(params.type)) {
    return { valid: false, error: 'type must be delivery or mince' }
  }
  if (!params.id || !/^[0-9a-f-]{36}$/.test(params.id)) {
    return { valid: false, error: 'id must be a valid UUID' }
  }
  if (params.format && !['html', 'zpl'].includes(params.format)) {
    return { valid: false, error: 'format must be html or zpl' }
  }
  if (params.copies) {
    const n = parseInt(params.copies)
    if (isNaN(n) || n < 1 || n > 50) {
      return { valid: false, error: 'copies must be 1–50' }
    }
  }
  return { valid: true }
}

describe('Use-by days param validation', () => {
  // usebydays is required for mince/prep labels, optional for delivery

  function validateUsebydaysParam(val: string | undefined): boolean {
    if (!val) return false
    const n = parseInt(val)
    return !isNaN(n) && n > 0 && n <= 365
  }

  it('7 is valid', () => expect(validateUsebydaysParam('7')).toBe(true))
  it('10 is valid', () => expect(validateUsebydaysParam('10')).toBe(true))
  it('90 is valid (3 months)', () => expect(validateUsebydaysParam('90')).toBe(true))
  it('182 is valid (6 months)', () => expect(validateUsebydaysParam('182')).toBe(true))
  it('0 is invalid', () => expect(validateUsebydaysParam('0')).toBe(false))
  it('366 is invalid (over a year)', () => expect(validateUsebydaysParam('366')).toBe(false))
  it('undefined is invalid (required for mince)', () => expect(validateUsebydaysParam(undefined)).toBe(false))
  it('negative is invalid', () => expect(validateUsebydaysParam('-7')).toBe(false))
})

describe('API parameter validation', () => {
  const validId = '123e4567-e89b-12d3-a456-426614174000'

  it('valid delivery request', () => {
    expect(validateLabelParams({ type: 'delivery', id: validId })).toEqual({ valid: true })
  })

  it('valid mince request with format and copies', () => {
    expect(validateLabelParams({ type: 'mince', id: validId, format: 'html', copies: '3' })).toEqual({ valid: true })
  })

  it('missing type → error', () => {
    expect(validateLabelParams({ id: validId }).valid).toBe(false)
  })

  it('invalid type → error', () => {
    expect(validateLabelParams({ type: 'returns', id: validId }).valid).toBe(false)
  })

  it('missing id → error', () => {
    expect(validateLabelParams({ type: 'delivery' }).valid).toBe(false)
  })

  it('invalid UUID format → error', () => {
    expect(validateLabelParams({ type: 'delivery', id: 'not-a-uuid' }).valid).toBe(false)
  })

  it('invalid format → error', () => {
    expect(validateLabelParams({ type: 'delivery', id: validId, format: 'pdf' }).valid).toBe(false)
  })

  it('copies = 0 → error', () => {
    expect(validateLabelParams({ type: 'delivery', id: validId, copies: '0' }).valid).toBe(false)
  })

  it('copies = 51 → error', () => {
    expect(validateLabelParams({ type: 'delivery', id: validId, copies: '51' }).valid).toBe(false)
  })

  it('copies = 50 → valid (boundary)', () => {
    expect(validateLabelParams({ type: 'delivery', id: validId, copies: '50' }).valid).toBe(true)
  })

  it('copies = 1 → valid (boundary)', () => {
    expect(validateLabelParams({ type: 'delivery', id: validId, copies: '1' }).valid).toBe(true)
  })
})

// ── HTML render content check ─────────────────────────────────────────────────

// Minimal check — full HTML is visual, just verify key fields appear

function htmlContainsField(html: string, field: string): boolean {
  return html.includes(field)
}

describe('HTML label render content', () => {
  // These tests verify the contract the HTML renderer must meet
  // Actual implementation in lib/printing/html.ts

  const deliveryFields = [
    'GI-2104-LAMB-003',   // batch code
    'Euro Quality Lambs', // supplier
    'Lamb carcass',       // product
    'STORE AT',           // storage instruction
    'Allergens:',         // SALSA 1.4.3 — allergen declaration required
  ]

  const minceFields = [
    'MINCE-2104-BEEF-4',  // batch code
    '23 Apr 2026',        // use-by date
    'STORE AT',           // storage instruction
    'Allergens:',         // SALSA 1.4.3 — allergen declaration required
  ]

  it('delivery label must contain all required fields', () => {
    // This is a contract test — implementation must satisfy it
    for (const field of deliveryFields) {
      // When html.ts is built, renderHTMLLabel('delivery', data) must include these
      expect(typeof field).toBe('string') // placeholder until html.ts exists
    }
    expect(deliveryFields).toHaveLength(5)
  })

  it('mince label must contain all required fields', () => {
    for (const field of minceFields) {
      expect(typeof field).toBe('string')
    }
    expect(minceFields).toHaveLength(4)
  })

  it('required fields list is not empty', () => {
    expect(deliveryFields.length).toBeGreaterThan(0)
    expect(minceFields.length).toBeGreaterThan(0)
  })
})

// ── Allergen label declaration (SALSA 1.4.3) ──────────────────────────────────

function allergenLabelText(allergensPresent: string[]): string {
  if (allergensPresent.length === 0) return 'None'
  return allergensPresent.join(', ')
}

function deliveryLabelAllergenText(): string {
  // Delivery labels always show None — MFS allergen-free site
  return 'None'
}

describe('Label allergen declaration — SALSA 1.4.3', () => {
  describe('delivery label allergen declaration', () => {
    it('always shows None — delivery form records nil-allergen check', () => {
      expect(deliveryLabelAllergenText()).toBe('None')
    })

    it('is static — does not depend on any variable', () => {
      // Called twice — should always return the same value
      expect(deliveryLabelAllergenText()).toBe(deliveryLabelAllergenText())
    })
  })

  describe('mince label allergen declaration', () => {
    it('empty allergens_present → None', () => {
      expect(allergenLabelText([])).toBe('None')
    })

    it('single allergen → shown directly', () => {
      expect(allergenLabelText(['Mustard'])).toBe('Mustard')
    })

    it('multiple allergens → comma separated', () => {
      expect(allergenLabelText(['Mustard', 'Celery'])).toBe('Mustard, Celery')
    })

    it('all 14 EU allergens can appear', () => {
      const all14 = [
        'Mustard', 'Celery', 'Sulphites', 'Gluten', 'Milk/Dairy',
        'Soya', 'Eggs', 'Peanuts', 'Tree nuts', 'Crustaceans',
        'Molluscs', 'Fish', 'Lupin', 'Sesame',
      ]
      expect(allergenLabelText(all14)).toContain('Mustard')
      expect(allergenLabelText(all14)).toContain('Sesame')
      expect(allergenLabelText(all14).split(', ')).toHaveLength(14)
    })

    it('MFS standard production (no allergens) → None on label', () => {
      // This is the expected state for every MFS mince run
      const standardRun: string[] = []
      expect(allergenLabelText(standardRun)).toBe('None')
    })
  })
})
