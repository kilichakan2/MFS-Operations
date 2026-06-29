'use client'

import type { ReactNode } from 'react'

export interface PageHeadingProps {
  /** Eyebrow caption line (per Q4 decision: no H1). */
  eyebrow: ReactNode
  /** Optional content rendered below the eyebrow. */
  children?: ReactNode
}

/** Page heading: an eyebrow caption only (no <h1>), with optional children. */
export function PageHeading({ eyebrow, children }: PageHeadingProps) {
  return (
    <div>
      <div className="text-caption font-semibold tracking-[0.14em] uppercase text-subtle">
        {eyebrow}
      </div>
      {children}
    </div>
  )
}
