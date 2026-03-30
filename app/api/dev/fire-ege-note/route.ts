export const dynamic = 'force-dynamic'

/**
 * ONE-SHOT ENDPOINT — DELETE AFTER USE
 * Fires the email for Ege's note on the Prime Cut complaint.
 * Locked to one specific note ID. Requires token param.
 */

import { NextRequest, NextResponse } from 'next/server'

const TOKEN = 'mfs-fire-ege-4829'

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get('token') !== TOKEN) {
    return NextResponse.json({ error: 'nope' }, { status: 401 })
  }

  try {
    const { sendComplaintEmail } = await import('@/lib/complaint-email')

    await sendComplaintEmail({
      type:       'note_added',
      noteBody:   'Kac çektiği derken neden bahsediyorsun? Açıklama yapar mısın?',
      noteAuthor: 'Ege',
      complaint: {
        id:          'a283c973-eb99-4d85-b910-d8cec099ce13',
        customer:    'PRIME CUT - LA TURKA HOLDINGS LTD',
        category:    'quality',
        description: 'Son giden sirloinlerin kac çektiğini söylüyor ve iade istiyor. Video gönderdi',
        status:      'open',
        loggedBy:    'Ege',
      },
    })

    return NextResponse.json({ ok: true, message: 'Email fired for Ege note' })
  } catch (e) {
    const msg = e instanceof Error ? e.stack : String(e)
    console.error('[fire-ege-note]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
