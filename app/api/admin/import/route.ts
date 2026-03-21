/**
 * POST /api/admin/import
 *
 * Accepts raw pasted text and a target type ('customers' or 'products').
 * Uses Anthropic tool_use (structured output) to force the model to return
 * a typed schema — the SDK serialises it as JSON, so the model never writes
 * raw JSON text and character-escaping issues (inch marks, quotes in product
 * names/sizes, etc.) are impossible.
 *
 * Called once per import at the mapping/preview stage only.
 * No database writes here — those happen at /api/admin/import/confirm.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Tool definitions ───────────────────────────────────────────────────────────
// Using tool_use forces the model to populate a typed schema instead of writing
// raw JSON text.  The SDK serialises the input object — the model never produces
// raw JSON characters, so unescaped quotes / inch-marks / special chars in
// product names or box sizes cannot break parsing.

const CUSTOMER_TOOL: Anthropic.Tool = {
  name:        'return_mapped_customers',
  description: 'Return the mapped customer data extracted from the raw input.',
  input_schema: {
    type: 'object',
    properties: {
      clean_rows: {
        type:        'array',
        description: 'Rows that were successfully mapped to a customer name.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'The business / restaurant name, trimmed.' },
          },
          required: ['name'],
        },
      },
      flagged_rows: {
        type:        'array',
        description: 'Rows that could not be mapped or should be reviewed.',
        items: {
          type: 'object',
          properties: {
            row:    { type: 'number', description: '1-indexed line number in the original input.' },
            raw:    { type: 'string', description: 'Short excerpt of the problematic row (max 60 chars).' },
            reason: { type: 'string', description: 'Why this row was flagged.' },
          },
          required: ['row', 'raw', 'reason'],
        },
      },
    },
    required: ['clean_rows', 'flagged_rows'],
  },
}

const PRODUCT_TOOL: Anthropic.Tool = {
  name:        'return_mapped_products',
  description: 'Return the mapped product data extracted from the raw input.',
  input_schema: {
    type: 'object',
    properties: {
      clean_rows: {
        type:        'array',
        description: 'Rows that were successfully mapped to a product.',
        items: {
          type: 'object',
          properties: {
            name:     { type: 'string',  description: 'The product name, trimmed.'                                      },
            category: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Product category, or null if unknown.'     },
            code:     { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Product / SKU code, or null if not present.' },
            box_size: { anyOf: [{ type: 'string' }, { type: 'null' }], description: 'Box/pack size (e.g. "10kg", "12 x 500g"), or null.' },
          },
          required: ['name'],  // category, code, box_size are optional
        },
      },
      flagged_rows: {
        type:        'array',
        description: 'Rows that could not be mapped or should be reviewed.',
        items: {
          type: 'object',
          properties: {
            row:    { type: 'number', description: '1-indexed line number in the original input.' },
            raw:    { type: 'string', description: 'Short excerpt of the problematic row (max 60 chars).' },
            reason: { type: 'string', description: 'Why this row was flagged.' },
          },
          required: ['row', 'raw', 'reason'],
        },
      },
    },
    required: ['clean_rows', 'flagged_rows'],
  },
}

// ── System prompts ─────────────────────────────────────────────────────────────

const CUSTOMER_SYSTEM = `You are a data mapping assistant for a wholesale food distributor.

You will receive raw text — a CSV export, tab-separated data, a spreadsheet paste, or a free-form list — containing customer / business names.

Call the return_mapped_customers tool with:
  clean_rows   — one entry per valid business name found
  flagged_rows — rows that are blank, look like headers, look like totals, are missing a name, or appear to be duplicates (same name already in clean_rows)

MAPPING RULES:
- Accepted header variants: Customer, Client, Business, Account, Name, Company, Restaurant, Venue
- Strip leading/trailing whitespace from every name
- Skip and flag: blank rows, header rows, total rows (e.g. "TOTAL: 47"), rows clearly not business names
- Flag likely duplicates: same name case-insensitively appears more than once in the input
- row numbers are 1-indexed from the original input`

const PRODUCT_SYSTEM = `You are a data mapping assistant for a wholesale food distributor.

You will receive raw text — a CSV export, tab-separated data, a spreadsheet paste, or a free-form list — containing product data.

Call the return_mapped_products tool with:
  clean_rows   — one entry per valid product found
  flagged_rows — rows that are blank, look like spreadsheet headers/totals, or have NO product name at all

CRITICAL — DATA-DRIVEN MAPPING, NOT HEADER-DRIVEN:
Do not rely solely on column headers to identify which column is the product name.
Analyze the actual values in every row. If a cell contains a recognisable food, beverage, or wholesale item name (e.g. "Beypazari Mineral Water", "Coca Cola", "Lamb Shoulder", "Chicken Breast", "Basmati Rice 10kg"), you MUST map it to the name field regardless of what the column header says — even if the header is "Product Name/Description", "Description", "Item", "Article", or anything else. The header is a hint, not a rule.

MAPPING RULES FOR EACH FIELD:
  name     — the product / item description. Look at the row values, not just the header.
             Accepted header variants include (but are not limited to): Product, Item, Description,
             Product Name, Product Name/Description, SKU Description, Article, Article Name.
             If a string value looks like a food or beverage product name, treat it as name.
  category — product category or type. Headers: Category, Type, Department, Group.
             If absent but inferable from the product name, infer it.
             Common categories: Meat, Lamb, Beef, Chicken, Poultry, Pork, Fish, Seafood,
             Frozen, Dairy, Ambient, Grocery, Produce, Deli, Beverages, Dry Goods.
             Set to null if genuinely unknown — this is fine.
  code     — product/SKU reference code. Headers: Code, SKU, Item Code, Product Code, Ref, PLU, Product No.
             Set to null if not present — this is fine.
  box_size — box, pack, or case size (e.g. "10kg", "12 x 500g", "6 x 1kg").
             Headers: Box Size, Pack Size, Pack Weight, Case Size, Unit Size, Pack, Case, Weight, Size, UOM.
             Preserve the exact value from the source data including units.
             Set to null if not present — this is fine.

CRITICAL — OPTIONAL FIELDS:
category, code, and box_size are ALL entirely optional.
NEVER flag a row because category, code, or box_size is missing.
ONLY flag a row if the product NAME itself is missing, blank, or completely unrecognisable.
A row with only a name and nothing else is a perfectly valid clean row.

Strip leading/trailing whitespace from all values.
Flag likely duplicates: same name case-insensitively appears more than once in the input.
row numbers are 1-indexed from the original input.`

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
      return NextResponse.json({ error: 'type must be "customers" or "products"' }, { status: 400 })
    }

    const tool         = type === 'customers' ? CUSTOMER_TOOL   : PRODUCT_TOOL
    const systemPrompt = type === 'customers' ? CUSTOMER_SYSTEM : PRODUCT_SYSTEM
    const entityLabel  = type === 'customers' ? 'customer'      : 'product'

    // ── Tool-use call — model must call the tool, no free-text response ────────
    const message = await client.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:  4096,
      system:      systemPrompt,
      tools:       [tool],
      tool_choice: { type: 'tool', name: tool.name },  // force tool call
      messages: [{
        role:    'user',
        content: `Map the following ${entityLabel} data:\n\n${raw_text.trim()}`,
      }],
    })

    // ── Extract tool_use block ─────────────────────────────────────────────────
    const toolBlock = message.content.find((b) => b.type === 'tool_use') as
      | Anthropic.ToolUseBlock
      | undefined

    if (!toolBlock) {
      // Shouldn't happen with tool_choice: forced, but log if it does
      console.error('[import] No tool_use block in response. stop_reason:', message.stop_reason)
      console.error('[import] Content blocks:', JSON.stringify(message.content))
      return NextResponse.json(
        { error: 'AI did not return structured data — please try again' },
        { status: 502 }
      )
    }

    // toolBlock.input is already a parsed JS object — no JSON.parse() needed.
    // Use explicit fallbacks: the model occasionally omits an empty array even
    // when it is in the tool's required[] (e.g. flagged_rows when all rows are
    // clean, or clean_rows when every row is flagged). Defaulting to [] is
    // always correct — we never error on a missing empty array.
    const raw = toolBlock.input as Record<string, unknown>

    const clean_rows   = Array.isArray(raw.clean_rows)   ? raw.clean_rows   : []
    const flagged_rows = Array.isArray(raw.flagged_rows) ? raw.flagged_rows : []

    if (!Array.isArray(raw.clean_rows)) {
      console.warn('[import] clean_rows missing — defaulted to []:', JSON.stringify(raw).slice(0, 200))
    }
    if (!Array.isArray(raw.flagged_rows)) {
      console.warn('[import] flagged_rows missing — defaulted to []:', JSON.stringify(raw).slice(0, 200))
    }

    return NextResponse.json({ clean_rows, flagged_rows })

  } catch (err) {
    console.error('[import] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
