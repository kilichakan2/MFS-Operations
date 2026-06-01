/**
 * lib/orders/featureFlag.ts
 *
 * Feature-flag check for the order pipeline. Allows the cutover to be
 * paused without redeploying — set NEXT_PUBLIC_ORDER_PIPELINE_ENABLED=false
 * in Vercel env vars and the order/KDS pages render a paused notice
 * instead of their normal UI.
 *
 * Default: enabled. Has to be explicitly set to 'false' to disable, so
 * an unset env var doesn't accidentally disable the feature.
 *
 * Plan: docs/plans/2026-05-30-order-pipeline-kds-implementation.md (SB6)
 */

/**
 * Is the order pipeline feature enabled? Reads NEXT_PUBLIC_ORDER_PIPELINE_ENABLED
 * — defaults to true if unset.
 */
export function isOrderPipelineEnabled(): boolean {
  const raw = process.env.NEXT_PUBLIC_ORDER_PIPELINE_ENABLED
  if (raw === undefined || raw === '') return true  // default enabled
  return raw.toLowerCase() !== 'false' && raw !== '0'
}
