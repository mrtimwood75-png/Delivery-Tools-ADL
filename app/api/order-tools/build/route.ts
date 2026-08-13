import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/apiAuth'
import { buildBrandedFromForm } from '@/lib/orderBuild'

// Returns a branded copy of the uploaded order/quote PDF: BoConcept logo on
// every page, optional "Tax Invoice" overlay, and an optional working
// Pay Now / Confirm Order link button.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const built = await buildBrandedFromForm(form)
    if ('error' in built) return NextResponse.json({ error: built.error }, { status: 400 })

    return new NextResponse(Buffer.from(built.bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${built.downloadName}"`,
        'Cache-Control': 'no-store'
      }
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not build the PDF.' }, { status: 500 })
  }
}
