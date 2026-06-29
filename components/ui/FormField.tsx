'use client'

import {
  cloneElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react'

export interface FormFieldProps {
  label: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  children: ReactElement<{
    id?: string
    'aria-describedby'?: string
    'aria-invalid'?: boolean | 'true' | 'false'
  }>
}

/**
 * FormField ties a label + hint + error message to its child control via ARIA.
 * It generates a stable id, points the label's htmlFor at the control, and
 * injects id / aria-describedby / aria-invalid onto the cloned child so a screen
 * reader announces the label and the error together.
 */
export function FormField({
  label,
  hint,
  error,
  required = false,
  children,
}: FormFieldProps) {
  const baseId = useId()
  const controlId = `${baseId}-control`
  const hintId = `${baseId}-hint`
  const errorId = `${baseId}-error`

  const describedBy =
    [hint ? hintId : null, error ? errorId : null]
      .filter(Boolean)
      .join(' ') || undefined

  const control = cloneElement(children, {
    id: children.props.id ?? controlId,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : children.props['aria-invalid'],
  })

  const resolvedControlId = children.props.id ?? controlId

  return (
    <div className="flex flex-col gap-[6px]">
      <label
        htmlFor={resolvedControlId}
        className="font-text text-[12.5px] font-semibold text-muted"
      >
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-status-error-text">
            *
          </span>
        )}
      </label>
      {control}
      {hint && (
        <div id={hintId} className="font-text text-[12px] text-subtle">
          {hint}
        </div>
      )}
      {error && (
        <div
          id={errorId}
          role="alert"
          aria-live="polite"
          className="flex items-center gap-[5px] font-text text-[12px] font-medium text-status-error-text"
        >
          {error}
        </div>
      )}
    </div>
  )
}
