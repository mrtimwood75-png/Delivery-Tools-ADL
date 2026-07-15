'use client'

import { useEffect, useMemo, useState } from 'react'
import BrandLogos from '@/components/BrandLogos'
import { paymentBrandForHost } from '@/lib/host'

// Same-origin requests carry the NextAuth session cookie, which the server
// verifies — no Authorization header needed. Kept as a no-op so existing call
// sites stay unchanged.
async function authHeader(): Promise<Record<string, string>> {
  return {}
}

type Salesperson = { id: string; code: string; name: string | null; email: string | null; brand: string | null }
type RecentLink = {
  id: string
  created_at: string
  customer_name: string
  order_number: string | null
  amount: number
  status: string
  delivery_method: string | null
  delivery_status: string | null
  amount_paid: number | null
  paid_at: string | null
}

const money = (n: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(n || 0))

// Per-brand name for the tab title and page heading, from the host brand.
function portalNameFor(brand: 'bca' | 'transforma' | null): string {
  return brand === 'transforma' ? 'Transforma Payments Portal'
    : brand === 'bca' ? 'BoConcept Adelaide Payments Portal'
      : ''
}

export default function PaymentLinkPage() {
  const [customerName, setCustomerName] = useState('')
  const [orderNumber, setOrderNumber] = useState('')
  const [amount, setAmount] = useState('')
  const [salespeople, setSalespeople] = useState<Salesperson[]>([])
  const [salespersonId, setSalespersonId] = useState('')
  const [salespersonName, setSalespersonName] = useState('')
  const [salespersonEmail, setSalespersonEmail] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; deliveryStatus: string | null } | null>(null)
  const [recent, setRecent] = useState<RecentLink[]>([])

  const [isAdmin, setIsAdmin] = useState(false)

  // This one deployment serves both payment brands by host: show only that
  // brand's salespeople, and title the tab for that brand.
  const [hostBrand, setHostBrand] = useState<'bca' | 'transforma' | null>(null)
  useEffect(() => {
    setHostBrand(paymentBrandForHost(window.location.host))
  }, [])
  // Set the tab title in its own effect (after hostBrand is in state and the
  // page has hydrated) so it wins over the layout's metadata <title>.
  useEffect(() => {
    const name = portalNameFor(hostBrand)
    if (name) document.title = name
  }, [hostBrand])
  const visibleSalespeople = useMemo(
    () => (hostBrand ? salespeople.filter((s) => s.brand === hostBrand) : salespeople),
    [salespeople, hostBrand]
  )

  async function loadIsAdmin() {
    try {
      // Identity comes from the session cookie server-side; no localStorage race.
      const res = await fetch('/api/me', { headers: await authHeader() })
      const me = await res.json()
      if (res.ok) setIsAdmin(!!me.isAdmin)
    } catch { /* ignore */ }
  }

  async function loadRecent() {
    try {
      const res = await fetch('/api/payment-link', { headers: await authHeader() })
      const json = await res.json()
      if (res.ok) setRecent(json.links || [])
    } catch { /* ignore */ }
  }

  async function loadSalespeople() {
    try {
      const res = await fetch('/api/salespeople', { cache: 'no-store' })
      const json = await res.json()
      if (res.ok) setSalespeople(json.salespeople || [])
    } catch { /* ignore */ }
  }

  useEffect(() => {
    loadSalespeople()
    loadRecent()
    loadIsAdmin()
  }, [])

  function pickSalesperson(id: string) {
    setSalespersonId(id)
    const sp = salespeople.find((s) => s.id === id)
    if (sp) {
      setSalespersonName(sp.name || '')
      setSalespersonEmail(sp.email || '')
    }
  }

  const amountValid = useMemo(() => {
    const n = Number(amount)
    return Number.isFinite(n) && n > 0
  }, [amount])

  async function submit() {
    setError('')
    setResult(null)
    if (!customerName.trim()) return setError('Enter the customer name.')
    if (!orderNumber.trim()) return setError('Enter the order number.')
    if (!amountValid) return setError('Enter a payment amount greater than zero.')
    if (!salespersonEmail.trim()) return setError('Enter a return email address for payment confirmation.')
    if (!customerPhone.trim()) return setError('Enter the customer mobile to send the link by SMS.')

    setSubmitting(true)
    try {
      const res = await fetch('/api/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
        body: JSON.stringify({
          customerName: customerName.trim(),
          orderNumber: orderNumber.trim(),
          amount: Number(amount),
          salespersonName: salespersonName.trim(),
          salespersonEmail: salespersonEmail.trim(),
          customerPhone: customerPhone.trim(),
          deliveryMethod: 'sms'
        })
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not create payment link.')
      setResult({ url: json.url, deliveryStatus: json.deliveryStatus })
      setCustomerName(''); setOrderNumber(''); setAmount(''); setCustomerPhone('')
      loadRecent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create payment link.')
    } finally {
      setSubmitting(false)
    }
  }

  const label: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b6b6b', marginBottom: 6 }
  const input: React.CSSProperties = { width: '100%', padding: '11px 13px', border: '1px solid #d9d9d9', borderRadius: 8, fontSize: 15, background: '#fff', boxSizing: 'border-box' }
  const field: React.CSSProperties = { marginBottom: 18 }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f3f1', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif', color: '#1a1a1a' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 20px 80px' }}>
        <header style={{ textAlign: 'center', marginBottom: 28, position: 'relative' }}>
          {isAdmin && (
            <a href="/admin" style={{ position: 'absolute', top: 0, right: 0, fontSize: 13, fontWeight: 600, color: '#1a1a1a', textDecoration: 'underline' }}>Admin</a>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div style={{ marginBottom: 18 }}><BrandLogos height={26} /></div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>{portalNameFor(hostBrand) || 'Send a Payment Link'}</h1>
          <p style={{ color: '#6b6b6b', fontSize: 14, marginTop: 8 }}>
            Create a secure card-payment link and send it to your customer. You&apos;ll get an email when it&apos;s paid.
          </p>
        </header>

        <div style={{ background: '#fff', borderRadius: 14, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,.08)' }}>
          <div style={field}>
            <label style={label}>Customer name</label>
            <input style={input} value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="e.g. Jane Smith" />
          </div>

          <div style={{ display: 'flex', gap: 14 }}>
            <div style={{ ...field, flex: 1 }}>
              <label style={label}>Order #</label>
              <input style={input} value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="e.g. OS-005133" />
            </div>
            <div style={{ ...field, flex: 1 }}>
              <label style={label}>Payment amount (AUD)</label>
              <input style={input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
            </div>
          </div>

          <div style={field}>
            <label style={label}>Your return email (payment confirmation)</label>
            {visibleSalespeople.some((s) => (s.name || '').trim()) && (
              <select
                style={{ ...input, marginBottom: 8 }}
                value={salespersonId}
                onChange={(e) => pickSalesperson(e.target.value)}
              >
                <option value="">— Choose salesperson —</option>
                {visibleSalespeople.filter((s) => (s.name || '').trim()).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}{s.email ? ` (${s.email})` : ''}</option>
                ))}
              </select>
            )}
          </div>

          <div style={field}>
            <label style={label}>Customer mobile</label>
            <input style={input} value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" placeholder="04xx xxx xxx" />
          </div>

          {error && <div style={{ background: '#fdecea', color: '#b3261e', padding: '10px 13px', borderRadius: 8, fontSize: 14, marginBottom: 16 }}>{error}</div>}

          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            style={{ width: '100%', padding: '14px 0', borderRadius: 10, border: 'none', background: submitting ? '#999' : '#1a1a1a', color: '#fff', fontSize: 16, fontWeight: 600, cursor: submitting ? 'default' : 'pointer' }}
          >
            {submitting ? 'Creating & sending…' : 'Create & send text'}
          </button>

          {result && (
            <div style={{ marginTop: 20, background: '#edf7ed', borderRadius: 10, padding: 16 }}>
              <div style={{ fontWeight: 600, color: '#1e4620', marginBottom: 6 }}>
                {result.deliveryStatus && result.deliveryStatus.toLowerCase().includes('fail')
                  ? 'Link created — sending had a problem'
                  : 'Link created and sent ✓'}
              </div>
              {result.deliveryStatus && <div style={{ fontSize: 13, color: '#3a3a3a' }}>{result.deliveryStatus}</div>}
            </div>
          )}
        </div>

        {recent.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#6b6b6b', marginBottom: 12 }}>Recent links</h2>
            <div style={{ background: '#fff', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              {recent.map((r, i) => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: i ? '1px solid #f0efed' : 'none' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{r.customer_name}{r.order_number ? ` · ${r.order_number}` : ''}</div>
                    <div style={{ fontSize: 12, color: '#8a8a8a' }}>{money(r.amount)} · {r.delivery_method === 'sms' ? 'SMS' : r.delivery_method === 'email' ? 'Email' : 'Link'}</div>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 20,
                    background: r.status === 'paid' ? '#edf7ed' : '#fff4e5',
                    color: r.status === 'paid' ? '#1e4620' : '#8a5a00'
                  }}>
                    {r.status === 'paid' ? 'Paid' : 'Pending'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
