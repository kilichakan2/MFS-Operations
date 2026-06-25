/**
 * app/api/haccp/documents/route.ts
 * Returns the full document control register from haccp_documents.
 * Single source of truth — supersedes the paper register (MFS_Document_Control_Register_V1_0.docx).
 */

import { NextRequest, NextResponse } from 'next/server'
import { haccpHandbookServiceForCaller } from '@/lib/wiring/haccp'

export async function GET(req: NextRequest) {
  try {
    const role   = req.headers.get('x-mfs-user-role')
    const userId = req.headers.get('x-mfs-user-id')
    if (!role || !userId || !['warehouse', 'butcher', 'admin'].includes(role)) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 })
    }

    const svc = await haccpHandbookServiceForCaller(userId)

    const documents = await svc.getDocuments()
    return NextResponse.json(documents)
  } catch (err) {
    console.error('[GET /api/haccp/documents] Unhandled:', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
