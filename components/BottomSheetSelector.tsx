'use client'

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SelectableItem {
  id: string
  label: string
  /** Optional secondary line of text below the label */
  sublabel?: string
}

interface BottomSheetSelectorProps {
  /** The full list of items to display and search */
  items: SelectableItem[]
  /** Called when the user taps an item */
  onSelect: (item: SelectableItem) => void
  /** Called when the sheet is dismissed without a selection */
  onDismiss: () => void
  /** Placeholder text inside the search input */
  searchPlaceholder?: string
  /** Sheet header title */
  title?: string
  /** Currently selected item id — highlights it in the list */
  selectedId?: string
  /** Show an extra row at the bottom of the list (e.g. "+ New prospect") */
  footerAction?: {
    label: string
    onPress: () => void
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_HEIGHT_PX = 56   // minimum tap target per design spec
const ANIM_DURATION  = 260  // ms — sheet slide duration

// ─── Utilities ────────────────────────────────────────────────────────────────

function normalise(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Single row in the list */
function ListItem({
  item,
  isSelected,
  onPress,
}: {
  item: SelectableItem
  isSelected: boolean
  onPress: () => void
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      style={{ minHeight: ITEM_HEIGHT_PX }}
      className={[
        'w-full flex items-center justify-between px-5',
        'text-left border-b border-[#EDEAE1]',
        'transition-colors duration-75',
        'active:bg-orange-50',
        isSelected ? 'bg-orange-50' : 'bg-white',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#EB6619]',
      ].join(' ')}
      aria-selected={isSelected}
    >
      <span className="flex flex-col gap-0.5 min-w-0">
        <span
          className={[
            'text-base leading-snug truncate',
            isSelected
              ? 'font-semibold text-[#16205B]'
              : 'font-medium text-gray-900',
          ].join(' ')}
        >
          {item.label}
        </span>
        {item.sublabel && (
          <span className="text-xs text-gray-400 truncate">
            {item.sublabel}
          </span>
        )}
      </span>

      {/* Selection tick */}
      {isSelected && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-5 h-5 flex-shrink-0 ml-3 text-[#EB6619]"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </button>
  )
}

/** The drag handle pill at top of sheet */
function DragHandle() {
  return (
    <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
      <div className="w-10 h-1 rounded-full bg-gray-300" />
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function BottomSheetSelector({
  items,
  onSelect,
  onDismiss,
  searchPlaceholder = 'Search…',
  title,
  selectedId,
  footerAction,
}: BottomSheetSelectorProps) {
  const [query, setQuery]         = useState('')
  const [visible, setVisible]     = useState(false)   // drives CSS transition
  const searchRef                 = useRef<HTMLInputElement>(null)
  const sheetRef                  = useRef<HTMLDivElement>(null)

  // Mount → start enter transition on next frame
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(raf)
  }, [])

  // Focus search input once sheet is open
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(() => searchRef.current?.focus(), ANIM_DURATION)
      return () => clearTimeout(timer)
    }
  }, [visible])

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleDismiss()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  })

  // Prevent body scroll while sheet is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const handleDismiss = useCallback(() => {
    setVisible(false)
    setTimeout(onDismiss, ANIM_DURATION)
  }, [onDismiss])

  const handleSelect = useCallback(
    (item: SelectableItem) => {
      setVisible(false)
      setTimeout(() => onSelect(item), ANIM_DURATION)
    },
    [onSelect]
  )

  // Filtered list — two-pass matching:
  //   Pass 1: case-insensitive substring ("Al Turka" matches query "al turka")
  //   Pass 2 (fallback if pass 1 returns nothing): every space-separated word
  //           must appear somewhere in the label — "naz rest" finds "Naz Restaurant",
  //           "cafe corner" finds "The Corner Cafe"
  const filtered = useMemo(() => {
    const q = normalise(query.trim())
    if (!q) return items

    // Pass 1: contiguous substring match
    const pass1 = items.filter(
      (item) =>
        normalise(item.label).includes(q) ||
        (item.sublabel && normalise(item.sublabel).includes(q))
    )
    if (pass1.length > 0) return pass1

    // Pass 2: every word in the query appears somewhere in the label
    const words = q.split(/\s+/).filter(Boolean)
    return items.filter((item) => {
      const haystack = normalise(item.label) + ' ' + normalise(item.sublabel ?? '')
      return words.every((w) => haystack.includes(w))
    })
  }, [items, query])

  // Backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (sheetRef.current && !sheetRef.current.contains(e.target as Node)) {
        handleDismiss()
      }
    },
    [handleDismiss]
  )

  return (
    // Full-screen overlay
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title ?? 'Select an option'}
      onClick={handleBackdropClick}
      className={[
        'fixed inset-0 z-50 flex flex-col justify-end',
        // Backdrop — fades in/out with sheet
        'transition-colors',
        visible ? 'bg-black/50' : 'bg-transparent',
      ].join(' ')}
      style={{ transitionDuration: `${ANIM_DURATION}ms` }}
    >
      {/* Sheet panel */}
      <div
        ref={sheetRef}
        className={[
          // Layout — at least 50vh so few results don't collapse the sheet,
          // at most 85vh so it doesn't fill the whole screen
          'relative flex flex-col w-full bg-white',
          'rounded-t-2xl overflow-hidden',
          'min-h-[50vh] max-h-[85vh]',
          // Slide transition
          'transition-transform',
          visible ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
        style={{ transitionDuration: `${ANIM_DURATION}ms` }}
        // Prevent backdrop click from firing when touching the sheet
        onClick={(e) => e.stopPropagation()}
      >
        <DragHandle />

        {/* ── Header ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 flex-shrink-0">
          {title && (
            <h2 className="text-base font-semibold text-gray-900">
              {title}
            </h2>
          )}
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close"
            className={[
              'ml-auto flex items-center justify-center',
              'w-8 h-8 rounded-full',
              'text-gray-400 hover:text-gray-600 hover:bg-white border border-[#EDEAE1]',
              'transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#EB6619]',
            ].join(' ')}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-5 h-5"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* ── Search bar — sticky ─────────────────────────────────── */}
        <div className="px-4 pb-3 flex-shrink-0 bg-white border-b border-[#EDEAE1]">
          <div className="relative">
            {/* Search icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              ref={searchRef}
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className={[
                'w-full h-12 rounded-xl',
                'bg-white border border-[#EDEAE1]',
                'pl-10 pr-10 text-base',
                'text-gray-900 placeholder:text-gray-400',
                'border border-transparent',
                'focus:outline-none focus:border-[#EB6619] focus:bg-white',
                'transition-colors',
              ].join(' ')}
              aria-label="Search"
            />
            {/* Clear button */}
            {query.length > 0 && (
              <button
                type="button"
                onClick={() => { setQuery(''); searchRef.current?.focus() }}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* ── Scrollable list ─────────────────────────────────────── */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain"
          role="listbox"
          aria-label={title ?? 'Options'}
        >
          {filtered.length > 0 ? (
            <>
              {filtered.map((item) => (
                <ListItem
                  key={item.id}
                  item={item}
                  isSelected={item.id === selectedId}
                  onPress={() => handleSelect(item)}
                />
              ))}
            </>
          ) : (
            // Empty state
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <p className="text-gray-400 text-base">
                No results for <span className="font-medium text-gray-600">&ldquo;{query}&rdquo;</span>
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Try a different search term
              </p>
            </div>
          )}

          {/* Optional footer action — e.g. "+ New prospect" */}
          {footerAction && (
            <button
              type="button"
              onClick={() => {
                setVisible(false)
                setTimeout(footerAction.onPress, ANIM_DURATION)
              }}
              style={{ minHeight: ITEM_HEIGHT_PX }}
              className={[
                'w-full flex items-center gap-3 px-5',
                'border-t-4 border-[#EDEAE1]',
                'text-[#EB6619] font-semibold text-base',
                'bg-white active:bg-orange-50',
                'transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#EB6619]',
              ].join(' ')}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5 flex-shrink-0"
                aria-hidden="true"
              >
                <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
              </svg>
              {footerAction.label}
            </button>
          )}

          {/* Bottom padding so last item isn't flush with home indicator */}
          <div className="h-8 flex-shrink-0" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}
