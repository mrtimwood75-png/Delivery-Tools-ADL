'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import BrandLogos from '@/components/BrandLogos'
import PortalNav from '@/components/PortalNav'
import { paymentBrandForHost } from '@/lib/host'

type Conversation = {
  key: string
  customerId: string | null
  phone: string | null
  name: string
  lastBody: string
  lastDirection: string
  lastAt: string
  unread: number
  unmatched: boolean
}

type ThreadMessage = {
  id: string
  created_at: string
  direction: string
  phone: string | null
  body: string
  status: string | null
  error: string | null
  media_urls: string[] | null
}

// Downscale a pasted/selected image to keep MMS media small (max dimension +
// JPEG re-encode), returning a Blob to upload.
function downscaleImage(file: File, maxDim = 1024, quality = 0.8): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      const longest = Math.max(width, height)
      if (longest > maxDim) {
        const scale = maxDim / longest
        width = Math.round(width * scale)
        height = Math.round(height * scale)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Could not process image.'))
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not process image.'))), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file is not a valid image.')) }
    img.src = url
  })
}

async function uploadImage(file: File): Promise<string> {
  const blob = await downscaleImage(file)
  const form = new FormData()
  form.append('file', blob, 'image.jpg')
  const res = await fetch('/api/sms/upload', { method: 'POST', body: form })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || 'Upload failed.')
  return json.url as string
}

function portalNameFor(brand: 'bca' | 'transforma' | null): string {
  return brand === 'transforma' ? 'Transforma Messages'
    : brand === 'bca' ? 'BoConcept Adelaide Messages'
      : 'Messages'
}

function timeLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selected, setSelected] = useState<Conversation | null>(null)
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const [isAdmin, setIsAdmin] = useState(false)
  const [notifyEmail, setNotifyEmail] = useState(true)
  const [hostBrand, setHostBrand] = useState<'bca' | 'transforma' | null>(null)

  // New-message composer state.
  const [composing, setComposing] = useState(false)
  const [typedNumber, setTypedNumber] = useState('')
  const [newDraft, setNewDraft] = useState('')

  // Rename (SMS-app contact name) state for the open thread.
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  // Pending image attachment (public URL) for each composer, plus upload state.
  const [attachment, setAttachment] = useState<string | null>(null)
  const [newAttachment, setNewAttachment] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function attachFile(file: File | null | undefined, target: 'reply' | 'new') {
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Only images can be attached.'); return }
    setUploading(true)
    setError('')
    try {
      const url = await uploadImage(file)
      if (target === 'reply') setAttachment(url); else setNewAttachment(url)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  function handlePaste(e: React.ClipboardEvent, target: 'reply' | 'new') {
    const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'))
    if (item) {
      e.preventDefault()
      attachFile(item.getAsFile(), target)
    }
  }

  const threadEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setHostBrand(paymentBrandForHost(window.location.host))
  }, [])
  useEffect(() => {
    document.title = portalNameFor(hostBrand)
  }, [hostBrand])

  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/sms/conversations', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) setConversations(json.conversations || [])
    } catch { /* ignore */ }
  }, [])

  const loadThread = useCallback(async (conv: Conversation) => {
    try {
      const qs = conv.customerId ? `customerId=${encodeURIComponent(conv.customerId)}` : `phone=${encodeURIComponent(conv.phone || '')}`
      const res = await fetch(`/api/sms/thread?${qs}`, { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) {
        setMessages(json.messages || [])
        // Opening clears unread server-side; reflect it locally too.
        setConversations((prev) => prev.map((c) => (c.key === conv.key ? { ...c, unread: 0 } : c)))
      } else {
        setError(json.error || 'Could not load conversation.')
      }
    } catch { setError('Could not load conversation.') }
  }, [])

  async function loadMe() {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' })
      const me = await res.json()
      if (res.ok) setIsAdmin(!!me.isAdmin)
    } catch { /* ignore */ }
    try {
      const res = await fetch('/api/sms/notify-pref', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) setNotifyEmail(json.notifyEmail !== false)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadConversations()
    loadMe()
  }, [loadConversations])

  // Poll: refresh the list, and the open thread, so new replies appear.
  useEffect(() => {
    const id = setInterval(() => {
      loadConversations()
      if (selected) loadThread(selected)
    }, 20000)
    return () => clearInterval(id)
  }, [selected, loadConversations, loadThread])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function openConversation(conv: Conversation) {
    setComposing(false)
    setRenaming(false)
    setError('')
    setDraft('')
    setAttachment(null)
    setSelected(conv)
    setMessages([])
    loadThread(conv)
  }

  // Save (or clear, when blank) the SMS-app name for this number.
  async function saveName() {
    if (!selected?.phone) return
    const name = nameDraft.trim()
    try {
      const res = await fetch('/api/sms/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: selected.phone, name })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not save name.')
      const newName = json.name || selected.phone
      setSelected({ ...selected, name: newName })
      setConversations((prev) => prev.map((c) => (c.key === selected.key ? { ...c, name: newName } : c)))
      setRenaming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save name.')
    }
  }

  async function sendReply() {
    if (!selected) return
    const body = draft.trim()
    if (!body && !attachment) return
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: selected.customerId || undefined, phone: selected.customerId ? undefined : selected.phone, body, mediaUrls: attachment ? [attachment] : [] })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Send failed.')
      setDraft('')
      setAttachment(null)
      await loadThread(selected)
      loadConversations()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  async function sendNew(target: { customerId?: string; phone?: string; label: string }) {
    const body = newDraft.trim()
    if (!body && !newAttachment) { setError('Type a message or attach an image first.'); return }
    if (!target.customerId && !target.phone) { setError('Enter a mobile number.'); return }
    setSending(true)
    setError('')
    try {
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: target.customerId, phone: target.phone, body, mediaUrls: newAttachment ? [newAttachment] : [] })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Send failed.')
      setComposing(false)
      setNewDraft(''); setTypedNumber(''); setNewAttachment(null)
      await loadConversations()
      openConversation({
        key: json.key,
        customerId: json.customerId,
        phone: json.phone,
        name: target.label,
        lastBody: body, lastDirection: 'outbound', lastAt: new Date().toISOString(),
        unread: 0, unmatched: !json.customerId
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  async function toggleNotify() {
    const next = !notifyEmail
    setNotifyEmail(next)
    try {
      await fetch('/api/sms/notify-pref', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next })
      })
    } catch { setNotifyEmail(!next) }
  }

  // Remove this conversation from my inbox (per-staff hide, not a hard delete).
  async function deleteThread() {
    if (!selected?.phone) return
    if (!window.confirm('Remove this conversation from your inbox? It will come back only if this number messages you again.')) return
    try {
      const res = await fetch(`/api/sms/thread?phone=${encodeURIComponent(selected.phone)}`, { method: 'DELETE' })
      if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Could not delete.') }
      setConversations((prev) => prev.filter((c) => c.key !== selected.key))
      setSelected(null)
      setMessages([])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete.')
    }
  }

  const totalUnread = useMemo(() => conversations.reduce((s, c) => s + (c.unread || 0), 0), [conversations])

  // ---- styles ----
  const card: React.CSSProperties = { background: '#fff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }
  const input: React.CSSProperties = { width: '100%', padding: '11px 13px', border: '1px solid #d9d9d9', borderRadius: 8, fontSize: 15, background: '#fff', boxSizing: 'border-box' }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f3f1', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#1a1a1a' }}>
      <div style={{ maxWidth: 920, margin: '0 auto', padding: '32px 16px 60px' }}>
        <header style={{ textAlign: 'center', marginBottom: 20, position: 'relative' }}>
          {isAdmin && (
            <a href="/admin" style={{ position: 'absolute', top: 0, right: 0, fontSize: 13, fontWeight: 600, color: '#1a1a1a', textDecoration: 'underline' }}>Admin</a>
          )}
          <div style={{ marginBottom: 16 }}><BrandLogos height={24} /></div>
          <PortalNav active="messages" />
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>{portalNameFor(hostBrand)}</h1>
          <p style={{ color: '#6b6b6b', fontSize: 13, marginTop: 6 }}>Your private customer conversations. Only you see the threads you&apos;re part of.</p>
        </header>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => { setComposing(true); setSelected(null); setError(''); setNewDraft(''); setTypedNumber(''); setNewAttachment(null) }}
            style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            + New message
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4a4a4a', cursor: 'pointer' }}>
            <input type="checkbox" checked={notifyEmail} onChange={toggleNotify} />
            Email me when a customer replies
          </label>
        </div>

        {error && <div style={{ background: '#fdecea', color: '#b3261e', padding: '10px 13px', borderRadius: 8, fontSize: 14, marginBottom: 14 }}>{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 300px) 1fr', gap: 16, alignItems: 'start' }}>
          {/* Conversation list */}
          <div style={{ ...card, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0efed', fontSize: 12, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#6b6b6b', display: 'flex', justifyContent: 'space-between' }}>
              <span>Conversations</span>
              {totalUnread > 0 && <span style={{ color: '#d64545' }}>{totalUnread} unread</span>}
            </div>
            {conversations.length === 0 ? (
              <div style={{ padding: 20, fontSize: 13, color: '#8a8a8a' }}>No conversations yet. Start one with “New message”.</div>
            ) : (
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                {conversations.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => openConversation(c)}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px', border: 'none',
                      borderTop: '1px solid #f4f3f1', cursor: 'pointer', color: '#1a1a1a',
                      background: selected?.key === c.key ? '#f4f3f1' : '#fff'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.name}
                      </span>
                      <span style={{ fontSize: 11, color: '#9a9a9a', whiteSpace: 'nowrap' }}>{timeLabel(c.lastAt)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 3 }}>
                      <span style={{ fontSize: 12, color: '#8a8a8a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {c.lastDirection === 'outbound' ? 'You: ' : ''}{c.lastBody}
                      </span>
                      {c.unread > 0 && (
                        <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#d64545', color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{c.unread}</span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right pane: composer or thread */}
          <div style={{ ...card, minHeight: 360, display: 'flex', flexDirection: 'column' }}>
            {composing ? (
              <div style={{ padding: 20 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginTop: 0, marginBottom: 14 }}>New message</h2>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b6b6b', marginBottom: 6 }}>Mobile number</label>
                <input style={input} value={typedNumber} onChange={(e) => setTypedNumber(e.target.value)} inputMode="tel" placeholder="04xx xxx xxx" />

                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#6b6b6b', margin: '16px 0 6px' }}>Message</label>
                <textarea style={{ ...input, minHeight: 90, resize: 'vertical' }} value={newDraft} onChange={(e) => setNewDraft(e.target.value)} onPaste={(e) => handlePaste(e, 'new')} placeholder="Type your message… (you can paste an image)" />

                {newAttachment ? (
                  <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'flex-start', gap: 8 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={newAttachment} alt="attachment" style={{ maxWidth: 120, maxHeight: 120, borderRadius: 8, display: 'block' }} />
                    <button type="button" onClick={() => setNewAttachment(null)} style={{ minHeight: 0, padding: '2px 8px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', color: '#1a1a1a', fontSize: 12, cursor: 'pointer' }}>Remove</button>
                  </div>
                ) : (
                  <label style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#4a4a4a', cursor: 'pointer' }}>
                    📎 Attach image
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { attachFile(e.target.files?.[0], 'new'); e.target.value = '' }} />
                  </label>
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button
                    type="button"
                    onClick={() => sendNew({ phone: typedNumber.trim(), label: typedNumber.trim() })}
                    disabled={sending || uploading || !typedNumber.trim() || (!newDraft.trim() && !newAttachment)}
                    style={{ padding: '11px 18px', borderRadius: 10, border: 'none', background: (sending || uploading || !typedNumber.trim() || (!newDraft.trim() && !newAttachment)) ? '#bbb' : '#1a1a1a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {uploading ? 'Uploading…' : 'Send'}
                  </button>
                  <button type="button" onClick={() => { setComposing(false); setError('') }} style={{ padding: '11px 18px', borderRadius: 10, border: '1px solid #d9d9d9', background: '#fff', color: '#1a1a1a', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                </div>
                <p style={{ fontSize: 12, color: '#9a9a9a', marginTop: 12 }}>If the number belongs to an existing customer, your message threads with their replies automatically.</p>
              </div>
            ) : selected ? (
              <>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #f0efed' }}>
                  {renaming ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <input
                        autoFocus
                        style={{ ...input, padding: '8px 11px' }}
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setRenaming(false) }}
                        placeholder="Contact name (leave blank to show the number)"
                      />
                      <button type="button" onClick={saveName} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save</button>
                      <button type="button" onClick={() => setRenaming(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', color: '#1a1a1a', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{selected.name}</div>
                        {selected.name !== selected.phone && <div style={{ fontSize: 12, color: '#9a9a9a' }}>{selected.phone}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => { setNameDraft(selected.name === selected.phone ? '' : selected.name); setRenaming(true) }}
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #dcdbd8', background: '#fff', fontSize: 12, fontWeight: 600, color: '#4a4a4a', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          {selected.name === selected.phone ? 'Add name' : 'Edit name'}
                        </button>
                        <button
                          type="button"
                          onClick={deleteThread}
                          title="Remove this conversation from your inbox"
                          style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #ecc7c7', background: '#fff', fontSize: 12, fontWeight: 600, color: '#b3261e', cursor: 'pointer', whiteSpace: 'nowrap' }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, padding: 18, overflowY: 'auto', maxHeight: '52vh', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {messages.map((m) => {
                    const out = m.direction === 'outbound'
                    return (
                      <div key={m.id} style={{ alignSelf: out ? 'flex-end' : 'flex-start', maxWidth: '78%' }}>
                        <div style={{
                          padding: '9px 13px', borderRadius: 14, fontSize: 14, lineHeight: 1.4, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                          background: out ? '#1a1a1a' : '#efeeec', color: out ? '#fff' : '#1a1a1a',
                          borderBottomRightRadius: out ? 4 : 14, borderBottomLeftRadius: out ? 14 : 4
                        }}>
                          {(m.media_urls || []).map((url, i) => (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <a key={i} href={url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                              <img src={url} alt="attachment" style={{ maxWidth: 220, maxHeight: 260, width: 'auto', borderRadius: 10, display: 'block', marginBottom: m.body && m.body !== '📷 Image' ? 6 : 0 }} />
                            </a>
                          ))}
                          {m.body && m.body !== '📷 Image' ? m.body : null}
                        </div>
                        <div style={{ fontSize: 10.5, color: '#a5a5a5', marginTop: 3, textAlign: out ? 'right' : 'left' }}>
                          {timeLabel(m.created_at)}{out && m.status ? ` · ${m.status}` : ''}{out && m.error ? ` · ${m.error}` : ''}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={threadEndRef} />
                </div>
                <div style={{ padding: 14, borderTop: '1px solid #f0efed' }}>
                  {attachment && (
                    <div style={{ marginBottom: 10, display: 'inline-flex', alignItems: 'flex-start', gap: 8 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={attachment} alt="attachment" style={{ maxWidth: 120, maxHeight: 120, borderRadius: 8, display: 'block' }} />
                      <button type="button" onClick={() => setAttachment(null)} style={{ minHeight: 0, padding: '2px 8px', borderRadius: 8, border: '1px solid #d9d9d9', background: '#fff', color: '#1a1a1a', fontSize: 12, cursor: 'pointer' }}>Remove</button>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                    <label title="Attach image" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 10, border: '1px solid #d9d9d9', background: '#fff', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}>
                      📎
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { attachFile(e.target.files?.[0], 'reply'); e.target.value = '' }} />
                    </label>
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onPaste={(e) => handlePaste(e, 'reply')}
                      onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply() } }}
                      placeholder="Type a message… (paste an image, Ctrl/⌘+Enter to send)"
                      style={{ ...input, minHeight: 44, maxHeight: 140, resize: 'vertical', flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={sendReply}
                      disabled={sending || uploading || (!draft.trim() && !attachment)}
                      style={{ padding: '12px 20px', borderRadius: 10, border: 'none', background: (sending || uploading || (!draft.trim() && !attachment)) ? '#bbb' : '#1a1a1a', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                    >
                      {uploading ? 'Uploading…' : sending ? 'Sending…' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ margin: 'auto', textAlign: 'center', color: '#9a9a9a', fontSize: 14, padding: 40 }}>
                Select a conversation, or start a new message.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
