import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('notification_templates')
    .select('id, name, template_text, audience, is_active, sort_order, purpose')
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ templates: data || [] })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const name = String(body.name || '').trim()
    const template_text = String(body.template_text || '').trim()
    const audience = String(body.audience || 'Both')
    // Purpose drives automated behaviour in the inbound webhook:
    //   delivery_booking        - a reply (1/yes, 2/no) confirms or rejects the delivery date
    //   delivery_confirmed_reply - auto-sent back to the customer when they confirm
    //   delivery_rejected_reply  - auto-sent back to the customer when they reject
    //   payment_received         - auto-sent when a Stripe payment clears
    const allowedPurposes = ['delivery_booking', 'delivery_confirmed_reply', 'delivery_rejected_reply', 'payment_received']
    const purpose = allowedPurposes.includes(String(body.purpose)) ? String(body.purpose) : null

    if (!name || !template_text) {
      return NextResponse.json({ error: 'Template name and text are required.' }, { status: 400 })
    }

    // Editing an existing template must not change its position, so only assign
    // a sort_order for brand-new templates (placed at the end of the list).
    const { data: existing } = await supabaseAdmin
      .from('notification_templates')
      .select('id')
      .eq('name', name)
      .maybeSingle()

    const row: Record<string, unknown> = { name, template_text, audience, is_active: true, purpose }
    if (!existing) {
      const { data: maxRow } = await supabaseAdmin
        .from('notification_templates')
        .select('sort_order')
        .order('sort_order', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle()
      row.sort_order = (Number(maxRow?.sort_order) || 0) + 10
    }

    const { data, error } = await supabaseAdmin
      .from('notification_templates')
      .upsert(row, { onConflict: 'name' })
      .select('id, name, template_text, audience, is_active, sort_order, purpose')
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ template: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Template save failed.' }, { status: 500 })
  }
}
