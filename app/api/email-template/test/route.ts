import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { sendEmail } from '@/lib/email'
import { paymentBrandForHost } from '@/lib/host'
import { brandConfig } from '@/lib/brand'

// Sends the delivery template (with sample data) to a chosen address so the
// email setup can be verified without marking a real order delivered.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const to = String(body.to || '').trim()
    if (!to) return NextResponse.json({ error: 'Enter an email address to send the test to.' }, { status: 400 })

    const { data: tpl } = await supabaseAdmin
      .from('email_templates')
      .select('subject, body')
      .eq('key', 'delivery')
      .maybeSingle()

    const fill = (text: string) => String(text || '')
      .replaceAll('{order_number}', 'OS-000000')
      .replaceAll('{customer_name}', 'Sample Customer')
      .replaceAll('{salesperson_code}', 'TEST')
      .replaceAll('{salesperson_name}', 'Sample Salesperson')
      .replaceAll('{delivery_date}', new Date().toLocaleDateString('en-AU'))

    const subject = fill(tpl?.subject || 'Delivery email test')
    const text = `This is a TEST of the delivery email.\n\n${fill(tpl?.body || '')}`

    // Send from the host's brand address (Transforma app -> TRANSFORMA_EMAIL_FROM,
    // BoConcept/dashboard -> BCA_EMAIL_FROM), matching the real delivery emails.
    const brand = paymentBrandForHost(request.headers.get('host')) || 'bca'
    await sendEmail({ to, subject, text, from: brandConfig(brand).emailFrom || undefined })
    return NextResponse.json({ ok: true, sentTo: to })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Test email failed.' }, { status: 500 })
  }
}
