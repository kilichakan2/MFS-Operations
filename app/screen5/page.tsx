'use client'

import { useState, useEffect, useCallback } from 'react'
import BottomNav, { Icons } from '@/components/BottomNav'
import AppHeader             from '@/components/AppHeader'

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab        = 'users' | 'customers' | 'products' | 'export' | 'permissions' | 'audit'
type ImportState = 'input' | 'preview' | 'list'
type UserRole   = 'warehouse' | 'office' | 'sales' | 'admin'

interface AppUser {
  id:            string
  name:          string
  role:          UserRole
  active:        boolean
  last_login_at: string | null
  created_at:    string
}

interface AppCustomer { id: string; name: string; active: boolean; created_at: string }
interface AppProduct  { id: string; name: string; category: string | null; active: boolean; created_at: string }
interface CleanRow    { name: string }
interface FlaggedRow  { row: number; raw: string; reason: string }
interface AuditEntry  { id: string; timestamp: string; user: string; screen: string; action: string; summary: string }

// ─── AI importer preview — stays mock (UI state for the importer flow) ─────────

const MOCK_CLEAN_ROWS: CleanRow[] = [
  { name: 'Al Turka Restaurant' }, { name: 'The Manor Hotel' },
  { name: 'Milano Steakhouse'   }, { name: 'Naz Restaurant'  }, { name: 'Taj Brasserie' },
]
const MOCK_FLAGGED_ROWS: FlaggedRow[] = [
  { row: 4,  raw: ', Sheffield, 0114 XXX', reason: 'Missing name — first column is empty'         },
  { row: 7,  raw: 'Al Turka Restaurant',   reason: 'Likely duplicate — name already in database' },
  { row: 11, raw: 'TOTAL: 47',             reason: 'Appears to be a spreadsheet total row'        },
]

// ─── Audit log — stays mock until audit_log API route is wired ────────────────

const MOCK_AUDIT: AuditEntry[] = [
  { id: 'a1', timestamp: '16 Mar 2026, 11:41', user: 'System', screen: 'Screen 5', action: 'user_created', summary: 'Admin user seeded: Hakan Kilic' },
  { id: 'a2', timestamp: '16 Mar 2026, 11:41', user: 'System', screen: 'Screen 5', action: 'user_created', summary: 'Admin user seeded: Ege Ozmen'   },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

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

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className={['relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]', checked ? 'bg-[#EB6619]' : 'bg-gray-200'].join(' ')}
    >
      <span className={['pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200', checked ? 'translate-x-4' : 'translate-x-0'].join(' ')} />
    </button>
  )
}

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
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
          <th key={c} className="py-2.5 px-3 text-left text-[10px] font-bold tracking-widest uppercase text-gray-400">{c}</th>
        ))}
      </tr>
    </thead>
  )
}

function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center"><p className="text-sm text-gray-400">{message}</p></div>
}

function Spinner() {
  return (
    <div className="py-10 flex justify-center">
      <svg className="animate-spin w-5 h-5 text-gray-300" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
      </svg>
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled, variant = 'orange' }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; variant?: 'orange' | 'navy' | 'ghost'
}) {
  const base   = 'px-4 py-2 rounded-lg text-sm font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]'
  const styles = variant === 'orange' ? 'bg-[#EB6619] text-white hover:bg-[#c95510] disabled:opacity-40 disabled:cursor-not-allowed'
               : variant === 'navy'   ? 'bg-[#16205B] text-white hover:bg-[#0f1540]'
               : 'border border-gray-200 text-gray-700 hover:bg-gray-50'
  return <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>{children}</button>
}

// ─── Section 1: Users (live Supabase) ─────────────────────────────────────────

const PIN_RE = /^\d{4}$/

interface ResetTarget { id: string; name: string; role: UserRole }

function UsersSection() {
  const [users,       setUsers]       = useState<AppUser[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showAdd,     setShowAdd]     = useState(false)
  const [newName,     setNewName]     = useState('')
  const [newRole,     setNewRole]     = useState<UserRole>('sales')
  const [newPin,      setNewPin]      = useState('')
  const [pinError,    setPinError]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [saveError,   setSaveError]   = useState('')

  // Reset auth modal
  const [resetTarget, setResetTarget] = useState<ResetTarget | null>(null)
  const [resetCred,   setResetCred]   = useState('')
  const [resetError,  setResetError]  = useState('')
  const [resetting,   setResetting]   = useState(false)

  // Delete in-progress tracking
  const [deletingId,  setDeletingId]  = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data: AppUser[]) => setUsers(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // ── Validate PIN on every keystroke ────────────────────────────────────────
  function handlePinChange(val: string) {
    setNewPin(val)
    if (newRole !== 'admin') {
      if (val.length > 0 && !/^\d+$/.test(val)) {
        setPinError('PIN must be numbers only')
      } else if (val.length === 4 && !PIN_RE.test(val)) {
        setPinError('PIN must be exactly 4 digits')
      } else {
        setPinError('')
      }
    } else {
      setPinError('')
    }
  }

  function pinIsValid() {
    if (newRole === 'admin') return newPin.trim().length >= 6
    return PIN_RE.test(newPin)
  }

  // ── Toggle active ──────────────────────────────────────────────────────────
  async function toggleActive(id: string, current: boolean) {
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, active: !current } : u))
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !current }),
      })
      if (!res.ok) {
        setUsers((prev) => prev.map((u) => u.id === id ? { ...u, active: current } : u))
        setSaveError(`Failed to update user (${res.status})`)
      }
    } catch {
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, active: current } : u))
      setSaveError('Network error — toggle failed')
    }
  }

  // ── Add user ───────────────────────────────────────────────────────────────
  async function handleAdd() {
    if (!newName.trim() || !pinIsValid() || saving) return
    setSaving(true)
    setSaveError('')
    try {
      const res  = await fetch('/api/admin/users', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), role: newRole, credential: newPin }),
      })
      let data: AppUser & { error?: string }
      try { data = await res.json() }
      catch { setSaveError(`Server error (${res.status})`); return }
      if (res.ok) {
        setUsers((prev) => [...prev, data as AppUser])
        setNewName(''); setNewPin(''); setPinError(''); setShowAdd(false)
      } else {
        setSaveError(data.error ?? `Failed (${res.status})`)
      }
    } catch (err) {
      setSaveError(`Network error — ${String(err)}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete user ────────────────────────────────────────────────────────────
  async function handleDelete(u: AppUser) {
    if (!window.confirm(`Delete "${u.name}" permanently? This cannot be undone.`)) return
    setDeletingId(u.id)
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: 'DELETE' })
      if (res.ok) {
        setUsers((prev) => prev.filter((x) => x.id !== u.id))
      } else {
        const d = await res.json().catch(() => ({}))
        setSaveError(d.error ?? `Delete failed (${res.status})`)
      }
    } catch {
      setSaveError('Network error — delete failed')
    } finally {
      setDeletingId(null)
    }
  }

  // ── Reset auth ─────────────────────────────────────────────────────────────
  async function handleReset() {
    if (!resetTarget || !resetCred.trim() || resetting) return
    const isPin = resetTarget.role !== 'admin'
    if (isPin && !PIN_RE.test(resetCred)) {
      setResetError('PIN must be exactly 4 digits')
      return
    }
    if (!isPin && resetCred.length < 6) {
      setResetError('Password must be at least 6 characters')
      return
    }
    setResetting(true)
    setResetError('')
    try {
      const res  = await fetch(`/api/admin/users/${resetTarget.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential: resetCred, role: resetTarget.role }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setResetTarget(null)
        setResetCred('')
      } else {
        setResetError(data.error ?? `Failed (${res.status})`)
      }
    } catch {
      setResetError('Network error')
    } finally {
      setResetting(false)
    }
  }

  const isPin = (role: UserRole) => role !== 'admin'

  return (
    <div>
      {/* ── Global error banner ─────────────────────────────────── */}
      {saveError && (
        <div className="mb-4 flex items-center justify-between gap-3 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm text-red-700">{saveError}</p>
          <button type="button" onClick={() => setSaveError('')} className="text-red-400 hover:text-red-600 text-lg leading-none">×</button>
        </div>
      )}

      <SectionHeader
        title="Users"
        action={
          <PrimaryButton onClick={() => { setShowAdd(!showAdd); setSaveError(''); setPinError('') }}>
            {showAdd ? 'Cancel' : '+ Add user'}
          </PrimaryButton>
        }
      />

      {/* ── Add user form ────────────────────────────────────────── */}
      {showAdd && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">New user</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Daz"
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619]" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Role</label>
              <select value={newRole} onChange={(e) => { setNewRole(e.target.value as UserRole); setNewPin(''); setPinError('') }}
                className="w-full h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white">
                <option value="warehouse">Warehouse</option>
                <option value="office">Office</option>
                <option value="sales">Sales</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-gray-500 mb-1">
                {newRole === 'admin' ? 'Password (min 6 chars)' : '4-digit PIN (numbers only)'}
              </label>
              <input
                type={newRole === 'admin' ? 'password' : 'text'}
                inputMode={newRole === 'admin' ? 'text' : 'numeric'}
                maxLength={newRole === 'admin' ? 100 : 4}
                value={newPin}
                onChange={(e) => handlePinChange(e.target.value)}
                placeholder={newRole === 'admin' ? 'min 6 characters' : '4 digits, e.g. 1234'}
                className={[
                  'w-full h-9 px-3 rounded-lg border text-sm focus:outline-none',
                  pinError ? 'border-red-400 focus:border-red-500' : 'border-gray-200 focus:border-[#EB6619]',
                ].join(' ')}
              />
              {pinError && <p className="text-red-600 text-xs mt-1">{pinError}</p>}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <PrimaryButton onClick={handleAdd} disabled={!newName.trim() || !pinIsValid() || !!pinError || saving}>
              {saving ? 'Creating…' : 'Create user'}
            </PrimaryButton>
            <PrimaryButton variant="ghost" onClick={() => { setShowAdd(false); setPinError(''); setNewPin('') }}>Cancel</PrimaryButton>
          </div>
        </div>
      )}

      {/* ── Users table ─────────────────────────────────────────── */}
      {loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full min-w-[640px]">
            <TableHeader cols={['Name', 'Role', 'Last login', 'Created', 'Active', '']} />
            <tbody className="divide-y divide-gray-100">
              {users.length === 0 && (
                <tr><td colSpan={6}><EmptyState message="No users yet" /></td></tr>
              )}
              {users.map((u) => (
                <tr key={u.id} className={u.active ? 'bg-white' : 'bg-gray-50'}>
                  <td className="py-3 px-3">
                    <span className={`text-sm font-medium ${u.active ? 'text-gray-900' : 'text-gray-400'}`}>{u.name}</span>
                  </td>
                  <td className="py-3 px-3"><RoleBadge role={u.role} /></td>
                  <td className="py-3 px-3 text-sm text-gray-500">
                    {fmtDate(u.last_login_at) ?? <span className="text-gray-300">Never</span>}
                  </td>
                  <td className="py-3 px-3 text-sm text-gray-400">
                    {new Date(u.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="py-3 px-3">
                    <Toggle checked={u.active} onChange={() => toggleActive(u.id, u.active)} label={`Toggle ${u.name}`} />
                  </td>
                  {/* Action buttons */}
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      {/* Reset auth */}
                      <button
                        type="button"
                        onClick={() => { setResetTarget({ id: u.id, name: u.name, role: u.role }); setResetCred(''); setResetError('') }}
                        title={`Reset ${isPin(u.role) ? 'PIN' : 'password'} for ${u.name}`}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-[#16205B] hover:bg-gray-100 transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                          <path fillRule="evenodd" d="M8 1a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 1ZM10.5 3.22a.75.75 0 0 1 1.06 0l1.06 1.06a.75.75 0 0 1-1.06 1.06L10.5 4.28a.75.75 0 0 1 0-1.06ZM13 7.25a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 0 1.5h-1.5a.75.75 0 0 1-.75-.75ZM10.5 10.5a.75.75 0 0 1 1.06-1.06l1.06 1.06a.75.75 0 0 1-1.06 1.06l-1.06-1.06ZM8 12.25a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 8 12.25ZM3.22 10.5a.75.75 0 0 1 0 1.06l-1.06 1.06a.75.75 0 0 1-1.06-1.06L2.16 10.5a.75.75 0 0 1 1.06 0ZM2.75 7.25a.75.75 0 0 1-.75.75H.5a.75.75 0 0 1 0-1.5H2a.75.75 0 0 1 .75.75ZM3.22 5.5a.75.75 0 0 1-1.06 0L1.1 4.44A.75.75 0 0 1 2.16 3.38L3.22 4.44a.75.75 0 0 1 0 1.06ZM8 5a3 3 0 1 0 0 6A3 3 0 0 0 8 5Z" clipRule="evenodd"/>
                        </svg>
                      </button>
                      {/* Delete */}
                      <button
                        type="button"
                        onClick={() => handleDelete(u)}
                        disabled={deletingId === u.id}
                        title={`Delete ${u.name}`}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-30"
                      >
                        {deletingId === u.id ? (
                          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                            <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5A.75.75 0 0 1 9.95 6Z" clipRule="evenodd"/>
                          </svg>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reset auth modal ─────────────────────────────────────── */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          onClick={(e) => e.target === e.currentTarget && setResetTarget(null)}
        >
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl mb-4 sm:mb-0">
            <h3 className="text-base font-bold text-gray-900 mb-1">
              Reset {isPin(resetTarget.role) ? 'PIN' : 'password'}
            </h3>
            <p className="text-sm text-gray-500 mb-5">
              Setting new {isPin(resetTarget.role) ? 'PIN' : 'password'} for{' '}
              <span className="font-semibold text-gray-700">{resetTarget.name}</span>
            </p>

            <label className="block text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">
              {isPin(resetTarget.role) ? 'New PIN (4 digits)' : 'New password (min 6 chars)'}
            </label>
            <input
              type={isPin(resetTarget.role) ? 'text' : 'password'}
              inputMode={isPin(resetTarget.role) ? 'numeric' : 'text'}
              maxLength={isPin(resetTarget.role) ? 4 : 100}
              value={resetCred}
              onChange={(e) => { setResetCred(e.target.value); setResetError('') }}
              onKeyDown={(e) => e.key === 'Enter' && handleReset()}
              placeholder={isPin(resetTarget.role) ? '1234' : 'new password'}
              autoFocus
              className={[
                'w-full h-11 px-3 rounded-lg border text-sm mb-2 focus:outline-none',
                resetError ? 'border-red-400' : 'border-gray-200 focus:border-[#EB6619]',
              ].join(' ')}
            />
            {resetError && <p className="text-red-600 text-xs mb-3">{resetError}</p>}

            <div className="flex gap-2 mt-4">
              <PrimaryButton
                onClick={handleReset}
                disabled={!resetCred.trim() || resetting}
              >
                {resetting ? 'Saving…' : `Save ${isPin(resetTarget.role) ? 'PIN' : 'password'}`}
              </PrimaryButton>
              <PrimaryButton variant="ghost" onClick={() => setResetTarget(null)}>
                Cancel
              </PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Section 2 & 3: Importer (live Supabase for list view) ────────────────────

function ImporterSection({
  entityLabel, showCategory,
  fetchUrl, patchUrl,
}: {
  entityLabel:  string
  showCategory: boolean
  fetchUrl:     string
  patchUrl:     (id: string) => string
}) {
  const [importState, setImportState] = useState<ImportState>('list')
  const [rawInput,    setRawInput]    = useState('')
  const [isLoading,   setIsLoading]   = useState(false)
  const [items,       setItems]       = useState<(AppCustomer | AppProduct)[]>([])
  const [fetching,    setFetching]    = useState(true)

  useEffect(() => {
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setFetching(false))
  }, [fetchUrl])

  async function toggleItem(id: string, current: boolean) {
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, active: !current } : i))
    const res = await fetch(patchUrl(id), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !current }),
    })
    if (!res.ok) setItems((prev) => prev.map((i) => i.id === id ? { ...i, active: current } : i))
  }

  function handleMapData() {
    if (!rawInput.trim()) return
    setIsLoading(true)
    setTimeout(() => { setIsLoading(false); setImportState('preview') }, 1400)
  }

  async function handleConfirm() {
    setImportState('list')
    setRawInput('')
    // Re-fetch after import
    setFetching(true)
    fetch(fetchUrl)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .finally(() => setFetching(false))
  }

  const cols = showCategory ? ['Name', 'Category', 'Added', 'Active'] : ['Name', 'Added', 'Active']

  return (
    <div>
      <SectionHeader
        title={`${entityLabel}s`}
        action={
          importState === 'list'
            ? <PrimaryButton onClick={() => setImportState('input')}>+ Import {entityLabel.toLowerCase()}s</PrimaryButton>
            : <PrimaryButton variant="ghost" onClick={() => { setImportState('list'); setRawInput('') }}>← Back to list</PrimaryButton>
        }
      />

      {importState === 'input' && (
        <div className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <p className="text-sm font-semibold text-blue-800 mb-1">Paste any format — AI will map it</p>
            <p className="text-xs text-blue-600">Works with BarcodeX exports, Fresho CSVs, Xero contacts, or any spreadsheet copy-paste.</p>
          </div>
          <textarea rows={10} value={rawInput} onChange={(e) => setRawInput(e.target.value)}
            placeholder={`Paste your ${entityLabel.toLowerCase()} data here…`}
            className="w-full rounded-xl border border-gray-200 p-4 text-sm text-gray-800 font-mono leading-relaxed focus:outline-none focus:border-[#EB6619] resize-none placeholder:text-gray-300" />
          <div className="flex items-center gap-3">
            <PrimaryButton onClick={handleMapData} disabled={!rawInput.trim() || isLoading}>
              {isLoading ? <span className="flex items-center gap-2"><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Mapping with AI…</span> : 'Map data with AI'}
            </PrimaryButton>
            <p className="text-xs text-gray-400">{rawInput.length > 0 ? `${rawInput.split('\n').length} lines pasted` : 'No data pasted yet'}</p>
          </div>
        </div>
      )}

      {importState === 'preview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                <p className="text-sm font-bold text-gray-900">Ready to import <span className="ml-1.5 text-xs font-normal text-gray-400">({MOCK_CLEAN_ROWS.length} rows)</span></p>
              </div>
              <div className="rounded-xl border border-green-200 overflow-hidden">
                <table className="w-full">
                  <thead><tr className="bg-green-50 border-b border-green-200"><th className="py-2 px-3 text-left text-[10px] font-bold tracking-widest uppercase text-green-700">Name</th></tr></thead>
                  <tbody className="divide-y divide-green-100 bg-white">
                    {MOCK_CLEAN_ROWS.map((r, i) => <tr key={i}><td className="py-2.5 px-3 text-sm text-gray-800">{r.name}</td></tr>)}
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 flex-shrink-0" />
                <p className="text-sm font-bold text-gray-900">Flagged — review required <span className="ml-1.5 text-xs font-normal text-gray-400">({MOCK_FLAGGED_ROWS.length} rows)</span></p>
              </div>
              <div className="rounded-xl border border-amber-200 overflow-hidden">
                <table className="w-full">
                  <thead><tr className="bg-amber-50 border-b border-amber-200"><th className="py-2 px-3 text-left text-[10px] font-bold tracking-widest uppercase text-amber-700">Row</th><th className="py-2 px-3 text-left text-[10px] font-bold tracking-widest uppercase text-amber-700">Reason</th></tr></thead>
                  <tbody className="divide-y divide-amber-100 bg-white">
                    {MOCK_FLAGGED_ROWS.map((r, i) => (
                      <tr key={i}>
                        <td className="py-2.5 px-3 text-sm font-mono text-gray-500 w-12">{r.row}</td>
                        <td className="py-2.5 px-3 text-xs text-amber-800 leading-snug">{r.reason}<span className="block text-gray-400 font-mono mt-0.5 truncate">{r.raw}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <PrimaryButton onClick={handleConfirm}>Confirm &amp; import {MOCK_CLEAN_ROWS.length} records</PrimaryButton>
            <PrimaryButton variant="ghost" onClick={() => setImportState('input')}>← Edit data</PrimaryButton>
            <p className="text-xs text-gray-400 ml-auto">{MOCK_FLAGGED_ROWS.length} flagged rows will be skipped</p>
          </div>
        </div>
      )}

      {importState === 'list' && (
        fetching ? <Spinner /> : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full min-w-[420px]">
              <TableHeader cols={cols} />
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 && (
                  <tr><td colSpan={cols.length}>
                    <EmptyState message={`No ${entityLabel.toLowerCase()}s yet — use Import to add some`} />
                  </td></tr>
                )}
                {items.map((item) => {
                  const isActive = item.active
                  return (
                    <tr key={item.id} className={isActive ? 'bg-white' : 'bg-gray-50'}>
                      <td className="py-3 px-3">
                        <span className={`text-sm font-medium ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>{item.name}</span>
                      </td>
                      {showCategory && (
                        <td className="py-3 px-3 text-sm text-gray-400">{(item as AppProduct).category ?? '—'}</td>
                      )}
                      <td className="py-3 px-3 text-sm text-gray-400">
                        {new Date(item.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="py-3 px-3">
                        <Toggle checked={isActive} onChange={() => toggleItem(item.id, isActive)} label={`Toggle ${item.name}`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}

// ─── Section 4: Export ────────────────────────────────────────────────────────

function ExportSection() {
  const [from, setFrom]       = useState('2026-01-01')
  const [to, setTo]           = useState(new Date().toISOString().slice(0, 10))
  const [downloading, setDl]  = useState<string | null>(null)

  function handleDownload(table: string) {
    setDl(table)
    setTimeout(() => setDl(null), 1800)
  }

  const EXPORTS = [
    { key: 'discrepancies', label: 'Discrepancies', description: 'Customer, product, qty ordered vs sent, reason, logged by' },
    { key: 'complaints',    label: 'Complaints',    description: 'Customer, category, description, status, resolved by'      },
    { key: 'visits',        label: 'Visits',        description: 'Rep, customer/prospect, visit type, outcome, commitments'  },
  ]

  return (
    <div>
      <SectionHeader title="Data export" />
      <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Date range</p>
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <label className="block text-xs text-gray-500 mb-1">From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#EB6619] bg-white" />
          </div>
        </div>
      </div>
      <div className="space-y-3">
        {EXPORTS.map(({ key, label, description }) => (
          <div key={key} className="flex items-center justify-between gap-4 p-4 bg-white border border-gray-200 rounded-xl">
            <div>
              <p className="text-sm font-bold text-gray-900">{label}</p>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </div>
            <PrimaryButton onClick={() => handleDownload(key)} disabled={downloading === key} variant="navy">
              {downloading === key
                ? <span className="flex items-center gap-2"><svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/></svg>Generating…</span>
                : <span className="flex items-center gap-1.5"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"/><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"/></svg>Export CSV</span>
              }
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
    { role: 'Warehouse (Daz)',       s1: true,  s2: false, s3: false, s4: false, s5: false },
    { role: 'Office (Emre)',         s1: true,  s2: true,  s3: false, s4: false, s5: false },
    { role: 'Sales (Omer/Mehmet)',   s1: false, s2: true,  s3: true,  s4: false, s5: false },
    { role: 'Admin (Hakan/Ege)',     s1: false, s2: false, s3: false, s4: true,  s5: true  },
  ]
  const screens = [
    { key: 's1', label: 'Screen 1', sub: 'Dispatch'   },
    { key: 's2', label: 'Screen 2', sub: 'Complaints' },
    { key: 's3', label: 'Screen 3', sub: 'Visit log'  },
    { key: 's4', label: 'Screen 4', sub: 'Dashboard'  },
    { key: 's5', label: 'Screen 5', sub: 'Admin'      },
  ]
  return (
    <div>
      <SectionHeader title="Role permissions" />
      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-xs text-amber-700 font-medium">Read-only in version 1. Permissions are fixed by role and enforced server-side.</p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[500px]">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="py-3 px-4 text-left text-xs font-bold tracking-widest uppercase text-gray-400 min-w-[180px]">Role</th>
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
                      {allowed
                        ? <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-100"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3 text-green-600"><path fillRule="evenodd" d="M10.293 2.293a1 1 0 0 1 1.414 1.414l-6 6a1 1 0 0 1-1.414 0l-3-3a1 1 0 1 1 1.414-1.414L5 7.586l5.293-5.293Z" clipRule="evenodd"/></svg></span>
                        : <span className="text-gray-200 text-base select-none">—</span>
                      }
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
    ? MOCK_AUDIT.filter((e) => [e.user, e.summary, e.screen].some((f) => f.toLowerCase().includes(filter.toLowerCase())))
    : MOCK_AUDIT

  return (
    <div>
      <SectionHeader title="Audit log" />
      <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4 text-gray-400 flex-shrink-0">
          <path fillRule="evenodd" d="M9.965 11.026a5 5 0 1 1 1.06-1.06l2.755 2.754a.75.75 0 1 1-1.06 1.06l-2.755-2.754ZM10.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z" clipRule="evenodd"/>
        </svg>
        <input type="search" placeholder="Filter by user, screen, or summary…" value={filter} onChange={(e) => setFilter(e.target.value)}
          className="w-full text-sm bg-transparent focus:outline-none text-gray-700 placeholder:text-gray-400" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full min-w-[640px]">
          <TableHeader cols={['Timestamp', 'User', 'Screen', 'Action', 'Summary']} />
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && <tr><td colSpan={5}><EmptyState message="No entries match your filter" /></td></tr>}
            {filtered.map((e) => (
              <tr key={e.id} className="bg-white">
                <td className="py-3 px-3 text-xs text-gray-400 whitespace-nowrap">{e.timestamp}</td>
                <td className="py-3 px-3 text-sm font-medium text-gray-700">{e.user}</td>
                <td className="py-3 px-3">
                  <span className={`text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full ${SCREEN_BADGE[e.screen] ?? 'bg-gray-100 text-gray-600'}`}>{e.screen}</span>
                </td>
                <td className="py-3 px-3">
                  <span className={`text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full ${ACTION_BADGE[e.action] ?? 'bg-gray-100 text-gray-600'}`}>{e.action}</span>
                </td>
                <td className="py-3 px-3 text-xs text-gray-600 leading-relaxed max-w-xs">{e.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-3 px-1">Append-only — no entry can be edited or deleted by any user.</p>
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
  const [activeTab, setActiveTab] = useState<Tab>('users')

  return (
    <div className="min-h-screen bg-gray-50">

      <AppHeader title="Admin" maxWidth="4xl" />

      <div className="bg-white border-b border-gray-200 sticky top-[88px] z-30">
        <div className="max-w-4xl mx-auto px-4">
          <nav className="flex gap-0 overflow-x-auto scrollbar-none" aria-label="Admin sections" role="tablist">
            {TABS.map(({ key, label }) => (
              <button key={key} role="tab" aria-selected={activeTab === key} onClick={() => setActiveTab(key)}
                className={['flex-shrink-0 px-4 py-3.5 text-sm font-semibold border-b-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
                  activeTab === key ? 'border-[#EB6619] text-[#EB6619]' : 'border-transparent text-gray-400 hover:text-gray-700'].join(' ')}>
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-24">
        {activeTab === 'users'       && <UsersSection />}
        {activeTab === 'customers'   && (
          <ImporterSection
            entityLabel="Customer"
            showCategory={false}
            fetchUrl="/api/admin/customers"
            patchUrl={(id) => `/api/admin/customers/${id}`}
          />
        )}
        {activeTab === 'products'    && (
          <ImporterSection
            entityLabel="Product"
            showCategory={true}
            fetchUrl="/api/admin/products"
            patchUrl={(id) => `/api/admin/products/${id}`}
          />
        )}
        {activeTab === 'export'      && <ExportSection />}
        {activeTab === 'permissions' && <PermissionsSection />}
        {activeTab === 'audit'       && <AuditSection />}
      </main>

      <BottomNav items={[
        { href: '/screen4', label: 'Dashboard', icon: Icons.dashboard },
        { href: '/screen5', label: 'Admin',     icon: Icons.admin     },
      ]} />
    </div>
  )
}
