import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const BRANDS = new Set(['bca', 'transforma'])
const FIELDS = ['display_name', 'showroom_phone', 'warehouse_phone', 'email', 'address', 'bank_name', 'bank_bsb', 'bank_account'] as const

// Non-secret, customer-facing merchant details per brand. Editable by admins;
// used (with env fallback) in SMS templates and the payment success page.
export async function GET() {
  const { data, error } = await supabaseAdmin.from('merchant_settings').select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const settings: Record<string, Record<string, string>> = { bca: {}, transforma: {} }
  for (const row of data || []) {
    const brand = String(row.brand)
    if (!settings[brand]) settings[brand] = {}
    for (const f of FIELDS) settings[brand][f] = String((row as Record<string, unknown>)[f] || '')
  }
  return NextResponse.json({ settings }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const brand = String(body.brand || '').trim().toLowerCase()
    if (!BRANDS.has(brand)) return NextResponse.json({ error: 'Unknown brand.' }, { status: 400 })
    const payload: Record<string, unknown> = { brand, updated_at: new Date().toISOString() }
    for (const f of FIELDS) if (f in body) payload[f] = String(body[f] || '').trim() || null
    const { error } = await supabaseAdmin.from('merchant_settings').upsert(payload, { onConflict: 'brand' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Save failed.' }, { status: 500 })
  }
}
