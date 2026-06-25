/**
 * app/api/haccp/documents/route.ts
 * Returns the full document control register from haccp_documents.
 * Single source of truth — supersedes the paper register (MFS_Document_Control_Register_V1_0.docx).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpHandbookService }      from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role = req.cookies.get('mfs_role')?.value
    if (!role || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const documents = await haccpHandbookService.getDocuments()
    return NextResponse.json(documents)
  } catch (err) {
    console.error('[GET /api/haccp/documents] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
