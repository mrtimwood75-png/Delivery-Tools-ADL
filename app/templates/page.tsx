'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'

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
            <img src="/BoConcept-Logo.svg" alt="BoConcept" style={{ width: 150, display: 'block' }} />
            <h1 style={{ margin: 0, fontSize: 22, letterSpacing: '-0.01em' }}>SMS Templates</h1>
          </div>
          <Link href="/database" style={{ textDecoration: 'none' }}><button type="button" className="btn-secondary">← Back to dashboard</button></Link>
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
            <label title="Tag a template so the system sends it automatically for a specific built-in event. These are fixed events the app understands — not keyword matching.">Built-in automation (template purpose)
              <select value={purpose} onChange={(event) => setPurpose(event.target.value)}>
                <option value="">General message (no automation)</option>
                <option value="delivery_booking">Delivery booking — track confirmation reply</option>
                <option value="delivery_confirmed_reply">Auto-reply when customer confirms (YES)</option>
                <option value="delivery_rejected_reply">Auto-reply when customer rejects (NO)</option>
                <option value="payment_received">Auto-reply when payment received (Stripe)</option>
              </select>
            </label>
            <p className="muted" style={{ margin: 0, fontSize: 12 }}>
              This tags a template for one of the app&apos;s <strong>built-in automations</strong> (fixed events it already handles):
              <br />• <strong>General message</strong> — no automation; a template you pick and send manually.
              <br />• <strong>Delivery booking</strong> — sending it arms the delivery light (🟡); a reply of 1/yes confirms (🟢) and 2/no rejects (🔴), updating the order status.
              <br />• <strong>Auto-reply (YES/NO)</strong> — sent back automatically when the customer confirms/rejects a delivery booking. Tag only one template for each.
              <br />• <strong>Payment received</strong> — sent automatically when a Stripe payment clears.
              <br /><br />Need a reply triggered by a <em>word</em> the customer texts (e.g. &quot;DEBIT&quot;)? That&apos;s a <strong>Custom keyword reply</strong> — set those up under Admin → Custom keyword replies, not here.
            </p>
            <p className="muted">Available fields: {'{customer_name}'}, {'{order_number}'}, {'{salesperson}'}, {'{mobile}'}, {'{balance_payable}'}, {'{payment_status}'}, {'{order_status}'}, {'{stripe_checkout_url}'}, {'{street_address}'}, {'{suburb}'}, {'{state}'}, {'{postcode}'}, {'{address}'}, {'{goods_in_date}'}, {'{ready_after_date}'}, {'{delivery_date}'}</p>
            <div className="grid grid-2"><button type="submit">Save Template</button><button type="button" onClick={clearForm}>New Template</button></div>
            {selectedId ? <button type="button" onClick={deleteTemplate}>Delete Template</button> : null}
          </form>
        </div>

        {status ? <p className="muted">{status}</p> : null}
      </div>
    </main>
  )
}
