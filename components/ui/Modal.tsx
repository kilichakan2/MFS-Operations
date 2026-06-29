'use client'

import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'

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
