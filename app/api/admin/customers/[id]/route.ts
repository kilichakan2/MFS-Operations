/**
 * app/api/admin/customers/[id]/route.ts
 * PATCH — toggle active on a customer
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient }              from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id }     = await params
    const { active } = await req.json() as { active: boolean }

    const { data, error } = await supabase
      .from('customers')
      .update({ active })
      .eq('id', id)
      .select('id, name, active, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
