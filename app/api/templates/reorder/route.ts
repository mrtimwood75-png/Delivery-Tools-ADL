import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// Persists a new display order for SMS templates. Expects { ids: string[] } in
// the desired order; each id is stamped with an evenly-spaced sort_order.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const ids: string[] = Array.isArray(body.ids) ? body.ids.map((id: unknown) => String(id)) : []

    if (ids.length === 0) {
      return NextResponse.json({ error: 'No template ids provided.' }, { status: 400 })
    }

    for (let index = 0; index < ids.length; index++) {
      const { error } = await supabaseAdmin
        .from('notification_templates')
        .update({ sort_order: (index + 1) * 10 })
        .eq('id', ids[index])
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ reordered: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Reorder failed.' }, { status: 500 })
  }
}
