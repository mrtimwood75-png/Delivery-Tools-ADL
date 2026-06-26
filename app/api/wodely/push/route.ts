import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { pushOrdersToWodely } from '@/lib/wodely'

// Pushing builds + creates tasks one per order; allow time for larger batches.
export const maxDuration = 300

export async function POST(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json().catch(() => ({}))
    const ids = Array.isArray(body.ids) ? body.ids.map((x: unknown) => String(x)).filter(Boolean) : []
    if (!ids.length) return NextResponse.json({ error: 'No orders selected.' }, { status: 400 })
    const result = await pushOrdersToWodely(ids)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Wodely push failed.' }, { status: 500 })
  }
}
