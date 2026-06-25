// Transactional email sender. Pick whichever provider is easiest to set up —
// it auto-selects based on which env var you provide. No Microsoft 365 admin
// work needed for SendGrid/Resend; just an API key and a verified sender.
//
//   EMAIL_FROM           - sender, e.g. "BoConcept Delivery <delivery@boconcept.com.au>"
//   SENDGRID_API_KEY     - SendGrid (simplest: verify one sender, no DNS)
//   RESEND_API_KEY       - Resend (verify a domain, or use the test domain)
//   MS_TENANT_ID/MS_CLIENT_ID/MS_CLIENT_SECRET - Microsoft 365 Graph (advanced)

import nodemailer from 'nodemailer'

async function sendViaSmtp(from: string, to: string, subject: string, text: string) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  })
  await transporter.sendMail({ from, to, subject, text })
}

function parseFrom(raw: string) {
  const match = raw.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/)
  if (match) return { name: match[1] || '', email: match[2] }
  return { name: '', email: raw.trim() }
}

async function sendViaSendGrid(from: string, to: string, subject: string, text: string) {
  const { name, email } = parseFrom(from)
  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: name ? { email, name } : { email },
      subject,
      content: [{ type: 'text/plain', value: text }]
    })
  })
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || `SendGrid HTTP ${response.status}`)
}

async function sendViaResend(from: string, to: string, subject: string, text: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text })
  })
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || `Resend HTTP ${response.status}`)
}

async function sendViaGraph(from: string, to: string, subject: string, text: string) {
  const tenant = process.env.MS_TENANT_ID, clientId = process.env.MS_CLIENT_ID, clientSecret = process.env.MS_CLIENT_SECRET
  const tokenRes = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId || '', client_secret: clientSecret || '', grant_type: 'client_credentials', scope: 'https://graph.microsoft.com/.default' })
  })
  const tokenJson = await tokenRes.json().catch(() => ({}))
  if (!tokenRes.ok || !tokenJson.access_token) throw new Error(tokenJson.error_description || 'Could not obtain Graph token')
  const { email } = parseFrom(from)
  const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(email)}/sendMail`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenJson.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { subject, body: { contentType: 'Text', content: text }, toRecipients: [{ emailAddress: { address: to } }] }, saveToSentItems: true })
  })
  if (!response.ok) throw new Error((await response.text().catch(() => '')) || `Graph HTTP ${response.status}`)
}

export async function sendEmail(options: { to: string; subject: string; text: string }) {
  const from = process.env.EMAIL_FROM || process.env.SMTP_USER
  if (!from) throw new Error('Missing EMAIL_FROM')
  const { to, subject, text } = options
  if (process.env.SENDGRID_API_KEY) return sendViaSendGrid(from, to, subject, text)
  if (process.env.RESEND_API_KEY) return sendViaResend(from, to, subject, text)
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return sendViaSmtp(from, to, subject, text)
  if (process.env.MS_CLIENT_ID) return sendViaGraph(from, to, subject, text)
  throw new Error('No email provider configured (set SENDGRID_API_KEY, RESEND_API_KEY, SMTP_USER/SMTP_PASS, or Microsoft 365 vars)')
}
