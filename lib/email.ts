// Transactional email sender. Pick whichever provider is easiest to set up —
// it auto-selects based on which env var you provide. No Microsoft 365 admin
// work needed for SendGrid/Resend; just an API key and a verified sender.
//
//   EMAIL_FROM           - sender, e.g. "BoConcept Delivery <delivery@boconcept.com.au>"
//   SENDGRID_API_KEY     - SendGrid (simplest: verify one sender, no DNS)
//   RESEND_API_KEY       - Resend (verify a domain, or use the test domain)
//   MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET - Microsoft 365 Graph (advanced)

import nodemailer from 'nodemailer'

export type EmailAttachment = { filename: string; content: Uint8Array; contentType?: string }
type Sent = { from: string; to: string; subject: string; text: string; replyTo?: string; cc?: string; attachments?: EmailAttachment[] }

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')

async function sendViaSmtp(m: Sent) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  })
  await transporter.sendMail({
    from: m.from, to: m.to, subject: m.subject, text: m.text, replyTo: m.replyTo, cc: m.cc,
    attachments: m.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content), contentType: a.contentType }))
  })
}

function parseFrom(raw: string) {
  const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/)
  if (match) return { name: match[1] || '', email: match[2] }
  return { name: '', email: raw.trim() }
}

async function sendViaSendGrid(m: Sent) {
  const { name, email } = parseFrom(m.from)
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: m.to }], ...(m.cc ? { cc: [{ email: m.cc }] } : {}) }],
      from: name ? { email, name } : { email },
      ...(m.replyTo ? { reply_to: { email: m.replyTo } } : {}),
      subject: m.subject,
      content: [{ type: 'text/plain', value: m.text }],
      ...(m.attachments?.length ? { attachments: m.attachments.map((a) => ({ content: b64(a.content), filename: a.filename, type: a.contentType || 'application/pdf', disposition: 'attachment' })) } : {})
    })
  })
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || `SendGrid HTTP ${response.status}`)
}

async function sendViaResend(m: Sent) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: m.from, to: m.to, subject: m.subject, text: m.text,
      ...(m.replyTo ? { reply_to: m.replyTo } : {}),
      ...(m.cc ? { cc: m.cc } : {}),
      ...(m.attachments?.length ? { attachments: m.attachments.map((a) => ({ filename: a.filename, content: b64(a.content) })) } : {})
    })
  })
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || `Resend HTTP ${response.status}`)
}

async function sendViaGraph(m: Sent) {
  const tenant = process.env.MS_TENANT_ID, clientId = process.env.MS_CLIENT_ID, clientSecret = process.env.MS_CLIENT_SECRET
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId || '', client_secret: clientSecret || '', grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' })
  })
  const tokenJson = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok || !tokenJson.access_token) throw new Error(tokenJson.error_description || 'Could not obtain Graph token')
  const { email } = parseFrom(m.from)
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        subject: m.subject,
        body: { contentType: 'Text', content: m.text },
        toRecipients: [{ emailAddress: { address: m.to } }],
        ...(m.cc ? { ccRecipients: [{ emailAddress: { address: m.cc } }] } : {}),
        ...(m.replyTo ? { replyTo: [{ emailAddress: { address: m.replyTo } }] } : {}),
        ...(m.attachments?.length ? { attachments: m.attachments.map((a) => ({ '@odata.type': '#microsoft.graph.fileAttachment', name: a.filename, contentType: a.contentType || 'application/pdf', contentBytes: b64(a.content) })) } : {})
      },
      saveToSentItems: true
    })
  })
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || `Graph HTTP ${response.status}`)
}

export async function sendEmail(options: { to: string; subject: string; text: string; from?: string; replyTo?: string; cc?: string; attachments?: EmailAttachment[] }) {
  const from = options.from || process.env.EMAIL_FROM || process.env.SMTP_USER
  if (!from) throw new Error('Missing EMAIL_FROM')
  const m: Sent = { from, to: options.to, subject: options.subject, text: options.text, replyTo: options.replyTo, cc: options.cc, attachments: options.attachments }
  if (process.env.SENDGRID_API_KEY) return sendViaSendGrid(m)
  if (process.env.RESEND_API_KEY) return sendViaResend(m)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return sendViaSmtp(m)
  if (process.env.MS_CLIENT_ID) return sendViaGraph(m)
  throw new Error('No email provider configured (set SENDGRID_API_KEY, RESEND_API_KEY, SMTP_USER/SMTP_PASS, or Microsoft 365 vars)')
}
