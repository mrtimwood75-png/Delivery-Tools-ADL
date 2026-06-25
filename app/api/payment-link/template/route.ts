import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestUser } from '@/lib/apiAuth'
import {
  getSmsTemplate, DEFAULT_SMS_TEMPLATE, SMS_TEMPLATE_KEY,
  getEmailTemplates, DEFAULT_EMAIL_SUBJECT, DEFAULT_EMAIL_BODY, EMAIL_SUBJECT_KEY, EMAIL_BODY_KEY
} from '@/lib/paymentMessage'

// Read the current templates (any logged-in user, for the editor).
export async function GET() {
  const smsTemplate = await getSmsTemplate()
  const { subject: emailSubject, body: emailBody } = await getEmailTemplates()
  return NextResponse.json({
    smsTemplate,
    emailSubject,
    emailBody,
    defaults: { sms: DEFAULT_SMS_TEMPLATE, emailSubject: DEFAULT_EMAIL_SUBJECT, emailBody: DEFAULT_EMAIL_BODY }
  })
}

// Update templates — admins only. The user is taken from the verified token,
// then their role is checked against app_users.
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: appUser } = await supabaseAdmin
    .from('app_users')
    .select('role')
    .eq('email', (user.email || '').toLowerCase())
    .eq('is_active', true)
    .maybeSingle()
  if (appUser?.role !== 'admin') return NextResponse.json({ error: 'Admins only.' }, { status: 403 })

  const body = await request.json()
  const rows: { setting_key: string; setting_value: string; updated_at: string }[] = []
  const now = new Date().toISOString()

  if (typeof body.smsTemplate === 'string') {
    const v = body.smsTemplate.trim()
    if (!v) return NextResponse.json({ error: 'Customer SMS cannot be empty.' }, { status: 400 })
    if (!v.includes('{link}')) return NextResponse.json({ error: 'Customer SMS must include the {link} placeholder.' }, { status: 400 })
    rows.push({ setting_key: SMS_TEMPLATE_KEY, setting_value: v, updated_at: now })
  }
  if (typeof body.emailSubject === 'string') {
    const v = body.emailSubject.trim()
    if (!v) return NextResponse.json({ error: 'Email subject cannot be empty.' }, { status: 400 })
    rows.push({ setting_key: EMAIL_SUBJECT_KEY, setting_value: v, updated_at: now })
  }
  if (typeof body.emailBody === 'string') {
    const v = body.emailBody.trim()
    if (!v) return NextResponse.json({ error: 'Email body cannot be empty.' }, { status: 400 })
    rows.push({ setting_key: EMAIL_BODY_KEY, setting_value: v, updated_at: now })
  }

  if (!rows.length) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })

  const { error } = await supabaseAdmin.from('app_settings').upsert(rows, { onConflict: 'setting_key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ saved: true })
}
