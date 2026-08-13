import { NextRequest, NextResponse } from 'next/server'
import { getRequestUser } from '@/lib/apiAuth'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { buildBrandedFromForm } from '@/lib/orderBuild'
import { attachmentFilesForEmail } from '@/lib/orderAttachments'
import { sendEmail } from '@/lib/email'
import { brandConfig } from '@/lib/brand'

export const runtime = 'nodejs'

// Pull the bare address out of a "Name <addr@x>" or plain "addr@x" string.
function addressOf(raw: string) {
  const m = String(raw || '').match(/<\s*([^>]+)\s*>/)
  return (m ? m[1] : raw).trim()
}
const domainOf = (raw: string) => {
  const at = addressOf(raw).split('@')[1]
  return (at || '').toLowerCase().trim()
}

// Fill {customer_name}, {order_number}, {salesperson_name}, {doc_type},
// {amount} in a template's subject/body.
function render(tpl: string, fields: Record<string, string>) {
  return String(tpl || '').replace(/\{(\w+)\}/g, (whole, key) => (key in fields ? fields[key] : whole))
}

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const form = await request.formData()

    const to = String(form.get('customerEmail') || '').trim()
    if (!isEmail(to)) return NextResponse.json({ error: 'Enter a valid customer email address.' }, { status: 400 })

    const templateId = String(form.get('templateId') || '').trim()
    if (!templateId) return NextResponse.json({ error: 'Choose an email template.' }, { status: 400 })

    const salespersonName = String(form.get('salespersonName') || '').trim()
    const salespersonEmail = String(form.get('salespersonEmail') || '').trim()
    if (!isEmail(salespersonEmail)) return NextResponse.json({ error: 'Choose a salesperson (their email is used to send from and cc).' }, { status: 400 })

    // Build the branded PDF exactly as the download button does — but only if a
    // document was actually uploaded. A template can be sent on its own (just
    // its default attachments), without a quote/confirmation.
    const uploaded = form.get('file')
    const hasDoc = uploaded instanceof File && uploaded.size > 0
    let built: { bytes: Uint8Array; downloadName: string } | null = null
    if (hasDoc) {
      const result = await buildBrandedFromForm(form)
      if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 })
      built = result
    }

    // Load the selected template.
    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from('order_email_templates')
      .select('id, name, subject, body, attachment_ids, active')
      .eq('id', templateId)
      .single()
    if (tplErr || !tpl) return NextResponse.json({ error: 'That email template no longer exists.' }, { status: 400 })

    const fields = {
      customer_name: String(form.get('customerName') || '').trim(),
      order_number: String(form.get('orderNumber') || '').trim(),
      salesperson_name: salespersonName,
      doc_type: String(form.get('docLabel') || 'document').trim(),
      amount: String(form.get('amountText') || '').trim()
    }
    // Prefer the wording the salesperson edited on the page (customised per
    // send); fall back to the stored template. Either way fill any merge tags
    // that are still present.
    const rawSubject = form.has('subject') ? String(form.get('subject') || '') : tpl.subject
    const rawBody = form.has('body') ? String(form.get('body') || '') : tpl.body
    const subject = render(rawSubject, fields).trim() || `Your ${fields.doc_type} from BoConcept`
    const text = render(rawBody, fields)

    // The branded PDF (if a doc was uploaded) first, then the template's own
    // default attachments from the library.
    const tplAttIds = Array.isArray(tpl.attachment_ids) ? tpl.attachment_ids.map(String) : []
    const tplFiles = await attachmentFilesForEmail(tplAttIds)
    const attachments = [
      ...(built ? [{ filename: built.downloadName, content: built.bytes, contentType: 'application/pdf' }] : []),
      ...tplFiles.map((f) => ({ filename: f.filename, content: f.content, contentType: 'application/pdf' }))
    ]

    // Make the email appear to come from the salesperson. Resend can only send
    // from the verified domain, so: if the salesperson's address is on that
    // domain, send straight from it; otherwise send from the store address but
    // carry the salesperson's name, and reply-to them. Either way cc them.
    const storeFrom = brandConfig('bca').emailFrom
    const storeAddress = addressOf(storeFrom)
    const verifiedDomain = domainOf(storeFrom)
    const from = salespersonEmail && domainOf(salespersonEmail) === verifiedDomain
      ? (salespersonName ? `${salespersonName} <${salespersonEmail}>` : salespersonEmail)
      : (salespersonName ? `${salespersonName} <${storeAddress}>` : storeFrom)

    await sendEmail({
      to,
      from,
      replyTo: salespersonEmail,
      cc: salespersonEmail,
      subject,
      text,
      attachments
    })

    return NextResponse.json({ ok: true, to, cc: salespersonEmail })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not send the email.' }, { status: 500 })
  }
}
