/**
 * POST /api/admin/import
 *
 * Accepts raw pasted text and a target type ('customers' or 'products').
 * Delegates to the LLMExtractor port (wired to the Anthropic adapter), which
 * uses tool_use (structured output) to force the model to return a typed
 * schema — the SDK serialises it, so character-escaping issues (inch marks,
 * quotes in product names/sizes, etc.) are impossible.
 *
 * Called once per import at the mapping/preview stage only.
 * No database writes here — those happen at /api/admin/import/confirm.
 *
 * This route is a thin doorman: it validates input, dispatches on `type` to the
 * port, and maps the port's typed error to the same 502 it always returned. All
 * AI machinery (model, prompts, tool schemas, parse) lives in the adapter; the
 * route never imports a vendor SDK. Swapping the AI vendor changes one adapter
 * + one wiring line — nothing here.
 */

import { NextRequest, NextResponse } from 'next/server'
import { llmExtractor } from '@/lib/wiring/llm'
import { LLMExtractionError } from '@/lib/ports'

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-mfs-user-id')
    if (!userId) {
      return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
    }

    const body = await req.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { raw_text, type } = body as { raw_text?: string; type?: string }

    if (!raw_text?.trim()) {
      return NextResponse.json({ error: 'raw_text is required' }, { status: 400 })
    }
    if (type !== 'customers' && type !== 'products') {
      return NextResponse.json({ error: 'type must be "customers" or "products"' }, { status: 400 })
    }

    const result =
      type === 'customers'
        ? await llmExtractor.extractCustomers(raw_text)
        : await llmExtractor.extractProducts(raw_text)

    return NextResponse.json(result)

  } catch (err) {
    if (err instanceof LLMExtractionError) {
      return NextResponse.json(
        { error: 'AI did not return structured data — please try again' },
        { status: 502 }
      )
    }
    console.error('[import] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
