/**
 * POST /api/admin/import
 *
 * Accepts raw pasted text and a target type ('customers' or 'products').
 * Uses Anthropic tool_use (structured output) to force the model to return
 * a typed schema — the SDK serialises it, so character-escaping issues
 * (inch marks, quotes in product names/sizes, etc.) are impossible.
 *
 * Called once per import at the mapping/preview stage only.
 * No database writes here — those happen at /api/admin/import/confirm.
 */

import { NextRequest, NextResponse } from 'next/server'
import Anthropic                     from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── Tool definitions ───────────────────────────────────────────────────────────

const CUSTOMER_TOOL: Anthropic.Tool = {
  name:        'return_mapped_customers',
  description: 'Return the mapped customer data extracted from the raw input.',
  input_schema: {
    type: 'object',
    properties: {
      clean_rows: {
        type:        'array',
        description: 'Rows successfully mapped to a customer name.',
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

// PRODUCT_TOOL uses a fully flat schema — every property is type:"string" and
// all four fields are required. The model uses the sentinel value "none" for
// any field it cannot fill. The confirm route converts "none" → null before
// inserting into Supabase, so the database stays clean.
// This avoids all anyOf / nullable / type-array syntax which Anthropic's schema
// validator has silently rejected (returning empty input objects).

const PRODUCT_TOOL: Anthropic.Tool = {
  name:        'return_mapped_products',
  description: 'Return the mapped product data extracted from the raw input.',
  input_schema: {
    type: 'object',
    properties: {
      clean_rows: {
        type:        'array',
        description: 'Rows successfully mapped to a product.',
        items: {
          type: 'object',
          properties: {
            name:     { type: 'string', description: 'The product name, trimmed. Required — never "none".' },
            category: { type: 'string', description: 'Product category, or the string "none" if unknown.' },
            code:     { type: 'string', description: 'Product/SKU code, or the string "none" if not present.' },
            box_size: { type: 'string', description: 'Box/pack size (e.g. "10kg", "12 x 500g"), or the string "none" if not present.' },
          },
          required: ['name', 'category', 'code', 'box_size'],
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

Call the return_mapped_products tool. Every row in clean_rows MUST include all four fields: name, category, code, box_size.

REQUIRED SENTINEL VALUE:
Every field is required. If you do not have a value for category, code, or box_size, you MUST provide the string "none" — do not omit the field, do not use null, do not leave it blank. Use exactly the string "none".

Example for a row with only a name:
  { "name": "Lamb Shoulder", "category": "Meat", "code": "none", "box_size": "none" }

Example for a row with all fields:
  { "name": "Beypazari Mineral Water", "category": "Beverages", "code": "20997", "box_size": "Box (24 x 200ml)" }

CRITICAL — DATA-DRIVEN MAPPING, NOT HEADER-DRIVEN:
Do not rely solely on column headers to identify which column is the product name.
Analyze the actual values in every row. If a cell contains a recognisable food, beverage, or wholesale item name (e.g. "Beypazari Mineral Water", "Coca Cola", "Lamb Shoulder", "Chicken Breast", "Basmati Rice 10kg"), you MUST map it to the name field regardless of what the column header says — even if the header is "Product Name/Description", "Description", "Item", "Article", or anything else. The header is a hint, not a rule.

FIELD MAPPING:
  name     — the product/item description. Any string that looks like a food or beverage product name.
             Headers include (not limited to): Product, Item, Description, Product Name,
             Product Name/Description, SKU Description, Article, Article Name.
  category — product category. Headers: Category, Type, Department, Group.
             Infer from the product name if absent (Meat, Lamb, Beef, Chicken, Poultry, Pork,
             Fish, Seafood, Frozen, Dairy, Ambient, Grocery, Produce, Deli, Beverages, Dry Goods).
             Use "none" only if completely uninferable.
  code     — product/SKU reference code. Headers: Code, SKU, Item Code, Product Code, Ref, PLU, Product No.
             Use "none" if not present.
  box_size — box/pack/case size. Headers: Box Size, Pack Size, Pack Weight, Case Size, UOM, Size, Weight.
             Preserve exact value including units. Use "none" if not present.

FLAGGING RULES:
  Only flag a row if the product NAME is missing, blank, or completely unrecognisable.
  NEVER flag a row because category, code, or box_size is absent — use "none" instead.
  Also flag: blank rows, spreadsheet header rows, total/subtotal rows, exact duplicate names.

Strip leading/trailing whitespace from all values.
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

    const message = await client.messages.create({
      model:       'claude-sonnet-4-6',
      max_tokens:  4096,
      system:      systemPrompt,
      tools:       [tool],
      tool_choice: { type: 'tool', name: tool.name },
      messages: [{
        role:    'user',
        content: `Map the following ${entityLabel} data:\n\n${raw_text.trim()}`,
      }],
    })

    const toolBlock = message.content.find((b) => b.type === 'tool_use') as
      | Anthropic.ToolUseBlock
      | undefined

    if (!toolBlock) {
      console.error('[import] No tool_use block. stop_reason:', message.stop_reason)
      console.error('[import] Content:', JSON.stringify(message.content))
      return NextResponse.json(
        { error: 'AI did not return structured data — please try again' },
        { status: 502 }
      )
    }

    const raw = toolBlock.input as Record<string, unknown>
    const clean_rows   = Array.isArray(raw.clean_rows)   ? raw.clean_rows   : []
    const flagged_rows = Array.isArray(raw.flagged_rows) ? raw.flagged_rows : []

    if (!Array.isArray(raw.clean_rows))   console.warn('[import] clean_rows missing, defaulted to []')
    if (!Array.isArray(raw.flagged_rows)) console.warn('[import] flagged_rows missing, defaulted to []')

    return NextResponse.json({ clean_rows, flagged_rows })

  } catch (err) {
    console.error('[import] Unhandled error:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
