/**
 * components/ui/accent.ts — shared semantic accent map (Phase 0b Wave 2).
 *
 * The caller expresses intent (`success | warning | danger | navy`); the
 * component looks the intent up here and applies the right purpose-named
 * (Tier-2 semantic) token classes. No colour class ever crosses a component
 * boundary — closing the style-leak the legacy primitives had.
 *
 * `danger` maps to the `error` status family (same hue, clearer name);
 * `navy` maps to the brand secondary-action colour.
 */
export type Accent = 'success' | 'warning' | 'danger' | 'navy'

export interface AccentTokens {
  /** Solid fill — left stripe / status dot. */
  fill: string
  /** Readable text shade — KPI value / pill label. */
  text: string
}

/** Pure lookup: accent intent → semantic token class pair. */
export function accentTokens(accent: Accent): AccentTokens {
  switch (accent) {
    case 'success':
      return { fill: 'bg-status-success-fill', text: 'text-status-success-text' }
    case 'warning':
      return { fill: 'bg-status-warning-fill', text: 'text-status-warning-text' }
    case 'danger':
      return { fill: 'bg-status-error-fill', text: 'text-status-error-text' }
    case 'navy':
      return { fill: 'bg-action-secondary', text: 'text-action-secondary' }
  }
}
