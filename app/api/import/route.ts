import { NextRequest, NextResponse } from 'next/server'
import { ingestRows, type ImportRow } from '@/lib/ingestOrders'

// BCA packing-list / Tour Totals import. Thin wrapper around the shared
// ingestRows() merge logic, tagging everything it creates as source 'bca'.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const rows = Array.isArray(body.rows) ? (body.rows as ImportRow[]) : []
    if (!rows.length) return NextResponse.json({ error: 'No rows supplied.' }, { status: 400 })

    const result = await ingestRows(rows, { source: 'bca' })
    if (!result.imported) return NextResponse.json({ error: 'No rows supplied.' }, { status: 400 })

    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed.' }, { status: 500 })
  }
}
