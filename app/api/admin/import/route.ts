/**
 * POST /api/admin/import
 *
 * Accepts raw pasted text (CSV, tab-separated, free-form) and a target type
 * ('customers' or 'products'). Sends it to claude-sonnet-4-6 and returns:
 *   { clean_rows: [...], flagged_rows: [...] }
 *
 * Called once per import at the mapping/preview stage only.
 * No database writes happen here — those happen at /api/admin/import/confirm.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// ── System prompts ─────────────────────────────────────────────────────────────
// Critically: the final paragraph of each prompt is an unambiguous instruction
// to return raw JSON only — no markdown, no prose, starting with { ending with }.

const CUSTOMER_SYSTEM_PROMPT = `You are a data mapping assistant for a wholesale food distributor's internal app.

You will receive raw text that may be a CSV export, tab-separated data, a spreadsheet paste, or free-form text containing customer names.

Your job is to extract business/restaurant names and return them in a strict JSON format.

MAPPING RULES:
- Map any column that represents a business name, client name, customer name, or account name to the "name" field
- Common header variants to recognise: "Customer", "Client", "Business", "Account", "Name", "Company", "Restaurant", "Venue", "Account Name", "Customer Name", "Business Name"
- Strip all whitespace from the start and end of each name
- SKIP and FLAG: blank rows, rows that are clearly headers (e.g. the row contains "Customer" or "Name" as the only value), rows missing a name, rows that look like totals (e.g. "TOTAL: 47"), rows that are clearly not business names
- FLAG as likely duplicate: if the same name (case-insensitive) appears more than once in the input
- A "raw" field in flagged_rows should contain a short excerpt of the problematic row (max 60 chars)
- row numbers are 1-indexed based on the original input lines

OUTPUT FORMAT — THIS IS MANDATORY:
Return strictly valid JSON only. Do not use markdown code blocks. Do not wrap in backticks. Do not include any conversational text, explanation, or preamble. Your response must start exactly with the character { and end exactly with the character }. The exact structure required:
{"clean_rows":[{"name":"Business Name Here"}],"flagged_rows":[{"row":3,"raw":"short excerpt","reason":"explanation"}]}

If the input contains no valid names at all, return:
{"clean_rows":[],"flagged_rows":[{"row":1,"raw":"...","reason":"No valid customer names found in input"}]}`

const PRODUCT_SYSTEM_PROMPT = `You are a data mapping assistant for a wholesale food distributor's internal app.

You will receive raw text that may be a CSV export, tab-separated data, a spreadsheet paste, or free-form text containing product names.

Your job is to extract product names and optional categories, and return them in a strict JSON format.

MAPPING RULES:
- Map any column that represents a product name, item name, or description to the "name" field
- Map any column that represents a category, type, department, or product group to the "category" field
- If no category column exists but the category is clearly inferable from the product name, infer it. Common food wholesale categories: Meat, Lamb, Beef, Chicken, Poultry, Pork, Fish, Seafood, Frozen, Dairy, Ambient, Grocery, Produce, Deli
- Common name header variants: "Product", "Item", "Description", "Product Name", "Item Name", "SKU Description"
- Common category header variants: "Category", "Type", "Department", "Group", "Section"
- Strip all whitespace from the start and end of each name
- SKIP and FLAG: blank rows, header rows, total rows, rows missing a name, rows that look like subtotals or notes
- FLAG as likely duplicate: if the same product name (case-insensitive) appears more than once
- A "raw" field in flagged_rows should contain a short excerpt of the problematic row (max 60 chars)
- row numbers are 1-indexed based on the original input lines
- If category cannot be determined, set it to null (JSON null, not the string "null")

OUTPUT FORMAT — THIS IS MANDATORY:
Return strictly valid JSON only. Do not use markdown code blocks. Do not wrap in backticks. Do not include any conversational text, explanation, or preamble. Your response must start exactly with the character { and end exactly with the character }. The exact structure required:
{"clean_rows":[{"name":"Product Name Here","category":"Category or null"}],"flagged_rows":[{"row":3,"raw":"short excerpt","reason":"explanation"}]}

If the input contains no valid products at all, return:
{"clean_rows":[],"flagged_rows":[{"row":1,"raw":"...","reason":"No valid product names found in input"}]}`

// ── JSON extraction helper ─────────────────────────────────────────────────────
// Handles all known cases where the model wraps or decorates JSON:
//   - ```json ... ``` fences
//   - ``` ... ``` fences  
//   - Prose before the first {
//   - Prose after the last }
//   - Mixed whitespace / newlines

function extractJSON(raw: string): string {
  // Step 1: strip markdown fences anywhere in the string
  let s = raw
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')

  // Step 2: find the outermost { ... } pair
  const first = s.indexOf('{')
  const last  = s.lastIndexOf('}')

  if (first === -1 || last === -1 || last < first) {
    // No JSON object found — return the trimmed string and let JSON.parse fail
    // with a clear error rather than a confusing "unexpected end of JSON" message
    return s.trim()
  }

  return s.slice(first, last + 1)
}

// ── Route handler ──────────────────────────────────────────────────────────────

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
      return NextResponse.json(
        { error: 'type must be "customers" or "products"' },
        { status: 400 }
      )
    }

    const systemPrompt = type === 'customers' ? CUSTOMER_SYSTEM_PROMPT : PRODUCT_SYSTEM_PROMPT

    // ── Call Claude ──────────────────────────────────────────────────────────
    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system:     systemPrompt,
      messages: [
        {
          role:    'user',
          content: `Map the following ${type === 'customers' ? 'customer' : 'product'} data and return JSON only:\n\n${raw_text.trim()}`,
        },
      ],
    })

    // Extract raw text from response blocks
    const rawResponse = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('')

    // ── Parse and validate JSON ──────────────────────────────────────────────
    const extracted = extractJSON(rawResponse)

    let parsed: { clean_rows: unknown[]; flagged_rows: unknown[] }
    try {
      parsed = JSON.parse(extracted)
    } catch (parseErr) {
      // Log the full raw response so it appears in Vercel runtime logs
      console.error('[import] JSON.parse failed.')
      console.error('[import] Parse error:', String(parseErr))
      console.error('[import] Raw response from Claude (full):')
      console.error(rawResponse)
      console.error('[import] Extracted string attempted:')
      console.error(extracted)

      return NextResponse.json(
        { error: 'AI returned invalid JSON — please try again' },
        { status: 502 }
      )
    }

    if (!Array.isArray(parsed.clean_rows) || !Array.isArray(parsed.flagged_rows)) {
      console.error('[import] Parsed JSON missing required arrays:', JSON.stringify(parsed).slice(0, 300))
      return NextResponse.json(
        { error: 'AI response missing clean_rows or flagged_rows arrays' },
        { status: 502 }
      )
    }

    return NextResponse.json({
      clean_rows:   parsed.clean_rows,
      flagged_rows: parsed.flagged_rows,
    })

  } catch (err) {
    console.error('[import] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
