'use client'

export type SpinnerSize = 'sm' | 'md' | 'lg'

export interface SpinnerProps {
  size?: SpinnerSize
  /** Screen-reader text. Default: "Loading". */
  label?: string
}

const SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-6 h-6 border-[2.5px]',
  lg: 'w-9 h-9 border-[3px]',
}

/**
 * Inline loading spinner. Colour is inherited (`border-current`) so the
 * caller's text colour drives it — no colour prop. Reuses the 0a `mfs-spin`
 * keyframe (an arbitrary-animation utility, allowed by the lint guard).
 */
export function Spinner({ size = 'md', label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={[
        'inline-block rounded-full border-current/30 border-t-current',
        'animate-[mfs-spin_0.7s_linear_infinite]',
        SIZE_CLASSES[size],
      ].join(' ')}
    />
  )
}
