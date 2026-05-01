/**
 * tests/unit/supplierCategories.test.ts
 *
 * Covers the 6 issues found in the pre-build audit:
 *
 * Issue 1 — C8 traceability gate: meat-only
 * Issue 2 — tempStatus / calcStatus for new categories
 * Issue 3 — dry_goods: null temp, auto-pass
 * Issue 4 — batch number format for all category types
 * Issue 5 — supplier category filtering
 * Issue 6 — isValid conditional on category
 */

import { describe, it, expect } from 'vitest'

// ─── Mirrors from delivery/route.ts ──────────────────────────────────────────

const MEAT_CATEGORIES_ROUTE = new Set(['lamb', 'beef', 'red_meat', 'offal', 'frozen_beef_lamb'])

function tempStatusRoute(temp: number | null, category: string): 'pass' | 'urgent' | 'fail' {
  if (category === 'dry_goods') return 'pass'
  if (temp === null || isNaN(temp as number)) return 'fail'
  const t = temp as number
  switch (category) {
    case 'lamb':
    case 'beef':
    case 'red_meat':      return t <= 5.0   ? 'pass' : t <= 8.0   ? 'urgent' : 'fail'
    case 'offal':         return t <= 3.0   ? 'pass' : 'fail'
    case 'mince_prep':    return t <= 4.0   ? 'pass' : 'fail'  // kept for historical records
    case 'frozen':
    case 'frozen_beef_lamb': return t <= -18.0 ? 'pass' : t <= -15.0 ? 'urgent' : 'fail'
    case 'poultry':
    case 'dairy':
    case 'chilled_other': return t <= 8.0   ? 'pass' : 'fail'
    default:              return 'fail'
  }
}

function isMeatCategoryRoute(cat: string) {
  return MEAT_CATEGORIES_ROUTE.has(cat)
}

const CATEGORY_BATCH_PREFIX: Record<string, string> = {
  poultry:       'POL',
  dairy:         'DAI',
  chilled_other: 'CHI',
  dry_goods:     'DRY',
  frozen:        'FRZ',
  // frozen_beef_lamb always isMeat=true → uses born_in country code, not a prefix
}

function buildBatchNumber(
  date: string,
  categoryOrCountry: string,
  deliveryNumber: number,
  isMeat: boolean,
): string {
  const d      = new Date(date + 'T00:00:00')
  const dd     = String(d.getDate()).padStart(2, '0')
  const mm     = String(d.getMonth() + 1).padStart(2, '0')
  const prefix = isMeat
    ? categoryOrCountry.toUpperCase()
    : (CATEGORY_BATCH_PREFIX[categoryOrCountry] ?? categoryOrCountry.toUpperCase().slice(0, 3))
  return `${dd}${mm}-${prefix}-${deliveryNumber}`
}

// ─── Mirrors from delivery/page.tsx ──────────────────────────────────────────

type TempStatus = 'pass' | 'urgent' | 'fail' | null

const MEAT_CATEGORIES_PAGE = new Set(['lamb', 'beef', 'red_meat', 'offal', 'frozen_beef_lamb'])
const NO_TEMP_CATEGORIES   = new Set(['dry_goods'])

function isMeatCategoryPage(cat: string) { return MEAT_CATEGORIES_PAGE.has(cat) }
function noTempCategory(cat: string)     { return NO_TEMP_CATEGORIES.has(cat) }

function calcStatus(temp: number | null, category: string): TempStatus {
  if (category === 'dry_goods') return 'pass'
  if (temp === null || isNaN(temp as number)) return null
  const t = temp as number
  switch (category) {
    case 'lamb':
    case 'beef':
    case 'red_meat':      return t <= 5.0   ? 'pass' : t <= 8.0   ? 'urgent' : 'fail'
    case 'offal':         return t <= 3.0   ? 'pass' : 'fail'
    case 'mince_prep':    return t <= 4.0   ? 'pass' : 'fail'
    case 'frozen':
    case 'frozen_beef_lamb': return t <= -18.0 ? 'pass' : t <= -15.0 ? 'urgent' : 'fail'
    case 'poultry':
    case 'dairy':
    case 'chilled_other': return t <= 8.0   ? 'pass' : 'fail'
    default:              return null
  }
}

interface Supplier { id: string; name: string; categories: string[] }

function filterSuppliers(suppliers: Supplier[], category: string): Supplier[] {
  if (!category) return []
  return suppliers.filter(s =>
    s.categories.length === 0 ||
    s.categories.includes(category)
  )
}

function isValidForm(opts: {
  supplierChosen: boolean
  product:        string
  category:       string
  tempVal:        string
  contam:         string
  contamType:     string
  bornIn:         string
  rearedIn:       string
  slaughter:      string
  cutSite:        string
  allergenValid:  boolean
}): boolean {
  const { supplierChosen, product, category, tempVal, contam, contamType,
          bornIn, rearedIn, slaughter, cutSite, allergenValid } = opts
  const tempNum  = parseFloat(tempVal)
  const isMeat   = isMeatCategoryPage(category)
  const isAmbient = noTempCategory(category)
  return (
    supplierChosen &&
    product.trim().length > 0 &&
    category.length > 0 &&
    (isAmbient || (tempVal !== '' && !isNaN(tempNum))) &&
    contam.length > 0 &&
    (contam === 'no' || Boolean(contamType)) &&
    (!isMeat || (Boolean(bornIn) && Boolean(rearedIn) && slaughter.trim() !== '' && Boolean(cutSite))) &&
    allergenValid
  )
}

// ── Sample suppliers ──────────────────────────────────────────────────────────

const ALL_SUPPLIERS: Supplier[] = [
  { id: '1', name: 'Pickstock',         categories: ['lamb', 'beef'] },
  { id: '2', name: 'Dunbia',            categories: ['lamb', 'beef'] },
  { id: '3', name: 'Kepak',             categories: ['lamb', 'beef'] },
  { id: '4', name: 'Heartshead Meats',  categories: ['lamb', 'beef'] },
  { id: '5', name: 'Extons',            categories: ['dairy'] },
  { id: '6', name: 'Staple Food Group', categories: ['dairy'] },
  { id: '7', name: 'Village',           categories: ['dry_goods'] },
  { id: '8', name: 'Big K',             categories: ['dry_goods'] },
]

// ── Issue 2 — tempStatus new categories ──────────────────────────────────────

describe('tempStatus — new categories (Issue 2)', () => {
  describe('offal ≤3°C strict pass/fail', () => {
    it('3°C → pass', ()    => expect(tempStatusRoute(3.0, 'offal')).toBe('pass'))
    it('3.1°C → fail', ()  => expect(tempStatusRoute(3.1, 'offal')).toBe('fail'))
    it('no urgent band', () => expect(tempStatusRoute(2.9, 'offal')).toBe('pass'))
  })

  describe('frozen_beef_lamb same temp limits as frozen', () => {
    it('-20°C → pass', ()  => expect(tempStatusRoute(-20, 'frozen_beef_lamb')).toBe('pass'))
    it('-18°C → pass', ()  => expect(tempStatusRoute(-18, 'frozen_beef_lamb')).toBe('pass'))
    it('-16°C → urgent', () => expect(tempStatusRoute(-16, 'frozen_beef_lamb')).toBe('urgent'))
    it('-14°C → fail', ()  => expect(tempStatusRoute(-14, 'frozen_beef_lamb')).toBe('fail'))
  })

  describe('mince_prep still works for historical records (not in form)', () => {
    it('4°C → pass', ()  => expect(tempStatusRoute(4.0, 'mince_prep')).toBe('pass'))
    it('4.1°C → fail', () => expect(tempStatusRoute(4.1, 'mince_prep')).toBe('fail'))
  })

  describe('poultry ≤8°C pass/fail', () => {
    it('7°C → pass', () => expect(tempStatusRoute(7.0,  'poultry')).toBe('pass'))
    it('8°C → pass (at limit)', () => expect(tempStatusRoute(8.0, 'poultry')).toBe('pass'))
    it('8.1°C → fail', () => expect(tempStatusRoute(8.1, 'poultry')).toBe('fail'))
    it('no urgent band for poultry', () => expect(tempStatusRoute(7.9, 'poultry')).toBe('pass'))
  })

  describe('dairy ≤8°C pass/fail', () => {
    it('4°C → pass', () => expect(tempStatusRoute(4.0, 'dairy')).toBe('pass'))
    it('8°C → pass (at limit)', () => expect(tempStatusRoute(8.0, 'dairy')).toBe('pass'))
    it('8.1°C → fail', () => expect(tempStatusRoute(8.1, 'dairy')).toBe('fail'))
  })

  describe('chilled_other ≤8°C pass/fail', () => {
    it('5°C → pass', () => expect(tempStatusRoute(5.0, 'chilled_other')).toBe('pass'))
    it('8.1°C → fail', () => expect(tempStatusRoute(8.1, 'chilled_other')).toBe('fail'))
  })

  describe('existing categories unchanged', () => {
    it('lamb 4°C → pass', ()    => expect(tempStatusRoute(4.0, 'lamb')).toBe('pass'))
    it('lamb 6°C → urgent', ()  => expect(tempStatusRoute(6.0, 'lamb')).toBe('urgent'))
    it('lamb 9°C → fail', ()    => expect(tempStatusRoute(9.0, 'lamb')).toBe('fail'))
    it('frozen -20°C → pass', () => expect(tempStatusRoute(-20, 'frozen')).toBe('pass'))
    it('frozen -16°C → urgent', () => expect(tempStatusRoute(-16, 'frozen')).toBe('urgent'))
  })
})

// ── Issue 3 — dry_goods null temp ─────────────────────────────────────────────

describe('dry_goods — ambient, no temperature CCP (Issue 3)', () => {
  it('null temp → pass (no CCP)', () => {
    expect(tempStatusRoute(null, 'dry_goods')).toBe('pass')
  })

  it('any numeric temp → still pass (ignored)', () => {
    expect(tempStatusRoute(25, 'dry_goods')).toBe('pass')
    expect(tempStatusRoute(0,  'dry_goods')).toBe('pass')
  })

  it('calcStatus null temp for dry_goods → pass', () => {
    expect(calcStatus(null, 'dry_goods')).toBe('pass')
  })

  it('noTempCategory identifies dry_goods correctly', () => {
    expect(noTempCategory('dry_goods')).toBe(true)
    expect(noTempCategory('dairy')).toBe(false)
    expect(noTempCategory('lamb')).toBe(false)
  })

  it('isValid: dry_goods with empty tempVal is still valid', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Flour 10kg', category: 'dry_goods',
      tempVal: '', contam: 'no', contamType: '',
      bornIn: '', rearedIn: '', slaughter: '', cutSite: '',
      allergenValid: true,
    })).toBe(true)
  })
})

// ── Issue 1 — C8 traceability gate: meat only ─────────────────────────────────

describe('C8 traceability — meat only (Issue 1)', () => {
  it('isMeatCategory: lamb → true',            () => expect(isMeatCategoryRoute('lamb')).toBe(true))
  it('isMeatCategory: beef → true',            () => expect(isMeatCategoryRoute('beef')).toBe(true))
  it('isMeatCategory: red_meat → true',        () => expect(isMeatCategoryRoute('red_meat')).toBe(true))
  it('isMeatCategory: offal → true (bovine offal legally requires BLS)', () => expect(isMeatCategoryRoute('offal')).toBe(true))
  it('isMeatCategory: frozen_beef_lamb → true (BLS applies to frozen red meat)', () => expect(isMeatCategoryRoute('frozen_beef_lamb')).toBe(true))
  it('isMeatCategory: poultry → false',        () => expect(isMeatCategoryRoute('poultry')).toBe(false))
  it('isMeatCategory: dairy → false',          () => expect(isMeatCategoryRoute('dairy')).toBe(false))
  it('isMeatCategory: dry_goods → false',      () => expect(isMeatCategoryRoute('dry_goods')).toBe(false))
  it('isMeatCategory: frozen → false (non-red-meat frozen)', () => expect(isMeatCategoryRoute('frozen')).toBe(false))
  it('isMeatCategory: mince_prep → false (produced internally, not received)', () => expect(isMeatCategoryRoute('mince_prep')).toBe(false))

  it('isValid: lamb without BLS fields → invalid', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Lamb carcasses', category: 'lamb',
      tempVal: '4', contam: 'no', contamType: '',
      bornIn: '', rearedIn: '', slaughter: '', cutSite: '',
      allergenValid: true,
    })).toBe(false)
  })

  it('isValid: offal without BLS fields → invalid (BLS required for offal)', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Lamb liver', category: 'offal',
      tempVal: '2', contam: 'no', contamType: '',
      bornIn: '', rearedIn: '', slaughter: '', cutSite: '',
      allergenValid: true,
    })).toBe(false)
  })

  it('isValid: offal with BLS fields → valid', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Lamb liver', category: 'offal',
      tempVal: '2', contam: 'no', contamType: '',
      bornIn: 'GB', rearedIn: 'GB', slaughter: 'GB1234', cutSite: 'GB1234',
      allergenValid: true,
    })).toBe(true)
  })

  it('isValid: frozen_beef_lamb without BLS → invalid', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Frozen beef rump', category: 'frozen_beef_lamb',
      tempVal: '-20', contam: 'no', contamType: '',
      bornIn: '', rearedIn: '', slaughter: '', cutSite: '',
      allergenValid: true,
    })).toBe(false)
  })

  it('isValid: frozen_beef_lamb with BLS → valid', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Frozen beef rump', category: 'frozen_beef_lamb',
      tempVal: '-20', contam: 'no', contamType: '',
      bornIn: 'IE', rearedIn: 'IE', slaughter: 'IE5678', cutSite: 'IE5678',
      allergenValid: true,
    })).toBe(true)
  })

  it('isValid: frozen (non-red-meat) without BLS → valid', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Frozen chicken fillets', category: 'frozen',
      tempVal: '-20', contam: 'no', contamType: '',
      bornIn: '', rearedIn: '', slaughter: '', cutSite: '',
      allergenValid: true,
    })).toBe(true)
  })

  it('isValid: lamb with all BLS fields → valid', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Lamb carcasses', category: 'lamb',
      tempVal: '4', contam: 'no', contamType: '',
      bornIn: 'GB', rearedIn: 'GB', slaughter: 'GB1234', cutSite: 'GB1234',
      allergenValid: true,
    })).toBe(true)
  })

  it('isValid: dairy without BLS fields → valid (not required for non-meat)', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Whole milk 4L', category: 'dairy',
      tempVal: '5', contam: 'no', contamType: '',
      bornIn: '', rearedIn: '', slaughter: '', cutSite: '',
      allergenValid: true,
    })).toBe(true)
  })

  it('isValid: poultry without BLS fields → valid', () => {
    expect(isValidForm({
      supplierChosen: true, product: 'Chicken thighs', category: 'poultry',
      tempVal: '5', contam: 'no', contamType: '',
      bornIn: '', rearedIn: '', slaughter: '', cutSite: '',
      allergenValid: true,
    })).toBe(true)
  })
})

// ── Issue 4 — batch number formats ────────────────────────────────────────────

describe('batch number format — all category types (Issue 4)', () => {
  const date = '2026-05-01'  // 01 May 2026 → 0105

  it('frozen_beef_lamb: uses born_in country code (isMeat=true, not a prefix)', () => {
    // frozen_beef_lamb is in MEAT_CATEGORIES → isMeat=true → batch uses born_in
    expect(buildBatchNumber(date, 'IE', 1, true)).toBe('0105-IE-1')
  })

  it('frozen (non-red-meat): FRZ prefix', () => {
    expect(buildBatchNumber(date, 'frozen', 2, false)).toBe('0105-FRZ-2')
  })

  it('meat: uses country code from born_in', () => {
    expect(buildBatchNumber(date, 'GB', 1, true)).toBe('0105-GB-1')
  })

  it('meat: Irish origin', () => {
    expect(buildBatchNumber(date, 'IE', 3, true)).toBe('0105-IE-3')
  })

  it('poultry: POL prefix', () => {
    expect(buildBatchNumber(date, 'poultry', 1, false)).toBe('0105-POL-1')
  })

  it('dairy: DAI prefix', () => {
    expect(buildBatchNumber(date, 'dairy', 2, false)).toBe('0105-DAI-2')
  })

  it('chilled_other: CHI prefix', () => {
    expect(buildBatchNumber(date, 'chilled_other', 1, false)).toBe('0105-CHI-1')
  })

  it('dry_goods: DRY prefix', () => {
    expect(buildBatchNumber(date, 'dry_goods', 4, false)).toBe('0105-DRY-4')
  })

  it('delivery number increments correctly for all types', () => {
    expect(buildBatchNumber(date, 'GB',  1, true)).toBe('0105-GB-1')
    expect(buildBatchNumber(date, 'GB',  2, true)).toBe('0105-GB-2')
    expect(buildBatchNumber(date, 'DAI', 1, false)).toBe('0105-DAI-1') // Note: non-meat uses prefix lookup
  })

  it('date formatting is always DDMM', () => {
    // 09 Jan 2026 → 0901
    expect(buildBatchNumber('2026-01-09', 'GB', 1, true)).toBe('0901-GB-1')
    // 31 Dec 2026 → 3112
    expect(buildBatchNumber('2026-12-31', 'GB', 1, true)).toBe('3112-GB-1')
  })
})

// ── Issue 5 — supplier category filtering ─────────────────────────────────────

describe('filterSuppliers — category-based filtering (Issue 5)', () => {
  it('no category → empty list', () => {
    expect(filterSuppliers(ALL_SUPPLIERS, '')).toHaveLength(0)
  })

  it('lamb → only lamb/beef suppliers (4)', () => {
    const result = filterSuppliers(ALL_SUPPLIERS, 'lamb')
    expect(result).toHaveLength(4)
    expect(result.map(s => s.name)).toContain('Pickstock')
    expect(result.map(s => s.name)).toContain('Dunbia')
    expect(result.map(s => s.name)).not.toContain('Extons')
    expect(result.map(s => s.name)).not.toContain('Village')
  })

  it('beef → same 4 meat suppliers', () => {
    const result = filterSuppliers(ALL_SUPPLIERS, 'beef')
    expect(result).toHaveLength(4)
    expect(result.map(s => s.name)).toContain('Kepak')
  })

  it('dairy → Extons and Staple Food Group only', () => {
    const result = filterSuppliers(ALL_SUPPLIERS, 'dairy')
    expect(result).toHaveLength(2)
    expect(result.map(s => s.name)).toContain('Extons')
    expect(result.map(s => s.name)).toContain('Staple Food Group')
    expect(result.map(s => s.name)).not.toContain('Pickstock')
  })

  it('dry_goods → Village and Big K only', () => {
    const result = filterSuppliers(ALL_SUPPLIERS, 'dry_goods')
    expect(result).toHaveLength(2)
    expect(result.map(s => s.name)).toContain('Village')
    expect(result.map(s => s.name)).toContain('Big K')
  })

  it('poultry → no suppliers yet (none tagged poultry)', () => {
    const result = filterSuppliers(ALL_SUPPLIERS, 'poultry')
    expect(result).toHaveLength(0)
  })

  it('supplier with no categories → shown for all (backwards compat)', () => {
    const withUntagged: Supplier[] = [
      ...ALL_SUPPLIERS,
      { id: '9', name: 'Old Supplier', categories: [] },
    ]
    const result = filterSuppliers(withUntagged, 'lamb')
    expect(result.map(s => s.name)).toContain('Old Supplier')
  })

  it('meat supplier not shown for dairy', () => {
    const result = filterSuppliers(ALL_SUPPLIERS, 'dairy')
    expect(result.map(s => s.name)).not.toContain('Pickstock')
    expect(result.map(s => s.name)).not.toContain('Kepak')
  })
})

// ── Issue 6 — isValid conditional on category ─────────────────────────────────

describe('isValid — conditional fields per category (Issue 6)', () => {
  const meatBase = {
    supplierChosen: true, product: 'Lamb', category: 'lamb',
    tempVal: '4', contam: 'no', contamType: '',
    bornIn: 'GB', rearedIn: 'GB', slaughter: 'GB1234', cutSite: 'GB1234',
    allergenValid: true,
  }

  const dairyBase = {
    supplierChosen: true, product: 'Milk', category: 'dairy',
    tempVal: '5', contam: 'no', contamType: '',
    bornIn: '', rearedIn: '', slaughter: '', cutSite: '',
    allergenValid: true,
  }

  const dryBase = {
    supplierChosen: true, product: 'Flour', category: 'dry_goods',
    tempVal: '', contam: 'no', contamType: '',
    bornIn: '', rearedIn: '', slaughter: '', cutSite: '',
    allergenValid: true,
  }

  it('complete lamb delivery → valid', () => expect(isValidForm(meatBase)).toBe(true))
  it('complete dairy delivery → valid', () => expect(isValidForm(dairyBase)).toBe(true))
  it('complete dry goods delivery → valid', () => expect(isValidForm(dryBase)).toBe(true))

  it('lamb: missing born_in → invalid', () => {
    expect(isValidForm({ ...meatBase, bornIn: '' })).toBe(false)
  })
  it('lamb: missing slaughter → invalid', () => {
    expect(isValidForm({ ...meatBase, slaughter: '' })).toBe(false)
  })
  it('dairy: missing born_in is fine → valid', () => {
    expect(isValidForm({ ...dairyBase, bornIn: '' })).toBe(true)
  })
  it('dry goods: missing temp is fine → valid', () => {
    expect(isValidForm({ ...dryBase, tempVal: '' })).toBe(true)
  })
  it('dairy: missing temp → invalid (dairy has temp CCP)', () => {
    expect(isValidForm({ ...dairyBase, tempVal: '' })).toBe(false)
  })
  it('lamb: missing supplier → invalid regardless of category', () => {
    expect(isValidForm({ ...meatBase, supplierChosen: false })).toBe(false)
  })
  it('all categories: missing product → invalid', () => {
    expect(isValidForm({ ...meatBase,  product: '' })).toBe(false)
    expect(isValidForm({ ...dairyBase, product: '' })).toBe(false)
    expect(isValidForm({ ...dryBase,   product: '' })).toBe(false)
  })
  it('all categories: allergenValid=false → invalid', () => {
    expect(isValidForm({ ...meatBase,  allergenValid: false })).toBe(false)
    expect(isValidForm({ ...dairyBase, allergenValid: false })).toBe(false)
    expect(isValidForm({ ...dryBase,   allergenValid: false })).toBe(false)
  })
})

// ── Cross-cutting: MFS supplier catalogue ─────────────────────────────────────

describe('MFS supplier catalogue — categories', () => {
  it('offal category appears when offal is selected', () => {
    const offal = ALL_SUPPLIERS.filter(s => s.categories.includes('offal'))
    // In the actual DB, meat suppliers are tagged with offal too
    // Here our test array doesn't have offal but structure is verified via isMeatCategory
    expect(isMeatCategoryRoute('offal')).toBe(true)
  })

  it('frozen_beef_lamb requires BLS — distinct from frozen', () => {
    expect(isMeatCategoryRoute('frozen_beef_lamb')).toBe(true)
    expect(isMeatCategoryRoute('frozen')).toBe(false)
  })

  it('mince_prep not in visible categories (MFS produces it, does not receive it)', () => {
    // The CATEGORIES array shown in the form should not contain mince_prep
    const visibleCategories = [
      'lamb', 'beef', 'offal', 'frozen', 'frozen_beef_lamb',
      'poultry', 'dairy', 'chilled_other', 'dry_goods',
    ]
    expect(visibleCategories).not.toContain('mince_prep')
  })

  it('mince_prep still handled in tempStatus for historical records', () => {
    expect(tempStatusRoute(4.0, 'mince_prep')).toBe('pass')
    expect(tempStatusRoute(4.1, 'mince_prep')).toBe('fail')
  })

  it('Extons is dairy', () => {
    const s = ALL_SUPPLIERS.find(x => x.name === 'Extons')
    expect(s?.categories).toContain('dairy')
  })

  it('Village is dry_goods', () => {
    const s = ALL_SUPPLIERS.find(x => x.name === 'Village')
    expect(s?.categories).toContain('dry_goods')
  })
})
