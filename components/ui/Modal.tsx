'use client'

import { Dialog as RadixDialog } from 'radix-ui'
import { useEffect, type ReactNode } from 'react'

export type ModalVariant = 'center' | 'sheet'

export interface ModalLabels {
  /** aria-label for the close action. Default: "Close". */
  close?: string
}

export interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** `center` = desktop centred dialog; `sheet` = mobile bottom-sheet. */
  variant?: ModalVariant
  title?: ReactNode
  description?: ReactNode
  children: ReactNode
  labels?: ModalLabels
}

/** className composition (house style — no clsx/tailwind-merge dependency). */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/**
 * Defensive cleanup for a known Radix race. `@radix-ui/react-dismissable-layer`
 * disables the page behind a modal by setting `document.body.style.pointerEvents
 * = 'none'`, tracking the original value in MODULE-LEVEL state and only restoring
 * it when the LAST modal layer unmounts. Opening and closing modal dialogs in
 * rapid succession — e.g. the cold-storage number pad, tapped across five units
 * back-to-back — can race that restore on a production build and leave
 * `document.body` stuck at `pointer-events: none`. Every later click on the page
 * (Submit, the next card) is then silently swallowed: the exact prod-only smoke
 * failure on the cold-storage screen.
 *
 * After this Modal closes, once Radix's own synchronous cleanup has settled (next
 * animation frame), if NO modal dialog remains open we make the page interactive
 * again. It is a no-op on the happy path (Radix already cleared it) and never
 * fires while another dialog is open, so scroll-lock / outside-click semantics
 * are untouched. Clearing the inline value back to '' also heals Radix's polluted
 * module state: the next dialog re-captures the original as '' rather than 'none'.
 */
function releaseStuckBodyPointerLock(): void {
  if (typeof document === 'undefined' || typeof requestAnimationFrame === 'undefined') return
  requestAnimationFrame(() => {
    const anyModalOpen = document.querySelector('[role="dialog"][data-state="open"]')
    if (!anyModalOpen && document.body.style.pointerEvents === 'none') {
      document.body.style.pointerEvents = ''
    }
  })
}

const CENTER_CONTENT = cx(
  'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50',
  'w-[calc(100vw-2rem)] max-w-[480px] max-h-[85vh] flex flex-col',
  'rounded-xl bg-surface-overlay shadow-lg border border-default',
  'focus:outline-none animate-[mfs-fade_0.2s_ease-out]',
)

const SHEET_CONTENT = cx(
  'fixed inset-x-0 bottom-0 z-50 flex flex-col',
  'max-h-[85vh]',
  'rounded-t-[18px] bg-surface-overlay shadow-lg',
  'border border-default border-b-0',
  'focus:outline-none animate-[mfs-fade_0.2s_ease-out]',
)

function CloseIcon() {
  return (
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
  )
}

/**
 * THE overlay engine — ONE component, a `variant` prop chooses centred dialog
 * vs bottom-sheet. MoreDrawer composes `variant="sheet"` (no second engine).
 * Copies the Radix-Dialog recipe from Picker.tsx (focus-trap, ESC, scroll-lock).
 */
export function Modal({
  open,
  onOpenChange,
  variant = 'center',
  title,
  description,
  children,
  labels,
}: ModalProps) {
  const closeLabel = labels?.close ?? 'Close'
  const isSheet = variant === 'sheet'

  // Guard the Radix body-pointer-events race (see releaseStuckBodyPointerLock).
  // Run when this Modal transitions to closed AND on unmount — the cold-storage
  // pad is conditionally rendered (`{unit && <Modal open/>}`), so it leaves via
  // unmount, while a long-lived `open`-toggled Modal leaves via the open flag.
  useEffect(() => {
    if (!open) releaseStuckBodyPointerLock()
  }, [open])
  useEffect(() => () => releaseStuckBodyPointerLock(), [])

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-[var(--text-body)]/50 animate-[mfs-fade_0.2s_ease-out]" />
        <RadixDialog.Content
          // No description → suppress Radix's missing-description a11y warning
          // (mirrors Picker.tsx). With a description, omit this so Radix wires
          // the rendered Description element automatically.
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
          className={isSheet ? SHEET_CONTENT : CENTER_CONTENT}
        >
          {/* Sheet drag-handle pill */}
          {isSheet && (
            <div className="flex justify-center pt-3 pb-1" aria-hidden="true">
              <span className="w-10 h-1 rounded-pill bg-border-strong" />
            </div>
          )}

          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-3 shrink-0">
            <div className="min-w-0">
              {title !== undefined && (
                <RadixDialog.Title className="font-text text-h3 font-semibold text-body">
                  {title}
                </RadixDialog.Title>
              )}
              {description !== undefined && (
                <RadixDialog.Description className="mt-1 text-body-sm text-muted">
                  {description}
                </RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close
              aria-label={closeLabel}
              className={cx(
                'ml-auto flex shrink-0 items-center justify-center w-8 h-8 rounded-full',
                'text-subtle border border-default',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring',
              )}
            >
              <CloseIcon />
            </RadixDialog.Close>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-5">
            {children}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
