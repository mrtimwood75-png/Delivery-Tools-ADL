'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import BrandLogos from '@/components/BrandLogos'

type Template = { id: string; name: string; template_text: string; audience: string; is_active: boolean; sort_order?: number | null; purpose?: string | null }

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [templateText, setTemplateText] = useState('')
  const [purpose, setPurpose] = useState('')
  const [status, setStatus] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  useEffect(() => { loadTemplates() }, [])

  async function loadTemplates() {
    const response = await fetch('/api/templates', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Could not load templates')
    setTemplates(result.templates || [])
  }

  function selectTemplate(id: string) {
    setSelectedId(id)
    const template = templates.find((item) => item.id === id)
    if (!template) return
    setName(template.name)
    setTemplateText(template.template_text)
    setPurpose(template.purpose || '')
  }

  function clearForm() {
    setSelectedId('')
    setName('')
    setTemplateText('')
    setPurpose('')
  }

  async function saveTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('Saving template...')
    const response = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedId || undefined, name, template_text: templateText, audience: 'Both', purpose: purpose || null })
    })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Template save failed')
    setStatus('Template saved.')
    await loadTemplates()
  }

  async function deleteTemplate() {
    if (!selectedId) return
    setStatus('Deleting template...')
    const response = await fetch(`/api/templates/${selectedId}`, { method: 'DELETE' })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Template delete failed')
    setStatus('Template deleted.')
    clearForm()
    await loadTemplates()
  }

  // Drag-and-drop reordering. We reorder the local list optimistically as the
  // user drags, then persist the final order on drop.
  function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return }
    const current = [...templates]
    const from = current.findIndex((item) => item.id === dragId)
    const to = current.findIndex((item) => item.id === targetId)
    if (from === -1 || to === -1) { setDragId(null); setOverId(null); return }
    const [moved] = current.splice(from, 1)
    current.splice(to, 0, moved)
    setTemplates(current)
    setDragId(null)
    setOverId(null)
    persistOrder(current.map((item) => item.id))
  }

  async function persistOrder(ids: string[]) {
    setStatus('Saving order...')
    const response = await fetch('/api/templates/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    })
    const result = await response.json()
    if (!response.ok) { setStatus(result.error || 'Could not save order'); return loadTemplates() }
    setStatus('Order saved.')
  }

  return (
    <main>
      <div className="card grid" style={{ maxWidth: 1000, margin: '0 auto', gap: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BrandLogos height={30} />
            <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.01em' }}>SMS Templates</h1>
          </div>
          <Link href="/admin" style={{ textDecoration: 'none' }}><button type="button" className="btn-secondary">← Back to Admin</button></Link>
        </div>

        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <section className="card grid" style={{ boxShadow: 'none' }}>
            <h2 style={{ margin: 0 }}>Saved templates</h2>
            {templates.length > 0 ? <p className="muted" style={{ margin: 0, fontSize: 12 }}>Drag the ⠿ handle to change the order they appear in.</p> : null}
            {templates.map((template) => (
              <div
                key={template.id}
                onDragOver={(event) => { event.preventDefault(); if (overId !== template.id) setOverId(template.id) }}
                onDrop={() => handleDrop(template.id)}
                style={{
                  display: 'flex', alignItems: 'stretch', gap: 0, borderRadius: 8, overflow: 'hidden',
                  border: overId === template.id && dragId && dragId !== template.id ? '2px dashed #555' : '2px solid transparent',
                  opacity: dragId === template.id ? 0.4 : 1
                }}
              >
                <span
                  draggable
                  onDragStart={() => setDragId(template.id)}
                  onDragEnd={() => { setDragId(null); setOverId(null) }}
                  title="Drag to reorder"
                  style={{ display: 'flex', alignItems: 'center', padding: '0 10px', cursor: 'grab', color: '#888', userSelect: 'none', background: '#1f1f1f' }}
                >⠿</span>
                <button type="button" onClick={() => selectTemplate(template.id)} style={{ textAlign: 'left', flex: 1, borderRadius: 0 }}>{template.name}{template.purpose === 'delivery_booking' ? ' 🚚' : template.purpose === 'delivery_confirmed_reply' ? ' ↩️🟢' : template.purpose === 'delivery_rejected_reply' ? ' ↩️🔴' : template.purpose === 'payment_received' ? ' 💳' : ''}</button>
              </div>
            ))}
            {templates.length === 0 ? <p className="muted" style={{ margin: 0 }}>No templates yet — create one on the right.</p> : null}
          </section>

          <form className="card grid" style={{ boxShadow: 'none' }} onSubmit={saveTemplate}>
            <h2 style={{ margin: 0 }}>{selectedId ? 'Edit template' : 'Add template'}</h2>
            <label>Template name<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
            <label>Template text<textarea value={templateText} onChange={(event) => setTemplateText(event.target.value)} required style={{ minHeight: 150 }} /></label>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              Templates are just the message text now. To make a template send or react automatically — on a delivery booking, a customer reply, a status change, a delivery date, or a Stripe payment — set up a rule under <strong>Admin → Automations</strong>, where you pick the trigger and choose this template as the action.
            </p>
            <p className="muted">Available fields: {'{merchant}'}, {'{merchant_showroom_phone}'}, {'{merchant_warehouse_phone}'}, {'{merchant_email}'}, {'{merchant_address}'}, {'{merchant_bank}'}, {'{merchant_bsb}'}, {'{merchant_account}'}, {'{customer_name}'}, {'{order_number}'}, {'{salesperson}'}, {'{mobile}'}, {'{balance_payable}'}, {'{payment_status}'}, {'{order_status}'}, {'{stripe_checkout_url}'}, {'{street_address}'}, {'{suburb}'}, {'{state}'}, {'{postcode}'}, {'{address}'}, {'{goods_in_date}'}, {'{ready_after_date}'}, {'{delivery_date}'}</p>
            <div className="grid grid-2"><button type="submit">Save Template</button><button type="button" onClick={clearForm}>New Template</button></div>
            {selectedId ? <button type="button" onClick={deleteTemplate}>Delete Template</button> : null}
          </form>
        </div>

        {status ? <p className="muted">{status}</p> : null}
      </div>
    </main>
  )
}
