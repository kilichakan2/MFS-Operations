'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import AppHeader from '@/components/AppHeader'
import RoleNav   from '@/components/RoleNav'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Compliment {
  id:             string
  body:           string
  created_at:     string
  posted_by_id:   string | null
  posted_by_name: string
  recipient_id:   string | null
  recipient_name: string | null
}

interface User { id: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days  = Math.floor(diff / 86400000)
  if (mins  < 1)   return 'Just now'
  if (mins  < 60)  return `${mins}m ago`
  if (hours < 24)  return `${hours}h ago`
  if (days  < 7)   return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function getClientUserId(): string | null {
  if (typeof document === 'undefined') return null
  return document.cookie.match(/(?:^|;\s*)mfs_user_id=([^;]+)/)?.[1] ?? null
}

// ─── Compliment card ──────────────────────────────────────────────────────────

function ComplimentCard({ c, currentUserId }: { c: Compliment; currentUserId: string | null }) {
  const isOwn = c.posted_by_id === currentUserId
  return (
    <div className="bg-white rounded-2xl border border-[#EDEAE1] px-4 py-3">
      {/* Recipient banner */}
      {c.recipient_name && (
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[10px] font-bold text-[#EB6619] uppercase tracking-widest">For</span>
          <span className="text-[11px] font-bold text-[#EB6619]">{c.recipient_name}</span>
          <span className="text-[10px]">⭐</span>
        </div>
      )}
      {/* Body */}
      <p className="text-sm text-gray-800 leading-relaxed">{c.body}</p>
      {/* Footer */}
      <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-gray-50">
        <p className="text-[11px] text-gray-400">
          <span className={`font-semibold ${isOwn ? 'text-[#16205B]' : 'text-gray-600'}`}>
            {isOwn ? 'You' : c.posted_by_name}
          </span>
        </p>
        <p className="text-[10px] text-gray-400">{fmtAgo(c.created_at)}</p>
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ComplimentsPage() {
  const [compliments,    setCompliments]    = useState<Compliment[]>([])
  const [users,          setUsers]          = useState<User[]>([])
  const [loading,        setLoading]        = useState(true)
  const [loadError,      setLoadError]      = useState('')
  const [body,           setBody]           = useState('')
  const [recipientId,    setRecipientId]    = useState('')
  const [posting,        setPosting]        = useState(false)
  const [error,          setError]          = useState('')
  const [currentUserId,  setCurrentUserId]  = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setCurrentUserId(getClientUserId()) }, [])

  const feedRef = useRef<HTMLDivElement>(null)

  const loadCompliments = useCallback(async () => {
    try {
      const res = await fetch('/api/compliments')
      if (res.ok) {
        const d = await res.json()
        setCompliments(d.compliments ?? [])
      } else {
        setLoadError('Failed to load — tap to retry')
      }
    } catch {
      setLoadError('No connection — tap to retry')
    }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadCompliments()
    // Load all active users for recipient dropdown
    fetch('/api/compliments/users')
      .then(r => r.json())
      .then(d => setUsers(d.users ?? []))
      .catch(() => {})
  }, [loadCompliments])

  async function post() {
    if (!body.trim()) return
    setPosting(true); setError('')
    try {
      const res = await fetch('/api/compliments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim(), recipient_id: recipientId || undefined }),
      })
      const d = await res.json()
      if (!res.ok) { setError(d.error ?? 'Failed to post'); return }
      setCompliments(prev => [d.compliment, ...prev])
      setBody(''); setRecipientId('')
      textareaRef.current?.blur()
      // Scroll to feed so they can see their post
      setTimeout(() => feedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
    } catch { setError('Network error') }
    finally { setPosting(false) }
  }

  return (
    <div className="min-h-screen bg-[#EDEAE1]">
      <AppHeader title="Kudos" />

      <div className="max-w-lg mx-auto px-4 py-4 pb-28 space-y-4">

        {/* Post form */}
        <div className="bg-white rounded-2xl border border-[#EDEAE1] p-4 space-y-3">
          <p className="text-xs font-bold text-[#16205B]/50 uppercase tracking-widest">
            Share a shoutout 👏
          </p>

          {/* Recipient picker */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              For <span className="normal-case font-normal">(optional)</span>
            </label>
            <select
              value={recipientId}
              onChange={e => setRecipientId(e.target.value)}
              className="w-full h-9 mt-1 px-3 rounded-xl border border-[#EDEAE1] text-sm text-gray-700 bg-white focus:outline-none focus:border-[#EB6619]"
            >
              <option value="">The whole team 🙌</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          {/* Message */}
          <div>
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
              Message
            </label>
            <textarea
              ref={textareaRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) post() }}
              placeholder="Write something positive…"
              rows={3}
              className="w-full mt-1 px-3 py-2 rounded-xl border border-[#EDEAE1] text-sm text-gray-800 placeholder-gray-300 focus:outline-none focus:border-[#EB6619] resize-none"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="button"
            onClick={post}
            disabled={posting || !body.trim()}
            className="w-full h-10 rounded-xl bg-[#EB6619] text-white text-sm font-bold disabled:opacity-40 active:scale-[0.98] transition-all"
          >
            {posting ? 'Posting…' : '⭐ Post Compliment'}
          </button>
        </div>

        {/* Feed */}
        {loading ? (
          <div className="flex justify-center py-12">
            <svg className="animate-spin w-6 h-6 text-[#16205B]/30" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
            </svg>
          </div>
        ) : loadError ? (
          <button type="button" onClick={() => { setLoadError(''); setLoading(true); loadCompliments() }}
            className="w-full text-center py-12">
            <p className="text-sm font-semibold text-red-500">{loadError}</p>
          </button>
        ) : compliments.length === 0 ? (
          <div ref={feedRef} className="text-center py-16">
            <p className="text-4xl mb-3">⭐</p>
            <p className="text-sm font-semibold text-gray-700">No kudos yet</p>
            <p className="text-xs text-gray-400 mt-1">Be the first to share some positivity</p>
          </div>
        ) : (
          <div ref={feedRef} className="space-y-3">
            {compliments.map(c => (
              <ComplimentCard key={c.id} c={c} currentUserId={currentUserId} />
            ))}
          </div>
        )}
      </div>

      <RoleNav />
    </div>
  )
}
