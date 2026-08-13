'use client'

import { useEffect, useMemo, useState } from 'react'
import BrandLogos from '@/components/BrandLogos'
import PortalNav from '@/components/PortalNav'
import { Button, tokens, label, input, field, cardStyle as card, sectionTitleStyle as sectionTitle, pageTitle, pageIntro, IconFile, IconPaperclip, IconMail, IconReset, IconCheck, IconGrip } from '@/components/ui'

// Order Tools — a workspace for turning a sales order / quotation into a
// branded, actionable document: take payment (Stripe link by SMS/email/copy),
// and (in coming updates) stamp the BoConcept logo, auto-read the customer
// details, embed a Pay Now / Confirm Order button, attach common PDFs, flip a
// quote to a Tax Invoice, and send for DocuSign signature.
//
// This first cut ships the payment actions (reusing the live payment-link
// plumbing) plus the document upload shell. The upload currently just holds the
// file; PDF reading + branding land next, once the parser is tuned to a real
// order/quote sample.

type Salesperson = { id: string; code: string; name: string | null; email: string | null; exclude_from_payment_app?: boolean }
type DocType = 'order' | 'quote' | 'invoice'
type Attachment = { id: string; name: string; mode: 'always' | 'optional'; active: boolean }
type EmailTemplate = { id: string; name: string; subject: string; body: string; attachment_ids: string[]; active: boolean }

const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(n || 0))

// Normalise a name for comparison: lowercase, punctuation → space, collapse.
const normName = (s: unknown) => String(s || '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()

// Match the document's "Our ref." salesperson to a record in the list, tolerant
// of small differences (punctuation, spacing, middle names, order).
function matchSalesperson(parsed: string | null | undefined, list: Salesperson[]): Salesperson | null {
  const p = normName(parsed)
  if (!p) return null
  const cands = list.filter((s) => (s.name || '').trim())
  const exact = cands.find((s) => normName(s.name) === p)
  if (exact) return exact
  const contains = cands.find((s) => { const n = normName(s.name); return n && (n.includes(p) || p.includes(n)) })
  if (contains) return contains
  const pt = p.split(' ').filter(Boolean)
  // All of the document's name tokens appear in the record's name (or vice versa).
  const tokenSubset = cands.find((s) => { const nt = normName(s.name).split(' ').filter(Boolean); return pt.length > 0 && pt.every((t) => nt.includes(t)) })
    || cands.find((s) => { const nt = normName(s.name).split(' ').filter(Boolean); return nt.length > 0 && nt.every((t) => pt.includes(t)) })
  if (tokenSubset) return tokenSubset
  // First + last name match (handles a middle name on either side).
  if (pt.length >= 2) {
    const first = pt[0], last = pt[pt.length - 1]
    const fl = cands.find((s) => { const nt = normName(s.name).split(' ').filter(Boolean); return nt.length >= 2 && nt[0] === first && nt[nt.length - 1] === last })
    if (fl) return fl
  }
  return null
}

export default function OrderToolsPage() {
  const [docType, setDocType] = useState<DocType>('order')
  const [file, setFile] = useState<File | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [readMsg, setReadMsg] = useState('')
  const [building, setBuilding] = useState(false)

  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [amount, setAmount] = useState('')

  const [salespeople, setSalespeople] = useState<Salesperson[]>([])
  const [salespersonId, setSalespersonId] = useState('')
  const [salespersonName, setSalespersonName] = useState('')
  const [salespersonEmail, setSalespersonEmail] = useState('')

  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [selectedAtt, setSelectedAtt] = useState<Record<string, boolean>>({})
  const [extraFiles, setExtraFiles] = useState<File[]>([])
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropActive, setDropActive] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; deliveryStatus: string | null } | null>(null)

  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([])
  const [emailTemplateId, setEmailTemplateId] = useState('')
  const [emailSubject, setEmailSubject] = useState('')
  const [emailBody, setEmailBody] = useState('')
  const [emailing, setEmailing] = useState(false)
  const [emailMsg, setEmailMsg] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)

  // Picking a template loads its wording into the editable fields — with the
  // merge fields already filled in from what we've read (customer + salesperson
  // names, etc.) — so staff see real text and can customise it per send.
  function fillMergeFields(text: string) {
    const f: Record<string, string> = {
      customer_name: customerName.trim(),
      order_number: orderNumber.trim().toUpperCase(),
      salesperson_name: salespersonName.trim(),
      doc_type: docLabel,
      amount: amountValid ? money(Number(amount)) : ''
    }
    // Only substitute a field we actually have a value for; leave an unknown
    // one as its {tag} so it still fills in on send if you enter it afterwards.
    return String(text || '').replace(/\{(\w+)\}/g, (whole, key) => (f[key] ? f[key] : whole))
  }

  function pickEmailTemplate(id: string) {
    setEmailTemplateId(id)
    setEmailMsg('')
    const t = emailTemplates.find((x) => x.id === id)
    setEmailSubject(t ? fillMergeFields(t.subject) : '')
    setEmailBody(t ? fillMergeFields(t.body) : '')
  }

  async function loadSalespeople() {
    try {
      const res = await fetch('/api/salespeople', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) setSalespeople(json.salespeople || [])
    } catch { /* ignore */ }
  }

  async function loadAttachments() {
    try {
      const res = await fetch('/api/order-attachments', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) {
        const active = (json.attachments || []).filter((a: Attachment) => a.active)
        setAttachments(active)
        // Pre-tick the "always" (standard) docs; staff can untick per document.
        setSelectedAtt((prev) => {
          const next = { ...prev }
          for (const a of active) if (a.mode === 'always' && next[a.id] === undefined) next[a.id] = true
          return next
        })
      }
    } catch { /* ignore */ }
  }

  async function loadEmailTemplates() {
    try {
      const res = await fetch('/api/order-email-templates', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) setEmailTemplates((json.templates || []).filter((t: EmailTemplate) => t.active))
    } catch { /* ignore */ }
  }

  useEffect(() => {
    document.title = 'BoConcept Order Tools'
    loadSalespeople()
    loadAttachments()
    loadEmailTemplates()
  }, [])

  const alwaysDocs = attachments.filter((a) => a.mode === 'always')
  const optionalDocs = attachments.filter((a) => a.mode === 'optional')

  function pickSalesperson(id: string) {
    setSalespersonId(id)
    const sp = salespeople.find((s) => s.id === id)
    if (sp) {
      setSalespersonName(sp.name || '')
      setSalespersonEmail(sp.email || '')
    }
  }

  async function onFile(picked: File | null) {
    if (!picked) return
    setFile(picked)
    setFileName(picked.name)
    setResult(null)
    // Read the document and auto-fill the customer + amount fields.
    setReading(true)
    setReadMsg('')
    try {
      const fd = new FormData()
      fd.append('file', picked)
      const res = await fetch('/api/order-tools/read', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not read the PDF.')
      const p = json.parsed || {}
      if (json.docType === 'quote' || json.docType === 'order') setDocType(json.docType)
      if (p.name) setCustomerName(p.name)
      if (p.email) setCustomerEmail(p.email)
      if (p.phone) setCustomerPhone(p.phone)
      if (p.orderNumber) setOrderNumber(p.orderNumber)
      if (p.amount != null) setAmount(String(p.amount))
      let spMsg = ''
      if (p.salesperson) {
        const sp = matchSalesperson(p.salesperson, salespeople)
        if (sp) { pickSalesperson(sp.id); spMsg = ` Salesperson set to ${sp.name}.` }
        else spMsg = ` Couldn’t match salesperson “${p.salesperson}” — please pick one below.`
      }
      const found = ['name', 'email', 'phone', 'orderNumber', 'amount'].filter((k) => p[k] != null).length
      const head = found ? `Read the document — auto-filled ${found} field${found === 1 ? '' : 's'}.` : 'Uploaded, but couldn’t read the details automatically — enter them below.'
      setReadMsg(`${head}${spMsg}${found ? ' Please check them.' : ''}`)
    } catch (e) {
      setReadMsg(e instanceof Error ? e.message : 'Could not read the PDF.')
    } finally {
      setReading(false)
    }
  }

  async function downloadBranded() {
    if (!file) return setError('Upload a PDF first.')
    setError('')
    setBuilding(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('heading', docType === 'invoice' ? 'Tax Invoice' : docType === 'quote' ? 'Quotation' : 'Confirmation')
      fd.append('payNowUrl', result?.url || '')
      fd.append('payNowLabel', primaryAction)
      fd.append('amount', amount || '')
      fd.append('attachmentIds', JSON.stringify(attachments.filter((a) => selectedAtt[a.id]).map((a) => a.id)))
      extraFiles.forEach((f) => fd.append('extraFiles', f))
      const base = orderNumber.trim() ? `${docLabel} ${orderNumber.trim().toUpperCase()}` : `BoConcept ${docLabel}`
      fd.append('filename', `${base}.pdf`)
      const res = await fetch('/api/order-tools/build', { method: 'POST', body: fd })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || 'Could not build the PDF.')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${base}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not build the PDF.')
    } finally {
      setBuilding(false)
    }
  }

  const docLabel = docType === 'invoice' ? 'Tax Invoice' : docType === 'quote' ? 'Quotation' : 'Sales Order'

  // Builds the same branded PDF as the download, but posts it to the email route
  // so it's sent to the customer as an attachment — from the salesperson, cc'ing
  // them, using the chosen template's wording and default attachments.
  // Validate, then open the styled confirmation modal (the send goes out to a
  // real customer immediately, so we confirm first).
  function emailToCustomer() {
    if (emailing) return
    if (!isEmail(customerEmail.trim())) return setEmailMsg('Enter a valid customer email.')
    if (!salespersonEmail.trim() || !isEmail(salespersonEmail.trim())) return setEmailMsg('Choose a salesperson first.')
    if (!emailTemplateId) return setEmailMsg('Choose an email template.')
    setEmailMsg('')
    setConfirmOpen(true)
  }

  async function sendEmailNow() {
    setConfirmOpen(false)
    setEmailMsg('')
    setEmailing(true)
    try {
      const fd = new FormData()
      // The document is optional — a template can be sent on its own.
      if (file) fd.append('file', file)
      fd.append('heading', docType === 'invoice' ? 'Tax Invoice' : docType === 'quote' ? 'Quotation' : 'Confirmation')
      fd.append('payNowUrl', result?.url || '')
      fd.append('payNowLabel', primaryAction)
      fd.append('amount', amount || '')
      fd.append('attachmentIds', JSON.stringify(attachments.filter((a) => selectedAtt[a.id]).map((a) => a.id)))
      extraFiles.forEach((f) => fd.append('extraFiles', f))
      const base = orderNumber.trim() ? `${docLabel} ${orderNumber.trim().toUpperCase()}` : `BoConcept ${docLabel}`
      fd.append('filename', `${base}.pdf`)
      // Fields for the email itself + merge tags.
      fd.append('customerEmail', customerEmail.trim())
      fd.append('customerName', customerName.trim())
      fd.append('orderNumber', orderNumber.trim().toUpperCase())
      fd.append('salespersonName', salespersonName.trim())
      fd.append('salespersonEmail', salespersonEmail.trim())
      fd.append('docLabel', docLabel)
      fd.append('amountText', amountValid ? money(Number(amount)) : '')
      fd.append('templateId', emailTemplateId)
      fd.append('subject', emailSubject)
      fd.append('body', emailBody)
      const res = await fetch('/api/order-tools/email', { method: 'POST', body: fd })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not send the email.')
      setEmailMsg(`✓ Sent to ${customerEmail.trim()} — you’re cc’d at ${salespersonEmail.trim()}.`)
    } catch (e) {
      setEmailMsg(e instanceof Error ? e.message : 'Could not send the email.')
    } finally {
      setEmailing(false)
    }
  }

  const amountValid = useMemo(() => {
    const n = Number(amount)
    return Number.isFinite(n) && n > 0
  }, [amount])

  const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)

  async function createLink() {
    setError('')
    setResult(null)
    if (!customerName.trim()) return setError('Enter the customer name.')
    if (!orderNumber.trim()) return setError('Enter the order / quote number.')
    if (!amountValid) return setError('Enter an amount greater than zero.')
    if (!salespersonEmail.trim() || !isEmail(salespersonEmail.trim())) return setError('Choose a salesperson (return email for payment confirmation).')

    setSubmitting(true)
    try {
      const res = await fetch('/api/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: customerName.trim(),
          orderNumber: orderNumber.trim(),
          amount: Number(amount),
          salespersonName: salespersonName.trim(),
          salespersonEmail: salespersonEmail.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          deliveryMethod: 'link'
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not create the payment link.')
      setResult({ url: json.url, deliveryStatus: json.deliveryStatus })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the payment link.')
    } finally {
      setSubmitting(false)
    }
  }

  const primaryAction = docType === 'quote' ? 'Confirm Now' : 'Pay Now'

  function resetAll() {
    setFile(null); setFileName(''); setReading(false); setReadMsg('')
    setDocType('order')
    setCustomerName(''); setCustomerEmail(''); setCustomerPhone(''); setOrderNumber(''); setAmount('')
    setSalespersonId(''); setSalespersonName(''); setSalespersonEmail('')
    setResult(null); setError(''); setBuilding(false)
    setEmailTemplateId(''); setEmailSubject(''); setEmailBody(''); setEmailMsg(''); setEmailing(false)
    setExtraFiles([]); setDragIdx(null)
    // Re-pre-tick the standard (always) docs.
    setSelectedAtt(Object.fromEntries(alwaysDocs.map((a) => [a.id, true])))
  }

  function moveExtra(from: number, to: number) {
    setExtraFiles((list) => {
      if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list
      const next = list.slice()
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const seg = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '9px 0', textAlign: 'center', fontSize: 14, fontWeight: 600, cursor: 'pointer',
    borderRadius: 8, border: '1px solid ' + (active ? '#1a1a1a' : '#d3ccbe'),
    background: active ? '#1a1a1a' : '#fff', color: active ? '#fff' : '#4a4a4a',
    fontFamily: 'inherit', appearance: 'none', minHeight: 0, lineHeight: 1.2
  })

  return (
    <div style={{ minHeight: '100vh', background: '#f4f3f1', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#1a1a1a' }}>
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '40px 20px 80px' }}>
        <header style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ marginBottom: 18 }}><BrandLogos height={26} /></div>
          <PortalNav active="order-tools" />
          <h1 style={pageTitle}>Order Tools</h1>
          <p style={{ ...pageIntro, maxWidth: 620, marginLeft: 'auto', marginRight: 'auto' }}>
            Prepare and send branded orders, quotations and tax invoices — take payment, attach documents, and email your customer. Upload a document to auto-read the details, or send a template on its own.
          </p>
        </header>

        {/* Two columns on desktop; stacks to one on narrow screens */}
        <div style={{ display: 'grid', gap: 22, gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>

          {/* LEFT — build the document */}
          <div style={{ display: 'grid', gap: 22 }}>

            {/* Upload */}
            <div style={card}>
              <div style={sectionTitle}>1 · The document</div>
              <label
                style={{
                  display: 'block', border: '2px dashed #cfcdc9', borderRadius: 12, padding: '28px 16px',
                  textAlign: 'center', cursor: 'pointer', background: '#faf9f7'
                }}
              >
                <input type="file" accept="application/pdf" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0] || null)} />
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {fileName ? <><IconFile size={17} />{fileName}</> : 'Upload confirmation / quotation (PDF)'}
                </div>
                <div style={{ fontSize: 12.5, color: '#6f6a61', marginTop: 6 }}>
                  {reading
                    ? 'Reading the document…'
                    : readMsg
                      ? readMsg
                      : 'Click to choose a PDF — we’ll read the customer details automatically. Optional: you can email a template without one.'}
                </div>
              </label>

              <div style={{ ...field, marginTop: 18, marginBottom: 0 }}>
                <label style={label} id="doctype-label">This document is a</label>
                <div role="group" aria-labelledby="doctype-label" style={{ display: 'flex', gap: 10 }}>
                  <button type="button" aria-pressed={docType === 'order'} style={seg(docType === 'order')} onClick={() => setDocType('order')}>Sales Order</button>
                  <button type="button" aria-pressed={docType === 'quote'} style={seg(docType === 'quote')} onClick={() => setDocType('quote')}>Quotation</button>
                  <button type="button" aria-pressed={docType === 'invoice'} style={seg(docType === 'invoice')} onClick={() => setDocType('invoice')}>Tax Invoice</button>
                </div>
              </div>
            </div>

            {/* Attachments stitched into the branded PDF */}
            <div style={card}>
              <div style={sectionTitle}>2 · Attachments</div>

              {(alwaysDocs.length > 0 || optionalDocs.length > 0) && (
                <div style={{ margin: '0 0 14px' }}>
                  <label style={{ ...label, marginBottom: 8 }}>Standard documents <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>— untick any you don’t want</span></label>
                  {alwaysDocs.map((a) => (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#3a3a3a', marginBottom: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!selectedAtt[a.id]} onChange={(e) => setSelectedAtt((s) => ({ ...s, [a.id]: e.target.checked }))} />
                      {a.name} <span style={{ fontSize: 11.5, fontWeight: 600, color: '#6f6a61' }}>· standard</span>
                    </label>
                  ))}
                  {optionalDocs.map((a) => (
                    <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#3a3a3a', marginBottom: 6, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!selectedAtt[a.id]} onChange={(e) => setSelectedAtt((s) => ({ ...s, [a.id]: e.target.checked }))} />
                      {a.name}
                    </label>
                  ))}
                </div>
              )}

              {/* Ad-hoc uploads by the salesperson — always stitched last */}
              <div style={{ margin: 0 }}>
                <label style={{ ...label, marginBottom: 8 }}>Your own documents (added at the end)</label>
                {extraFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${f.lastModified}-${i}`}
                    draggable
                    onDragStart={() => setDragIdx(i)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) moveExtra(dragIdx, i); setDragIdx(null) }}
                    onDragEnd={() => setDragIdx(null)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#3a3a3a', marginBottom: 6, padding: '6px 8px', borderRadius: 8, border: '1px solid #ecebe7', background: dragIdx === i ? '#f1efe9' : '#fff', cursor: 'grab' }}
                  >
                    <span style={{ color: '#b7b3ab', lineHeight: 1, cursor: 'grab', display: 'inline-flex' }} title="Drag to reorder"><IconGrip size={15} /></span>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 7 }}><IconPaperclip size={14} style={{ color: '#8f887b' }} />{f.name}</span>
                    <button type="button" onClick={() => setExtraFiles((list) => list.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#b3261e', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, minHeight: 0 }}>Remove</button>
                  </div>
                ))}
                <label
                  onDragOver={(e) => { e.preventDefault(); if (!dropActive) setDropActive(true) }}
                  onDragEnter={(e) => { e.preventDefault(); setDropActive(true) }}
                  onDragLeave={(e) => { if (e.currentTarget === e.target) setDropActive(false) }}
                  onDrop={(e) => {
                    e.preventDefault(); setDropActive(false)
                    const dropped = Array.from(e.dataTransfer?.files || []).filter((f) => /application\/pdf|image\/(png|jpeg)/i.test(f.type) || /\.(pdf|png|jpe?g)$/i.test(f.name))
                    if (dropped.length) setExtraFiles((list) => [...list, ...dropped])
                  }}
                  style={{ display: 'block', border: `2px dashed ${dropActive ? '#7c632e' : '#cfcdc9'}`, borderRadius: 10, padding: '18px 14px', textAlign: 'center', cursor: 'pointer', background: dropActive ? '#faf7f0' : '#faf9f7' }}
                >
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    multiple
                    style={{ display: 'none' }}
                    onChange={(e) => { const picked = Array.from(e.target.files || []); if (picked.length) setExtraFiles((list) => [...list, ...picked]); e.target.value = '' }}
                  />
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1a1a1a' }}>+ Add document{extraFiles.length ? 's' : ''} <span style={{ color: '#6f6a61', fontWeight: 400 }}>or drag &amp; drop here</span></div>
                  <div style={{ fontSize: 12, color: '#6f6a61', marginTop: 4 }}>PDF or image (JPG/PNG){extraFiles.length > 1 ? ' · drag rows to reorder' : ''}</div>
                </label>
              </div>
            </div>

          </div>

          {/* RIGHT — customer details & actions */}
          <div style={{ display: 'grid', gap: 22 }}>

            {/* Customer details + payment + download */}
            <div style={card}>
              <div style={sectionTitle}>3 · Customer &amp; payment</div>

              <div style={field}>
                <label style={label} htmlFor="ot-cname">Customer name</label>
                <input id="ot-cname" style={input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Jane Smith" />
              </div>

              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ ...field, flex: 1 }}>
                  <label style={label} htmlFor="ot-cemail">Customer email</label>
                  <input id="ot-cemail" style={input} value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} type="email" placeholder="jane@example.com" />
                </div>
                <div style={{ ...field, flex: 1 }}>
                  <label style={label} htmlFor="ot-cphone">Customer mobile</label>
                  <input id="ot-cphone" style={input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" placeholder="04xx xxx xxx" />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 14 }}>
                <div style={{ ...field, flex: 1 }}>
                  <label style={label} htmlFor="ot-ordernum">{docType === 'quote' ? 'Quote #' : docType === 'invoice' ? 'Invoice #' : 'Order #'}</label>
                  <input id="ot-ordernum" style={input} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="e.g. OS-005133" />
                </div>
                <div style={{ ...field, flex: 1 }}>
                  <label style={label} htmlFor="ot-amount">Amount (AUD)</label>
                  <input id="ot-amount" style={{ ...input, borderColor: amount.trim() && !amountValid ? '#b3261e' : '#d3ccbe' }} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" aria-invalid={!!(amount.trim() && !amountValid)} />
                  {amount.trim() && !amountValid && <div style={{ fontSize: 11.5, color: '#b3261e', marginTop: 4 }}>Enter a number greater than zero.</div>}
                </div>
              </div>

              <div style={field}>
                <label style={label} htmlFor="ot-salesperson">Salesperson (return email for confirmation)</label>
                <select id="ot-salesperson" style={input} value={salespersonId} onChange={(e) => pickSalesperson(e.target.value)}>
                  <option value="">— Choose salesperson —</option>
                  {salespeople.filter((s) => (s.name || '').trim() && !s.exclude_from_payment_app).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.email ? ` (${s.email})` : ''}</option>
                  ))}
                </select>
              </div>

              {error && <div style={{ background: '#fdecea', color: '#b3261e', padding: '10px 13px', borderRadius: 8, fontSize: 14, marginBottom: 16 }}>{error}</div>}

              {/* Optional step — a calm, secondary (stone) button */}
              <Button type="button" variant="secondary" onClick={createLink} disabled={submitting}>
                {submitting ? 'Adding…' : 'Add Payment Link'}
              </Button>
              {result?.url ? (
                <div style={{ marginTop: 14, background: '#faf7f0', border: '1px solid #e7dfcd', borderRadius: 12, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 11 }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#7c632e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}><IconCheck size={13} /></div>
                  <div style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: '#5f4e22' }}>Payment link added — it’ll be embedded in the branded PDF.</div>
                  <button type="button" onClick={() => setResult(null)} title="Remove the payment link" style={{ background: 'none', border: 'none', color: '#8a6d3b', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0, minHeight: 0, whiteSpace: 'nowrap' }}>Remove</button>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: '#6f6a61', textAlign: 'center', marginTop: 9 }}>Optional — embeds a Pay Now button. Links valid 7 days.</div>
              )}

              <div style={{ height: 1, background: '#eeece7', margin: '20px 0' }} />

              {/* Primary deliverable — the hero button */}
              <Button type="button" variant="hero" onClick={downloadBranded} disabled={building || !file}>
                {building ? 'Preparing…' : file ? 'Download branded PDF' : 'Upload a PDF to brand it'}
              </Button>
            </div>

            {/* Email the branded PDF to the customer, from the salesperson */}
            <div style={card}>
              <div style={sectionTitle}>4 · Email to customer</div>
              <p style={{ fontSize: 12.5, color: '#6f6a61', margin: '0 0 12px' }}>
                Sends from the salesperson, cc’ing them for the record. If you’ve uploaded a document it’s attached as a branded PDF; otherwise the template is sent on its own with its default attachments.
              </p>
              <div style={field}>
                <select style={input} value={emailTemplateId} onChange={(e) => pickEmailTemplate(e.target.value)}>
                  <option value="">— Choose email template —</option>
                  {emailTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              {emailTemplateId && (() => {
                const t = emailTemplates.find((x) => x.id === emailTemplateId)
                const names = (t?.attachment_ids || []).map((id) => attachments.find((a) => a.id === id)?.name).filter(Boolean) as string[]
                return (
                  <div style={{ fontSize: 12.5, color: '#6b6b6b', margin: '-6px 0 14px', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                    <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}><IconPaperclip size={13} />Attaches:</span>
                    <span>{[file ? 'branded document' : null, ...names].filter(Boolean).join(', ') || 'nothing yet'}</span>
                  </div>
                )
              })()}
              {emailTemplateId && (
                <>
                  <div style={field}>
                    <label style={label} htmlFor="ot-subject">Subject</label>
                    <input id="ot-subject" style={input} value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} placeholder="Email subject" />
                  </div>
                  <div style={field}>
                    <label style={label} htmlFor="ot-body">Message <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#6f6a61' }}>— edit before sending</span></label>
                    <textarea id="ot-body" style={{ ...input, minHeight: 150, resize: 'vertical', lineHeight: 1.5 }} value={emailBody} onChange={(e) => setEmailBody(e.target.value)} placeholder="Email message" />
                    <div style={{ fontSize: 11.5, color: '#6f6a61', marginTop: 6 }}>
                      The customer &amp; salesperson names are already filled in — edit the wording as you like before sending.
                    </div>
                  </div>
                </>
              )}
              <Button type="button" variant="brass" onClick={emailToCustomer} disabled={emailing || !emailTemplateId} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {emailing ? 'Sending…' : <><IconMail size={16} />Email to customer</>}
              </Button>
              {emailMsg && (
                <div style={{ marginTop: 12, fontSize: 13.5, fontWeight: 600, color: emailMsg.startsWith('✓') ? '#3f6b46' : '#b3261e', textAlign: 'center' }}>{emailMsg}</div>
              )}
              {emailTemplates.length === 0 && (
                <div style={{ marginTop: 10, fontSize: 12.5, color: '#6f6a61', textAlign: 'center' }}>No templates yet — an admin can add them in the Admin panel.</div>
              )}
            </div>

          </div>

        </div>

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <button type="button" onClick={resetAll} style={{ background: 'none', border: 'none', color: '#6f6a61', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 12px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 7 }}><IconReset size={14} />Start over</button>
        </div>
      </div>

      {confirmOpen && (() => {
        const t = emailTemplates.find((x) => x.id === emailTemplateId)
        const names = (t?.attachment_ids || []).map((id) => attachments.find((a) => a.id === id)?.name).filter(Boolean) as string[]
        const atts = [file ? 'Branded document (PDF)' : null, ...names].filter(Boolean) as string[]
        return (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="send-confirm-title"
            onClick={() => setConfirmOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(20,20,22,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          >
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 26, width: '100%', maxWidth: 440, boxShadow: '0 24px 70px rgba(0,0,0,.32)' }}>
              <h2 id="send-confirm-title" style={{ fontSize: 19, fontWeight: 650, margin: '0 0 4px' }}>Send this email?</h2>
              <p style={{ fontSize: 13.5, color: '#6f6a61', margin: '0 0 18px' }}>It will be sent to your customer straight away.</p>
              <div style={{ display: 'grid', gap: 10, fontSize: 14, marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#8f887b', minWidth: 52 }}>To</span><span style={{ fontWeight: 600 }}>{customerEmail.trim()}</span></div>
                <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#8f887b', minWidth: 52 }}>Cc</span><span style={{ fontWeight: 600 }}>{salespersonEmail.trim()} <span style={{ fontWeight: 400, color: '#8f887b' }}>· you, for the record</span></span></div>
                <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#8f887b', minWidth: 52 }}>From</span><span style={{ fontWeight: 600 }}>{salespersonName.trim() || 'Salesperson'}</span></div>
                <div style={{ display: 'flex', gap: 10 }}><span style={{ color: '#8f887b', minWidth: 52 }}>Attach</span><span>{atts.length ? atts.join(', ') : 'Nothing attached'}</span></div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" onClick={() => setConfirmOpen(false)} style={{ flex: 1, padding: '12px 0', borderRadius: tokens.radius.control, border: `1px solid ${tokens.color.line}`, background: '#fff', color: tokens.color.ink, fontSize: 15, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                <Button type="button" variant="brassSolid" onClick={sendEmailNow} style={{ flex: 1.4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}><IconMail size={16} />Send email</Button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
