import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const fallbackOptions = ['Open', 'Awaiting Customer', 'Awaiting Goods', 'Delivery Booked', 'Delivered', 'Cancelled']
const noStore = { 'Cache-Control': 'no-store, max-age=0' }

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('customer_status_options')
    .select('name, sort_order, is_active')
    .eq('is_active', true)
    .order('sort_order')

  if (error) return NextResponse.json({ options: fallbackOptions }, { headers: noStore })
  return NextResponse.json({ options: (data || []).map((row) => row.name).filter(Boolean) }, { headers: noStore })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const options = Array.isArray(body.options) ? body.options.map((item: unknown) => String(item).trim()).filter(Boolean) : []
    const uniqueOptions = Array.from(new Set(options))

    if (!uniqueOptions.length) return NextResponse.json({ error: 'At least one status is required.' }, { status: 400 })

    const { error: clearError } = await supabaseAdmin
      .from('customer_status_options')
      .delete()
      .not('name', 'is', null)

    if (clearError) return NextResponse.json({ error: clearError.message }, { status: 500 })

    const payload = uniqueOptions.map((name, index) => ({ name, sort_order: index + 1, is_active: true }))
    const { error } = await supabaseAdmin
      .from('customer_status_options')
      .insert(payload)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ options: uniqueOptions })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Status options save failed.' }, { status: 500 })
  }
}
