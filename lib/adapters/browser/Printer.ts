/**
 * lib/adapters/browser/Printer.ts
 *
 * Browser/AirPrint transport adapter for the Printer port (F-PROD-04 Pass 2a,
 * ADR-0010). Relocated verbatim from lib/printing/labelFetch.ts (Pass 1) — the
 * fetch + hidden-iframe + window.print() path. Handles BOTH label types, ALL
 * widths, and is the universal fallback the Sunmi adapter delegates to.
 *
 * The original Pass-1 rationale (load-bearing documentation) follows.
 *
 * ── Shared, testable label-print client (F-PROD-04 Pass 1) ──
 *
 * Both the HACCP delivery and mince screens previously held their own copy of a
 * `printLabelInApp` that fetched the label HTML and checked ONLY `res.ok`. When a
 * session is dead/legacy/unverified, the middleware fail-closes and redirects the
 * `/api/labels` request to `/login`, which returns 200 HTML. The old check saw
 * `res.ok === true`, read the login page's HTML, wrote it into a hidden iframe and
 * printed it — a silent failure (login page printed / nothing printed, no error).
 *
 * This module holds the single correct routine once (the two pages had duplicated
 * the bug). The detection decision is a PURE function (`classifyLabelResponse`) so
 * it is fully unit-testable without a browser; the fetch + iframe + print wrapper
 * (`printLabelInApp`) gates its success path on that classifier.
 *
 * Detection signal — the load-bearing tell is "did this request end up on the
 * login page?". A real label request stays on the `/api/labels` path; a dead
 * session is redirected to `/login`. After the default follow-redirect fetch,
 * `res.redirected` + `res.url` expose the final destination, which we test by
 * pathname (NOT a raw substring match, so `/api/labels?from=/login` is NOT a
 * bounce).
 *
 * Body guard: deliberately OMITTED. The redirect-URL signal is sufficient and is
 * what the tests pin; sniffing the body for a label marker risks a false positive
 * (a valid label wrongly blocked — the one MEDIUM risk in the plan) if the login
 * page or label template is ever restyled. We only ever read `res.text()` AFTER
 * classification says "label", so login HTML is never written to an iframe.
 *
 * ASSUMPTION (pin this): this classifier is correct because `/api/labels` lives in
 * middleware's SHARED_API_PATHS — so an unauthenticated/dead session bounces to
 * `/login` (caught here as 'auth-bounce'), and any authenticated session of any
 * role passes through. If `/api/labels` is ever moved to ROLE-gating, a
 * permission-denied redirect goes to a role-home page (NOT `/login`), which this
 * classifier would wrongly accept as a 'label' and print. If you role-gate the
 * route, extend the bounce detection accordingly.
 *
 * No vendor SDK: this is owned, vendor-free transport code. The browser print API
 * (fetch + iframe + window.print) is a platform API, wrapped here behind the
 * owned Printer port.
 */

import type {
  Printer,
  DeliveryLabelInput,
  MinceLabelInput,
  PrintErrorKind,
} from '@/lib/ports'

export type LabelResponseKind = 'label' | 'auth-bounce' | 'error'

/**
 * Decide whether a fetched response is a real label, an auth-bounce to the login
 * page, or a hard error. Pure and synchronous — no body read, no side effects.
 *
 * Rule:
 *   - AUTH BOUNCE if the final url's pathname starts with '/login'
 *     (covers both a followed redirect and any direct landing on /login).
 *   - ERROR if !res.ok (401/404/500 …), or if the url is missing/malformed.
 *   - LABEL otherwise.
 */
export function classifyLabelResponse(res: {
  ok: boolean
  redirected: boolean
  url: string
  status: number
}): LabelResponseKind {
  let pathname: string
  try {
    pathname = new URL(res.url).pathname
  } catch {
    // Relative/empty/malformed url — we cannot trust this response. Treat as a
    // hard error rather than throwing.
    return 'error'
  }

  if (pathname.startsWith('/login')) {
    return 'auth-bounce'
  }

  if (!res.ok) {
    return 'error'
  }

  return 'label'
}

/**
 * Fetch a label and print it without opening a new tab.
 *
 * Fetches the label HTML from the API, classifies the response, and ONLY on a
 * real label injects it into a hidden iframe and triggers the native print
 * dialog (AirPrint on iOS), then removes the iframe. On an auth-bounce or hard
 * error it calls `onError(kind)` and returns WITHOUT writing anything to an
 * iframe — so a login page is never printed.
 *
 * The iframe styling and the onload / setTimeout(...,300) / setTimeout(...,2000)
 * timings are moved verbatim from the previous per-page implementations, so a
 * valid label prints with byte-identical behaviour.
 *
 * Works on: desktop browser, iOS Safari, iOS PWA standalone mode, and the Sunmi
 * Android WebView (the browser/iframe fallback path).
 */
export async function printLabelInApp(
  url: string,
  onError: (kind: 'auth-bounce' | 'error') => void,
): Promise<void> {
  try {
    const res = await fetch(url)

    const kind = classifyLabelResponse(res)
    if (kind !== 'label') {
      console.error('[printLabelInApp]', kind, res.status, res.url)
      onError(kind)
      return
    }

    const html = await res.text()

    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0;pointer-events:none'
    document.body.appendChild(iframe)

    const doc = iframe.contentDocument ?? iframe.contentWindow?.document
    if (!doc) { document.body.removeChild(iframe); return }

    doc.open()
    doc.write(html)
    doc.close()

    // Wait for iframe content (including SVG barcodes) to render before printing
    iframe.onload = () => {
      setTimeout(() => {
        iframe.contentWindow?.print()
        // Clean up after print dialog closes (or after timeout on iOS)
        setTimeout(() => {
          if (document.body.contains(iframe)) document.body.removeChild(iframe)
        }, 2000)
      }, 300)
    }
  } catch (err) {
    console.error('[printLabelInApp]', err)
    onError('error')
  }
}

/**
 * Build the byte-identical `/api/labels` URL for a delivery label.
 * Param order (LOCKED, byte-for-byte with the pre-refactor screen): type, id,
 * format, copies, width.
 */
function deliveryUrl(input: DeliveryLabelInput): string {
  return `/api/labels?type=delivery&id=${input.id}&format=html&copies=${input.copies}&width=${input.width}`
}

/**
 * Build the byte-identical `/api/labels` URL for a mince label.
 * Param order (LOCKED, byte-for-byte with the pre-refactor mince screen): type,
 * id, format, copies, usebydays, width.
 */
function minceUrl(input: MinceLabelInput): string {
  return `/api/labels?type=mince&id=${input.id}&format=html&copies=${input.copies}&usebydays=${input.usebydays}&width=${input.width}`
}

/**
 * The Browser/AirPrint transport adapter — the universal fallback. Builds the
 * single-source-of-truth `/api/labels` URL for both label types and prints via
 * the iframe path. This is the only place the URL strings are constructed, so the
 * Sunmi adapter's fallback (which calls this adapter's methods) emits the exact
 * same strings.
 */
export function createBrowserPrinter(): Printer {
  return {
    printDeliveryLabel(
      input: DeliveryLabelInput,
      onError: (kind: PrintErrorKind) => void,
    ): Promise<void> {
      return printLabelInApp(deliveryUrl(input), onError)
    },
    printMinceLabel(
      input: MinceLabelInput,
      onError: (kind: PrintErrorKind) => void,
    ): Promise<void> {
      return printLabelInApp(minceUrl(input), onError)
    },
  }
}
