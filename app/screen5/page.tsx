'use client'

import { useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'users' | 'customers' | 'products' | 'export' | 'permissions' | 'audit'
type ImportState = 'input' | 'preview' | 'list'
type UserRole = 'warehouse' | 'office' | 'sales' | 'admin'

interface MockUser {
  id:          string
  name:        string
  role:        UserRole
  active:      boolean
  lastLogin:   string | null
  createdAt:   string
}

interface CleanRow  { name: string; category?: string }
interface FlaggedRow { row: number; raw: string; reason: string }

interface MockCustomer { id: string; name: string; active: boolean; createdAt: string }
interface MockProduct  { id: string; name: string; category: string; active: boolean; createdAt: string }
interface AuditEntry   {
  id:        string
  timestamp: string
  user:      string
  screen:    string
  action:    string
  summary:   string
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const MOCK_USERS: MockUser[] = [
  { id: 'u1', name: 'Hakan Kilic',  role: 'admin',    active: true,  lastLogin: '16 Mar 2026, 08:14', createdAt: '01 Jan 2026' },
  { id: 'u2', name: 'Ege Ozmen',    role: 'admin',    active: true,  lastLogin: '16 Mar 2026, 07:52', createdAt: '01 Jan 2026' },
  { id: 'u3', name: 'Emre',         role: 'office',   active: true,  lastLogin: '16 Mar 2026, 07:30', createdAt: '10 Jan 2026' },
  { id: 'u4', name: 'Daz',          role: 'warehouse',active: true,  lastLogin: '16 Mar 2026, 06:45', createdAt: '10 Jan 2026' },
  { id: 'u5', name: 'Omer',         role: 'sales',    active: true,  lastLogin: '15 Mar 2026, 17:02', createdAt: '10 Jan 2026' },
  { id: 'u6', name: 'Mehmet',       role: 'sales',    active: true,  lastLogin: '15 Mar 2026, 16:38', createdAt: '10 Jan 2026' },
  { id: 'u7', name: 'Tariq (prev)', role: 'sales',    active: false, lastLogin: '02 Feb 2026, 09:00', createdAt: '10 Jan 2026' },
]

const MOCK_CUSTOMERS: MockCustomer[] = [
  { id: 'c1', name: 'Al Turka Restaurant',   active: true,  createdAt: '12 Jan 2026' },
  { id: 'c2', name: 'The Manor Hotel',       active: true,  createdAt: '12 Jan 2026' },
  { id: 'c3', name: 'Milano Steakhouse',     active: true,  createdAt: '12 Jan 2026' },
  { id: 'c4', name: 'Naz Restaurant',        active: true,  createdAt: '14 Jan 2026' },
  { id: 'c5', name: 'Taj Brasserie',         active: true,  createdAt: '14 Jan 2026' },
  { id: 'c6', name: 'The Victoria',          active: true,  createdAt: '15 Jan 2026' },
  { id: 'c7', name: 'Shiraz Kitchen',        active: true,  createdAt: '15 Jan 2026' },
  { id: 'c8', name: 'Cornerhouse Leeds',     active: false, createdAt: '20 Jan 2026' },
]

const MOCK_PRODUCTS: MockProduct[] = [
  { id: 'p1', name: 'Lamb Shoulder',     category: 'Meat',    active: true,  createdAt: '12 Jan 2026' },
  { id: 'p2', name: 'Lamb Shank',        category: 'Meat',    active: true,  createdAt: '12 Jan 2026' },
  { id: 'p3', name: 'Lamb Leg Whole',    category: 'Meat',    active: true,  createdAt: '12 Jan 2026' },
  { id: 'p4', name: 'Chicken Breast',    category: 'Poultry', active: true,  createdAt: '12 Jan 2026' },
  { id: 'p5', name: 'Chicken Wings',     category: 'Poultry', active: true,  createdAt: '12 Jan 2026' },
  { id: 'p6', name: 'Beef Mince 80/20',  category: 'Meat',    active: true,  createdAt: '14 Jan 2026' },
  { id: 'p7', name: 'Lamb Mince',        category: 'Meat',    active: true,  createdAt: '14 Jan 2026' },
  { id: 'p8', name: 'Diced Lamb',        category: 'Meat',    active: false, createdAt: '20 Jan 2026' },
]

const MOCK_CLEAN_ROWS: CleanRow[] = [
  { name: 'Al Turka Restaurant'   },
  { name: 'The Manor Hotel'       },
  { name: 'Milano Steakhouse'     },
  { name: 'Naz Restaurant'        },
  { name: 'Taj Brasserie'         },
]

const MOCK_FLAGGED_ROWS: FlaggedRow[] = [
  { row: 4,  raw: ', Sheffield, 0114 XXX',    reason: 'Missing name — first column is empty'           },
  { row: 7,  raw: 'Al Turka Restaurant',      reason: 'Likely duplicate — name already in database'   },
  { row: 11, raw: 'TOTAL: 47',               reason: 'Appears to be a spreadsheet total row'          },
]

const MOCK_AUDIT: AuditEntry[] = [
  { id: 'a1', timestamp: '16 Mar 2026, 08:14', user: 'Hakan',  screen: 'Screen 5', action: 'imported',     summary: 'Customer list imported via AI — 47 records added' },
  { id: 'a2', timestamp: '16 Mar 2026, 07:55', user: 'Daz',    screen: 'Screen 1', action: 'created',      summary: 'Discrepancy logged: Al Turka — Lamb Shoulder — NOT SENT — Out of stock' },
  { id: 'a3', timestamp: '16 Mar 2026, 07:32', user: 'Emre',   screen: 'Screen 2', action: 'created',      summary: 'Complaint logged: The Manor Hotel — Delivery — OPEN' },
  { id: 'a4', timestamp: '15 Mar 2026, 17:02', user: 'Omer',   screen: 'Screen 3', action: 'created',      summary: 'Visit logged: Cornerhouse Leeds — Routine — Lost' },
  { id: 'a5', timestamp: '15 Mar 2026, 16:38', user: 'Mehmet', screen: 'Screen 3', action: 'created',      summary: 'Visit logged: Taj Brasserie — New pitch — At risk' },
  { id: 'a6', timestamp: '15 Mar 2026, 14:10', user: 'Emre',   screen: 'Screen 2', action: 'updated',      summary: 'Complaint resolved: Naz Restaurant — Weight — resolved by Emre' },
  { id: 'a7', timestamp: '14 Mar 2026, 09:00', user: 'Hakan',  screen: 'Screen 5', action: 'user_created', summary: 'User created: Daz — warehouse role' },
  { id: 'a8', timestamp: '13 Mar 2026, 11:30', user: 'Daz',    screen: 'Screen 1', action: 'created',      summary: 'Discrepancy logged: The Victoria — Chicken Breast — SHORT — Supplier short' },
]

// ─── Primitives ───────────────────────────────────────────────────────────────

const ROLE_COLOURS: Record<UserRole, string> = {
  admin:     'bg-[#16205B]/10 text-[#16205B]',
  office:    'bg-purple-100 text-purple-700',
  sales:     'bg-emerald-100 text-emerald-700',
  warehouse: 'bg-amber-100 text-amber-700',
}

function RoleBadge({ role }: { role: UserRole }) {
  return (
    <span className={`inline-block text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full capitalize ${ROLE_COLOURS[role]}`}>
      {role}
    </span>
  )
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked:  boolean
  onChange: (v: boolean) => void
  label:    string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={[
        'relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent',
        'transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
        checked ? 'bg-[#EB6619]' : 'bg-gray-200',
      ].join(' ')}
    >
      <span
        className={[
          'pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow',
          'transition-transform duration-200',
          checked ? 'translate-x-4' : 'translate-x-0',
        ].join(' ')}
      />
    </button>
  )
}

function SectionHeader({
  title,
  action,
}: {
  title:   string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between mb-5">
      <h2 className="text-base font-bold text-gray-900">{title}</h2>
      {action}
    </div>
  )
}

function TableHeader({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="border-b border-gray-200">
        {cols.map((c) => (
          <th
            key={c}
            className="py-2.5 px-3 text-left text-[10px] font-bold tracking-widest uppercase text-gray-400"
          >
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-10 text-center">
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  )
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  variant = 'orange',
}: {
  children:  React.ReactNode
  onClick?:  () => void
  disabled?: boolean
  variant?:  'orange' | 'navy' | 'ghost'
}) {
  const base = 'px-4 py-2 rounded-lg text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]'
  const styles =
    variant === 'orange' ? 'bg-[#EB6619] text-white hover:bg-[#c95510] disabled:opacity-40 disabled:cursor-not-allowed'
    : variant === 'navy'  ? 'bg-[#16205B] text-white hover:bg-[#0f1540]'
    : 'border border-gray-200 text-gray-700 hover:bg-gray-50'

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  )
}

// ─── Section 1: Users ─────────────────────────────────────────────────────────

function UsersSection() {
  const [users, setUsers]         = useState<MockUser[]>(MOCK_USERS)
  const [showAddForm, setShowAdd] = useState(false)
  const [newName, setNewName]     = useState('')
  const [newRole, setNewRole]     = useState<UserRole>('sales')
  const [newPin, setNewPin]       = useState('')

  function toggleActive(id: string) {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, active: !u.active } : u))
  }

  function handleAdd() {
    if (!newName.trim() || !newPin.trim()) return
    setUsers((prev) => [
      ...prev,
      {
        id:        `u${Date.now()}`,
        name:      newName.trim(),
        role:      newRole,
        active:    true,
        lastLogin: null,
        createdAt: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }),
      },
    ])
    setNewName('')
    setNewPin('')
    setShowAdd(false)
  }

  return (
    <div>
      <SectionHeader
        title="Users"
        action={
          <PrimaryButton onClick={() => setShowAdd(!showAdd)}>
            {showAddForm ? 'Cancel' : '+ Add user'}
          </PrimaryButton>
        }
      />

      {/* Add user form */}
      {showAddForm && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">New user</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Full name"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white"
              >
                <option value="warehouse">Warehouse</option>
                <option value="office">Office</option>
                <option value="sales">Sales</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {newRole === 'admin' ? 'Password' : '4-digit PIN'}
              </label>
              <input
                type={newRole === 'admin' ? 'password' : 'text'}
                inputMode={newRole === 'admin' ? 'text' : 'numeric'}
                maxLength={newRole === 'admin' ? 100 : 4}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value)}
                placeholder={newRole === 'admin' ? '••••••••' : '0000'}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <PrimaryButton onClick={handleAdd} disabled={!newName.trim() || !newPin.trim()}>
              Create user
            </PrimaryButton>
            <PrimaryButton variant="ghost" onClick={() => setShowAdd(false)}>
              Cancel
            </PrimaryButton>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[560px]">
          <TableHeader cols={['Name', 'Role', 'Last login', 'Created', 'Active']} />
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id} className={u.active ? 'bg-white' : 'bg-gray-50'}>
                <td className="py-3 px-3">
                  <span className={`text-sm font-medium ${u.active ? 'text-gray-900' : 'text-gray-400'}`}>
                    {u.name}
                  </span>
                </td>
                <td className="py-3 px-3"><RoleBadge role={u.role} /></td>
                <td className="py-3 px-3 text-sm text-gray-500">
                  {u.lastLogin ?? <span className="text-gray-300">Never</span>}
                </td>
                <td className="py-3 px-3 text-sm text-gray-400">{u.createdAt}</td>
                <td className="py-3 px-3">
                  <Toggle
                    checked={u.active}
                    onChange={() => toggleActive(u.id)}
                    label={`Toggle ${u.name} active state`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Section 2 & 3: AI Importer ───────────────────────────────────────────────

function ImporterSection({
  entityLabel,
  existingItems,
  onToggle,
  showCategory,
}: {
  entityLabel:   string
  existingItems: (MockCustomer | MockProduct)[]
  onToggle:      (id: string) => void
  showCategory:  boolean
}) {
  const [importState, setImportState] = useState<ImportState>('list')
  const [rawInput, setRawInput]       = useState('')
  const [isLoading, setIsLoading]     = useState(false)

  function handleMapData() {
    if (!rawInput.trim()) return
    setIsLoading(true)
    // Simulate API call delay
    setTimeout(() => { setIsLoading(false); setImportState('preview') }, 1400)
  }

  function handleConfirm() {
    setImportState('list')
    setRawInput('')
  }

  const cols = showCategory
    ? ['Name', 'Category', 'Added', 'Active']
    : ['Name', 'Added', 'Active']

  return (
    <div>
      <SectionHeader
        title={`${entityLabel}s`}
        action={
          importState === 'list' ? (
            <PrimaryButton onClick={() => setImportState('input')}>
              + Import {entityLabel.toLowerCase()}s
            </PrimaryButton>
          ) : (
            <PrimaryButton variant="ghost" onClick={() => { setImportState('list'); setRawInput('') }}>
              ← Back to list
            </PrimaryButton>
          )
        }
      />

      {/* ── State 1: Raw input ─────────────────────────────────────────── */}
      {importState === 'input' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm font-semibold text-blue-800 mb-1">
              Paste any format — AI will map it
            </p>
            <p className="text-xs text-blue-600">
              Works with BarcodeX exports, Fresho CSVs, Xero contacts, or any spreadsheet copy-paste.
              Column headers and order do not matter.
            </p>
          </div>
          <textarea
            rows={10}
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder={`Paste your ${entityLabel.toLowerCase()} data here…\n\nExamples:\n• CSV export from BarcodeX\n• Copy-paste from Excel\n• Raw list of names`}
            className="w-full rounded-xl border border-gray-200 p-4 text-sm text-gray-800 font-mono leading-relaxed focus:outline-none focus:border-[#EB6619] resize-none placeholder:text-gray-300"
          />
          <div className="flex items-center gap-3">
            <PrimaryButton
              onClick={handleMapData}
              disabled={!rawInput.trim() || isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Mapping with AI…
                </span>
              ) : 'Map data with AI'}
            </PrimaryButton>
            <p className="text-xs text-gray-400">
              {rawInput.length > 0 ? `${rawInput.split('\n').length} lines pasted` : 'No data pasted yet'}
            </p>
          </div>
        </div>
      )}

      {/* ── State 2: Preview ───────────────────────────────────────────── */}
      {importState === 'preview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

            {/* Clean rows */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <p className="text-sm font-bold text-gray-900">
                  Ready to import
                  <span className="ml-1.5 text-xs font-normal text-gray-400">
                    ({MOCK_CLEAN_ROWS.length} rows)
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-green-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-green-50 border-b border-green-200">
                      <th className="py-2 px-3 text-left text-[10px] font-bold tracking-widest uppercase text-green-700">Name</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-green-100 bg-white">
                    {MOCK_CLEAN_ROWS.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 text-sm text-gray-800">{r.name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Flagged rows */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                <p className="text-sm font-bold text-gray-900">
                  Flagged — review required
                  <span className="ml-1.5 text-xs font-normal text-gray-400">
                    ({MOCK_FLAGGED_ROWS.length} rows)
                  </span>
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-amber-50 border-b border-amber-200">
                      <th className="py-2 px-3 text-left text-[10px] font-bold tracking-widest uppercase text-amber-700">Row</th>
                      <th className="py-2 px-3 text-left text-[10px] font-bold tracking-widest uppercase text-amber-700">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100 bg-white">
                    {MOCK_FLAGGED_ROWS.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 text-sm font-mono text-gray-500 w-12">
                          {r.row}
                        </td>
                        <td className="py-2.5 px-3 text-xs text-amber-800 leading-snug">
                          {r.reason}
                          <span className="block text-gray-400 font-mono mt-0.5 truncate">
                            {r.raw}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <PrimaryButton onClick={handleConfirm}>
              Confirm &amp; import {MOCK_CLEAN_ROWS.length} records
            </PrimaryButton>
            <PrimaryButton variant="ghost" onClick={() => setImportState('input')}>
              ← Edit data
            </PrimaryButton>
            <p className="text-xs text-gray-400 ml-auto">
              {MOCK_FLAGGED_ROWS.length} flagged rows will be skipped
            </p>
          </div>
        </div>
      )}

      {/* ── State 3: Existing list ─────────────────────────────────────── */}
      {importState === 'list' && (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[420px]">
            <TableHeader cols={cols} />
            <tbody className="divide-y divide-gray-100">
              {existingItems.map((item) => {
                const isActive = (item as MockCustomer).active
                return (
                  <tr key={item.id} className={isActive ? 'bg-white' : 'bg-gray-50'}>
                    <td className="py-3 px-3">
                      <span className={`text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                        {item.name}
                      </span>
                    </td>
                    {showCategory && (
                      <td className="py-3 px-3 text-sm text-gray-400">
                        {(item as MockProduct).category}
                      </td>
                    )}
                    <td className="py-3 px-3 text-sm text-gray-400">{item.createdAt}</td>
                    <td className="py-3 px-3">
                      <Toggle
                        checked={isActive}
                        onChange={() => onToggle(item.id)}
                        label={`Toggle ${item.name} active`}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Section 4: Export ────────────────────────────────────────────────────────

function ExportSection() {
  const [from, setFrom]         = useState('2026-01-01')
  const [to, setTo]             = useState('2026-03-16')
  const [downloading, setDl]    = useState<string | null>(null)

  function handleDownload(table: string) {
    setDl(table)
    setTimeout(() => setDl(null), 1800)
  }

  const EXPORTS = [
    { key: 'discrepancies', label: 'Discrepancies', description: 'Customer, product, qty ordered vs sent, reason, logged by' },
    { key: 'complaints',    label: 'Complaints',    description: 'Customer, category, description, status, resolved by' },
    { key: 'visits',        label: 'Visits',        description: 'Rep, customer/prospect, visit type, outcome, commitments' },
  ]

  return (
    <div>
      <SectionHeader title="Data export" />

      {/* Date range */}
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
          Date range
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white"
            />
          </div>
        </div>
      </div>

      {/* Export buttons */}
      <div className="space-y-3">
        {EXPORTS.map(({ key, label, description }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4 p-4 bg-white border border-gray-200 rounded-xl"
          >
            <div>
              <p className="text-sm font-bold text-gray-900">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
            <PrimaryButton
              onClick={() => handleDownload(key)}
              disabled={downloading === key}
              variant="navy"
            >
              {downloading === key ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                  </svg>
                  Generating…
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
                    <path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/>
                    <path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/>
                  </svg>
                  Export CSV
                </span>
              )}
            </PrimaryButton>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Section 5: Permissions ───────────────────────────────────────────────────

function PermissionsSection() {
  const MATRIX = [
    { role: 'Warehouse (Daz)',         s1: true,  s2: false, s3: false, s4: false, s5: false },
    { role: 'Office (Emre)',           s1: true,  s2: true,  s3: false, s4: false, s5: false },
    { role: 'Sales (Omer / Mehmet)',   s1: false, s2: true,  s3: true,  s4: false, s5: false },
    { role: 'Admin (Hakan / Ege)',     s1: false, s2: false, s3: false, s4: true,  s5: true  },
  ]

  const screens = [
    { key: 's1', label: 'Screen 1', sub: 'Dispatch log'  },
    { key: 's2', label: 'Screen 2', sub: 'Complaints'    },
    { key: 's3', label: 'Screen 3', sub: 'Visit log'     },
    { key: 's4', label: 'Screen 4', sub: 'Dashboard'     },
    { key: 's5', label: 'Screen 5', sub: 'Admin'         },
  ]

  return (
    <div>
      <SectionHeader title="Role permissions" />
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-xs text-amber-700 font-medium">
          Read-only in version 1. Permissions are fixed by role and enforced server-side.
          Contact your developer to change this matrix.
        </p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="py-3 px-4 text-left text-xs font-bold tracking-widest uppercase text-gray-400 min-w-[180px]">
                Role
              </th>
              {screens.map((s) => (
                <th key={s.key} className="py-3 px-4 text-center">
                  <span className="block text-xs font-bold text-gray-700">{s.label}</span>
                  <span className="block text-[10px] text-gray-400 font-normal">{s.sub}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {MATRIX.map((row) => (
              <tr key={row.role} className="bg-white">
                <td className="py-3 px-4 text-sm font-medium text-gray-700">{row.role}</td>
                {screens.map((s) => {
                  const allowed = row[s.key as keyof typeof row] as boolean
                  return (
                    <td key={s.key} className="py-3 px-4 text-center">
                      {allowed ? (
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100">
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 text-green-600">
                            <path fillRule="evenodd" d="M10.293 2.293a1 1 0 0 1 1.414 1.414l-6 6a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L5 7.586l5.293-5.293Z" clipRule="evenodd"/>
                          </svg>
                        </span>
                      ) : (
                        <span className="text-gray-200 text-base select-none">—</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Section 6: Audit Log ─────────────────────────────────────────────────────

const SCREEN_BADGE: Record<string, string> = {
  'Screen 1': 'bg-amber-100 text-amber-700',
  'Screen 2': 'bg-red-100 text-red-700',
  'Screen 3': 'bg-purple-100 text-purple-700',
  'Screen 5': 'bg-blue-100 text-blue-700',
}

const ACTION_BADGE: Record<string, string> = {
  created:      'bg-green-100 text-green-700',
  updated:      'bg-blue-100 text-blue-700',
  imported:     'bg-purple-100 text-purple-700',
  user_created: 'bg-gray-100 text-gray-600',
}

function AuditSection() {
  const [filter, setFilter] = useState('')

  const filtered = filter
    ? MOCK_AUDIT.filter(
        (e) =>
          e.user.toLowerCase().includes(filter.toLowerCase()) ||
          e.summary.toLowerCase().includes(filter.toLowerCase()) ||
          e.screen.toLowerCase().includes(filter.toLowerCase())
      )
    : MOCK_AUDIT

  return (
    <div>
      <SectionHeader title="Audit log" />
      <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
          <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd"/>
        </svg>
        <input
          type="search"
          placeholder="Filter by user, screen, or summary…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-full text-sm bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-400"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[640px]">
          <TableHeader cols={['Timestamp', 'User', 'Screen', 'Action', 'Summary']} />
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5}>
                  <EmptyState message="No entries match your filter" />
                </td>
              </tr>
            )}
            {filtered.map((e) => (
              <tr key={e.id} className="bg-white">
                <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">{e.timestamp}</td>
                <td className="py-3 px-3 text-sm font-medium text-gray-700">{e.user}</td>
                <td className="py-3 px-3">
                  <span className={`text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full ${SCREEN_BADGE[e.screen] ?? 'bg-gray-100 text-gray-600'}`}>
                    {e.screen}
                  </span>
                </td>
                <td className="py-3 px-3">
                  <span className={`text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full ${ACTION_BADGE[e.action] ?? 'bg-gray-100 text-gray-600'}`}>
                    {e.action}
                  </span>
                </td>
                <td className="py-3 px-3 text-xs text-gray-600 leading-relaxed max-w-xs">
                  {e.summary}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3 px-1">
        Append-only — no entry can be edited or deleted by any user.
      </p>
    </div>
  )
}

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { key: Tab; label: string }[] = [
  { key: 'users',       label: 'Users'       },
  { key: 'customers',   label: 'Customers'   },
  { key: 'products',    label: 'Products'    },
  { key: 'export',      label: 'Export'      },
  { key: 'permissions', label: 'Permissions' },
  { key: 'audit',       label: 'Audit log'   },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Screen5Page() {
  const [activeTab, setActiveTab]     = useState<Tab>('users')
  const [customers, setCustomers]     = useState<MockCustomer[]>(MOCK_CUSTOMERS)
  const [products, setProducts]       = useState<MockProduct[]>(MOCK_PRODUCTS)

  function toggleCustomer(id: string) {
    setCustomers((prev) => prev.map((c) => c.id === id ? { ...c, active: !c.active } : c))
  }
  function toggleProduct(id: string) {
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, active: !p.active } : p))
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="bg-[#16205B] px-5 pt-14 pb-5 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto">
          <p className="text-[#EB6619] text-[10px] font-bold tracking-[0.3em] uppercase">
            MFS Global
          </p>
          <h1 className="text-white text-lg font-bold leading-tight mt-0.5">
            Admin
          </h1>
        </div>
      </header>

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-[88px] z-30">
        <div className="max-w-4xl mx-auto px-4">
          <nav
            className="flex gap-0 overflow-x-auto scrollbar-none"
            aria-label="Admin sections"
            role="tablist"
          >
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                role="tab"
                aria-selected={activeTab === key}
                onClick={() => setActiveTab(key)}
                className={[
                  'flex-shrink-0 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
                  activeTab === key
                    ? 'border-[#EB6619] text-[#EB6619]'
                    : 'border-transparent text-gray-400 hover:text-gray-700',
                ].join(' ')}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="max-w-4xl mx-auto px-4 py-6 pb-16">
        {activeTab === 'users'       && <UsersSection />}
        {activeTab === 'customers'   && (
          <ImporterSection
            entityLabel="Customer"
            existingItems={customers}
            onToggle={toggleCustomer}
            showCategory={false}
          />
        )}
        {activeTab === 'products'    && (
          <ImporterSection
            entityLabel="Product"
            existingItems={products}
            onToggle={toggleProduct}
            showCategory={true}
          />
        )}
        {activeTab === 'export'      && <ExportSection />}
        {activeTab === 'permissions' && <PermissionsSection />}
        {activeTab === 'audit'       && <AuditSection />}
      </main>
    </div>
  )
}
