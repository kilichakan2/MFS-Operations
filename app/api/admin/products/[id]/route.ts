/**
 * app/api/admin/products/[id]/route.ts
 * PATCH — toggle active on a product
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseService }           from '@/lib/supabase'

const supabase = supabaseService

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const role = req.headers.get('x-mfs-user-role')
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  }


    const { id }     = await params
    const { active } = await req.json() as { active: boolean }

    const { data, error } = await supabase
      .from('products')
      .update({ active })
      .eq('id', id)
      .select('id, name, category, active, created_at')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
