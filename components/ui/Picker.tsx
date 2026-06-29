'use client'

import { Dialog as RadixDialog } from 'radix-ui'
import { useMemo, useState } from 'react'

export interface PickerItem {
  id: string
  label: string
  sublabel?: string
}

export interface PickerLabels {
  /** aria-label for the close action. Default: "Close". */
  close?: string
  /** aria-label for the search input. Default: "Search". */
  search?: string
}

export interface PickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  items: PickerItem[]
  onSelect: (item: PickerItem) => void
  selectedId?: string
  title?: string
  searchPlaceholder?: string
  footerAction?: { label: string; onPress: () => void }
  labels?: PickerLabels
}

/** Diacritic-insensitive lowercase — copied verbatim from BottomSheetSelector. */
function normalise(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="text-action-primary shrink-0"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function Picker({
  open,
  onOpenChange,
  items,
  onSelect,
  selectedId,
  title,
  searchPlaceholder = 'Search…',
  footerAction,
  labels,
}: PickerProps) {
  const [query, setQuery] = useState('')

  const closeLabel = labels?.close ?? 'Close'
  const searchLabel = labels?.search ?? 'Search'

  // Two-pass match — copied verbatim from BottomSheetSelector:
  //   Pass 1: case-insensitive substring.
  //   Pass 2 (fallback if pass 1 empty): every query word appears somewhere.
  const filtered = useMemo(() => {
    const q = normalise(query.trim())
    if (!q) return items

    const pass1 = items.filter(
      (item) =>
        normalise(item.label).includes(q) ||
        (item.sublabel && normalise(item.sublabel).includes(q)),
    )
    if (pass1.length > 0) return pass1

    const words = q.split(/\s+/).filter(Boolean)
    return items.filter((item) => {
      const haystack = normalise(item.label) + ' ' + normalise(item.sublabel ?? '')
      return words.every((w) => haystack.includes(w))
    })
  }, [items, query])

  const handleSelect = (item: PickerItem) => {
    onSelect(item)
    onOpenChange(false)
  }

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--text-body)]/50" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className={[
            'fixed inset-x-0 bottom-0 z-50 flex flex-col',
            'max-h-[85vh] min-h-[40vh]',
            'rounded-t-[18px] bg-surface-overlay shadow-lg',
            'border border-default border-b-0',
            'focus:outline-none',
          ].join(' ')}
        >
          {/* Drag-handle pill */}
          <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
            <span className="w-10 h-1 rounded-pill bg-border-strong" />
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 pt-2 pb-3 shrink-0">
            <RadixDialog.Title className="font-text text-[15px] font-semibold text-body">
              {title ?? ''}
            </RadixDialog.Title>
            <RadixDialog.Close
              aria-label={closeLabel}
              className={[
                'ml-auto flex items-center justify-center w-8 h-8 rounded-full',
                'text-subtle border border-default',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              ].join(' ')}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </RadixDialog.Close>
          </div>

          {/* Search */}
          <div className="px-4 pb-3 shrink-0 border-b border-subtle">
            <input
              type="search"
              autoFocus
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchLabel}
              className={[
                'w-full h-[42px] px-3 rounded-[10px]',
                'bg-surface-sunken font-text text-[14px] text-body',
                'placeholder:text-subtle outline-none',
                'border border-transparent',
                'focus:border-focus-ring',
              ].join(' ')}
            />
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {filtered.length > 0 ? (
              filtered.map((item) => {
                const isSelected = item.id === selectedId
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item)}
                    aria-pressed={isSelected}
                    className={[
                      'w-full flex items-center justify-between gap-3 px-4 py-3 text-left',
                      'border-b border-subtle',
                      isSelected ? 'bg-surface-sunken' : 'bg-transparent',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
                    ].join(' ')}
                  >
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="font-text text-[14px] font-semibold text-body truncate">
                        {item.label}
                      </span>
                      {item.sublabel && (
                        <span className="font-text text-[12px] text-subtle truncate">
                          {item.sublabel}
                        </span>
                      )}
                    </span>
                    {isSelected && <CheckIcon />}
                  </button>
                )
              })
            ) : (
              <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
                <p className="font-text text-[14px] text-subtle">
                  No results for{' '}
                  <span className="font-medium text-muted">
                    &ldquo;{query}&rdquo;
                  </span>
                </p>
              </div>
            )}

            {footerAction && (
              <button
                type="button"
                onClick={() => {
                  footerAction.onPress()
                  onOpenChange(false)
                }}
                className={[
                  'w-full flex items-center gap-2 px-4 py-[14px]',
                  'border-t border-default font-text text-[13.5px] font-semibold text-link',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring',
                ].join(' ')}
              >
                <PlusIcon />
                {footerAction.label}
              </button>
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
