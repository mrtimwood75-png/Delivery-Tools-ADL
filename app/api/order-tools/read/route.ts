import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/apiAuth'
import { getDocumentProxy, extractText } from 'unpdf'
import { parseOrderText } from '@/lib/orderDoc'

// Reads an uploaded BoConcept order/quote PDF and returns the customer +
// amount fields for the Order Tools form to auto-fill.
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'No PDF uploaded.' }, { status: 400 })

    const bytes = new Uint8Array(await file.arrayBuffer())
    const pdf = await getDocumentProxy(bytes)
    const { text } = await extractText(pdf, { mergePages: true })
    const parsed = parseOrderText(text)
    // Pre-select the button from the document's own heading (we never upload a
    // Tax Invoice, so it's only ever 'quote' or 'order').
    const docType: 'quote' | 'order' = /\bquotation\b/i.test(text) ? 'quote' : 'order'
    return NextResponse.json({ parsed, docType })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not read the PDF.' }, { status: 500 })
  }
}
