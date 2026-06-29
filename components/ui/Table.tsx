'use client'

import type { ReactNode } from 'react'

type Align = 'start' | 'center' | 'end'
type HideBelow = 'sm' | 'md'

export interface TableProps {
  children: ReactNode
}
export interface TableSectionProps {
  children: ReactNode
}
export interface TableRowProps {
  children: ReactNode
  /** Drops the bottom border on the final row. */
  last?: boolean
}
export interface TableCellProps {
  children: ReactNode
  /** Semantic column alignment (never a raw class). */
  align?: Align
  /** Hide the column below a breakpoint (layout, not colour). */
  hideBelow?: HideBelow
}
export type TableHeaderCellProps = TableCellProps

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

const ALIGN_CLASSES: Record<Align, string> = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
}

const HIDE_CLASSES: Record<HideBelow, string> = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
}

function cellLayout(align: Align | undefined, hideBelow: HideBelow | undefined): string {
  return cx(align && ALIGN_CLASSES[align], hideBelow && HIDE_CLASSES[hideBelow])
}

function TableRoot({ children }: TableProps) {
  return <table className="w-full text-body-sm">{children}</table>
}

export function TableHead({ children }: TableSectionProps) {
  return <thead>{children}</thead>
}

export function TableBody({ children }: TableSectionProps) {
  return <tbody>{children}</tbody>
}

export function TableRow({ children, last = false }: TableRowProps) {
  return <tr className={cx(!last && 'border-b border-default')}>{children}</tr>
}

export function TableHeaderCell({
  children,
  align = 'start',
  hideBelow,
}: TableHeaderCellProps) {
  return (
    <th
      scope="col"
      className={cx(
        'text-caption font-semibold tracking-[0.1em] uppercase text-subtle pb-2 border-b border-default',
        cellLayout(align, hideBelow),
      )}
    >
      {children}
    </th>
  )
}

export function TableCell({ children, align, hideBelow }: TableCellProps) {
  return (
    <td className={cx('py-3 align-middle', cellLayout(align, hideBelow))}>{children}</td>
  )
}

/**
 * Semantic <table> compound component. Column sizing/alignment is expressed
 * with semantic props owned inside the component — never a `widths` array, a
 * `gridTemplateColumns` string, or any inline style across the boundary.
 */
export const Table = Object.assign(TableRoot, {
  Head: TableHead,
  Body: TableBody,
  Row: TableRow,
  HeaderCell: TableHeaderCell,
  Cell: TableCell,
})
