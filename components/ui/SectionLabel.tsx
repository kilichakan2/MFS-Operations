'use client'

import type { ReactNode } from 'react'

export interface SectionLabelProps {
  children: ReactNode
}

/** Small uppercase, tracked-out caption label for sectioning content. */
export function SectionLabel({ children }: SectionLabelProps) {
  return (
    <span className="text-caption font-semibold tracking-[0.14em] uppercase text-subtle">
      {children}
    </span>
  )
}
