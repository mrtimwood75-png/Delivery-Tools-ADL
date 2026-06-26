'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import BrandLogos from '@/components/BrandLogos'
import { ASSIGNABLE_ROLES } from '@/lib/roles'

type AppUser = { id: string; email: string; full_name: string | null; role: string; is_active: boolean; can_access_dashboard?: boolean; can_access_payments?: boolean }
type Density = 'compact' | 'normal' | 'spacious'

const roles = ASSIGNABLE_ROLES
const roleLabels: Record<string, string> = { admin: 'Admin', manager: 'Manager', read_only: 'Read Only', standard: 'Standard (legacy)' }
const roleLabel = (r: string) => roleLabels[r] || r
// Options for a user's role select, always including their current role (so a
// legacy 'standard' user still shows correctly).
const roleOptionsFor = (current: string) => (roles.includes(current) ? roles : [current, ...roles])
const defaultCustomerStatuses = ['Open', 'Awaiting Customer', 'Awaiting Goods', 'Delivery Booked', 'Delivered', 'Cancelled']
const densityOptions: { value: Density; label: string; help: string }[] = [
  { value: 'compact', label: 'Compact', help: 'Reduced line spacing. Best for high-volume dashboard work.' },
  { value: 'normal', label: 'Normal', help: 'Standard spacing.' },
  { value: 'spacious', label: 'Spacious', help: 'Increased line spacing for readability.' }
]

export default function AdminTemplatesPage() {
  const [users, setUsers] = useState<AppUser[]>([])
  const [density, setDensity] = useState<Density>('normal')
  const [customerStatuses, setCustomerStatuses] = useState(defaultCustomerStatuses.join('\n'))
  const [status, setStatus] = useState('')
  const [myRole, setMyRole] = useState('standard')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserName, setNewUserName] = useState('')
  const [newUserRole, setNewUserRole] = useState('read_only')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserDash, setNewUserDash] = useState(true)
  const [newUserPay, setNewUserPay] = useState(false)
  const [payTpl, setPayTpl] = useState({ sms: '', emailSubject: '', emailBody: '' })
  const [salespeople, setSalespeople] = useState<{ id: string; code: string; name: string | null; email: string | null; brand: string | null }[]>([])
  const [newSalesCode, setNewSalesCode] = useState('')
  const [newSalesBrand, setNewSalesBrand] = useState('transforma')
  const [deliveryEmail, setDeliveryEmail] = useState({ subject: '', body: '', enabled: false })
  const [testEmailTo, setTestEmailTo] = useState('')
  const [deliveryConfirm, setDeliveryConfirm] = useState({ confirmed_status: '', rejected_status: '' })
  const [replyRules, setReplyRules] = useState<{ id: string; keyword: string; reply_template_id: string | null; set_status: string | null; set_light: string | null; is_active: boolean }[]>([])
  const [templateList, setTemplateList] = useState<{ id: string; name: string }[]>([])
  const [newRule, setNewRule] = useState({ keyword: '', reply_template_id: '', set_status: '', set_light: '' })

  const isAdmin = myRole === 'admin'

  useEffect(() => {
    checkMe()
    loadSettings()
    loadUsers()
    loadCustomerStatuses()
    loadSalespeople()
    loadDeliveryEmail()
    loadDeliveryConfirm()
    loadReplyRules()
    loadTemplateList()
    loadPaymentTemplates()
  }, [])

  async function loadPaymentTemplates() {
    const response = await fetch('/api/payment-link/template', { cache: 'no-store' })
    const result = await response.json()
    if (response.ok) setPayTpl({ sms: result.smsTemplate || '', emailSubject: result.emailSubject || '', emailBody: result.emailBody || '' })
  }

  async function savePaymentTemplates() {
    setStatus('Saving Payment App templates...')
    const response = await fetch('/api/payment-link/template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ smsTemplate: payTpl.sms, emailSubject: payTpl.emailSubject, emailBody: payTpl.emailBody }) })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Payment App template save failed')
    setStatus('Payment App templates saved.')
  }

  async function loadTemplateList() {
    const response = await fetch('/api/templates', { cache: 'no-store' })
    const result = await response.json()
    if (response.ok) setTemplateList((result.templates || []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })))
  }

  async function loadReplyRules() {
    const response = await fetch('/api/sms-reply-rules', { cache: 'no-store' })
    const result = await response.json()
    if (response.ok) setReplyRules(result.rules || [])
  }

  async function saveRule(rule: { id?: string; keyword: string; reply_template_id?: string | null; set_status?: string | null; set_light?: string | null; is_active?: boolean }) {
    const response = await fetch('/api/sms-reply-rules', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rule) })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Could not save rule')
    await loadReplyRules()
    setStatus('Reply rule saved.')
  }

  async function addRule() {
    if (!newRule.keyword.trim()) return setStatus('Enter a keyword for the rule.')
    await saveRule({ keyword: newRule.keyword.trim(), reply_template_id: newRule.reply_template_id || null, set_status: newRule.set_status || null, set_light: newRule.set_light || null })
    setNewRule({ keyword: '', reply_template_id: '', set_status: '', set_light: '' })
  }

  async function deleteRule(id: string) {
    const response = await fetch('/api/sms-reply-rules', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (!response.ok) { const result = await response.json(); return setStatus(result.error || 'Could not delete rule') }
    await loadReplyRules()
    setStatus('Reply rule deleted.')
  }

  async function checkMe() {
    const response = await fetch('/api/me')
    const result = await response.json()
    setMyRole(result.user?.role || 'standard')
  }

  async function loadUsers() {
    const response = await fetch('/api/users', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) return
    setUsers(result.users || [])
  }

  async function loadSalespeople() {
    const response = await fetch('/api/salespeople', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) return
    setSalespeople(result.salespeople || [])
  }

  async function updateSalesperson(id: string, patch: { name?: string; email?: string; brand?: string | null }) {
    const response = await fetch('/api/salespeople', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Salesperson update failed')
    setStatus('Salesperson updated.')
    await loadSalespeople()
  }

  async function addSalesperson() {
    const code = newSalesCode.trim()
    if (!code) return
    const response = await fetch('/api/salespeople', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, brand: newSalesBrand }) })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Could not add salesperson')
    setNewSalesCode('')
    await loadSalespeople()
    setStatus('Salesperson added.')
  }

  async function loadDeliveryEmail() {
    const response = await fetch('/api/email-template', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok || !result.template) return
    setDeliveryEmail({ subject: result.template.subject || '', body: result.template.body || '', enabled: Boolean(result.template.enabled) })
  }

  async function saveDeliveryEmail() {
    setStatus('Saving delivery email...')
    const response = await fetch('/api/email-template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deliveryEmail) })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Delivery email save failed')
    setStatus('Delivery email saved.')
  }

  async function sendTestEmail() {
    const to = testEmailTo.trim()
    if (!to) return setStatus('Enter an email address to send the test to.')
    setStatus('Sending test email...')
    const response = await fetch('/api/email-template/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to }) })
    const result = await response.json()
    if (!response.ok) return setStatus(`Test email failed: ${result.error || 'unknown error'}`)
    setStatus(`Test email sent to ${result.sentTo}. Check the inbox.`)
  }

  async function loadDeliveryConfirm() {
    const response = await fetch('/api/delivery-settings', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok) return
    setDeliveryConfirm({ confirmed_status: result.confirmed_status || '', rejected_status: result.rejected_status || '' })
  }

  async function saveDeliveryConfirm() {
    setStatus('Saving delivery confirmation settings...')
    const response = await fetch('/api/delivery-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(deliveryConfirm) })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Save failed')
    setStatus('Delivery confirmation settings saved.')
  }

  async function loadCustomerStatuses() {
    const response = await fetch('/api/customer-status-options', { cache: 'no-store' })
    const result = await response.json()
    if (result.options?.length) setCustomerStatuses(result.options.join('\n'))
  }

  async function saveCustomerStatuses() {
    setStatus('Saving customer statuses...')
    const options = customerStatuses.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    const response = await fetch('/api/customer-status-options', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ options })
    })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Customer status save failed')
    setCustomerStatuses((result.options || options).join('\n'))
    setStatus('Customer statuses saved.')
  }

  async function loadSettings() {
    const response = await fetch('/api/settings')
    const result = await response.json()
    if (result.settings?.density) {
      setDensity(result.settings.density)
      document.documentElement.setAttribute('data-density', result.settings.density)
    }
  }

  async function saveSettings(nextDensity = density) {
    setStatus('Saving display settings...')
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ density: nextDensity })
    })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Settings save failed')
    setDensity(result.settings.density)
    document.documentElement.setAttribute('data-density', result.settings.density)
    setStatus('Display settings saved.')
  }

  async function saveUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isAdmin) return setStatus('Only admin users can add users.')
    setStatus('Saving user...')
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: newUserEmail, full_name: newUserName, role: newUserRole, is_active: true, password: newUserPassword, can_access_dashboard: newUserDash, can_access_payments: newUserPay })
    })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'User save failed')
    setNewUserEmail('')
    setNewUserName('')
    setNewUserRole('read_only')
    setNewUserPassword('')
    setNewUserDash(true)
    setNewUserPay(false)
    await loadUsers()
    setStatus(newUserPassword ? 'User saved and login created. Share the password with them.' : 'User saved (no login password set).')
  }

  async function resetUserPassword(user: AppUser) {
    if (!isAdmin) return setStatus('Only admin users can reset passwords.')
    const password = window.prompt(`Set a new password for ${user.email} (min 6 characters):`) || ''
    if (!password) return
    setStatus('Resetting password...')
    const response = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, email: user.email, password })
    })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Password reset failed')
    setStatus(`Password reset for ${user.email}.`)
  }

  async function updateUser(user: AppUser, patch: Partial<AppUser>) {
    if (!isAdmin) return setStatus('Only admin users can update users.')
    const response = await fetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, ...patch })
    })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'User update failed')
    await loadUsers()
    setStatus('User updated.')
  }

  return (
    <main>
      <div className="card grid" style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ marginBottom: 12 }}><BrandLogos height={34} /></div>
            <h1 style={{ margin: '4px 0 8px' }}>Admin</h1>
            <p className="muted" style={{ margin: 0 }}>Shared admin for both apps — users &amp; per-app access, message templates (kept separate per app), statuses, salespeople and emails.</p>
          </div>
          <Link href="/database" style={{ textDecoration: 'none' }}><button type="button">Back to Dashboard</button></Link>
        </div>

        {isAdmin ? <section className="card grid" style={{ boxShadow: 'none' }}>
          <h2 style={{ margin: 0 }}>Display Settings</h2>
          <label>
            Dashboard line spacing
            <select value={density} onChange={(event) => saveSettings(event.target.value as Density)}>
              {densityOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <p className="muted" style={{ margin: 0 }}>{densityOptions.find((option) => option.value === density)?.help}</p>
        </section> : null}

        {isAdmin ? <section className="card grid" style={{ boxShadow: 'none' }}>
          <h2 style={{ margin: 0 }}>Customer Status Options</h2>
          <p className="muted" style={{ margin: 0 }}>One status per line. These populate the Customer Status dropdown on the dashboard.</p>
          <textarea value={customerStatuses} onChange={(event) => setCustomerStatuses(event.target.value)} style={{ minHeight: 150 }} />
          <button type="button" onClick={saveCustomerStatuses}>Save Customer Statuses</button>
        </section> : null}

        {isAdmin ? <section className="card grid" style={{ boxShadow: 'none' }}>
          <h2 style={{ margin: 0 }}>Delivery Confirmation (SMS reply tracking)</h2>
          <p className="muted" style={{ margin: 0 }}>Tag an SMS template as a <strong>Delivery booking</strong> template on the Templates page. When a customer replies, the dashboard reads it: <strong>1 / yes</strong> sets the delivery light to 🟢 and the status below; <strong>2 / no</strong> sets it to 🔴 and the reject status. Anything unclear stays 🟡 and shows as an unread reply for a human.</p>
          <div className="grid grid-2">
            <label>Status when customer confirms
              <select value={deliveryConfirm.confirmed_status} onChange={(event) => setDeliveryConfirm((d) => ({ ...d, confirmed_status: event.target.value }))}>
                <option value="">— Leave status unchanged —</option>
                {customerStatuses.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Status when customer rejects
              <select value={deliveryConfirm.rejected_status} onChange={(event) => setDeliveryConfirm((d) => ({ ...d, rejected_status: event.target.value }))}>
                <option value="">— Leave status unchanged —</option>
                {customerStatuses.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>
          <button type="button" onClick={saveDeliveryConfirm}>Save Delivery Confirmation Settings</button>
        </section> : null}

        {isAdmin ? <section className="card grid" style={{ boxShadow: 'none' }}>
          <h2 style={{ margin: 0 }} title="Custom rules that react to a word the customer texts. For fixed events (delivery yes/no, payment received) use a template's Built-in automation on the Templates page instead.">Custom keyword replies</h2>
          <p className="muted" style={{ margin: 0 }}>When a customer&apos;s reply <strong>starts with a keyword you choose</strong> (the first word of their message), automatically send a template back and/or set the order status. Example: keyword <strong>DEBIT</strong> &rarr; send your &quot;Bank details&quot; template. Only the <strong>first word</strong> is checked, case-insensitive; the first matching rule wins.</p>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>↳ This is for <strong>your own custom keywords</strong>. The fixed automations — the delivery <strong>YES/NO</strong> flow and the <strong>payment-received</strong> reply — are set on the <strong>Templates</strong> page via a template&apos;s <em>Built-in automation</em>, and run before these rules. Use this section only for everything else.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Keyword', 'Auto-send template', 'Set status (optional)', 'Set delivery light (optional)', 'Active', ''].map((heading) => <th key={heading} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>{heading}</th>)}</tr></thead>
              <tbody>
                {replyRules.map((rule) => <tr key={rule.id}>
                  <td style={{ padding: 8, borderBottom: '1px solid var(--border)', fontWeight: 700 }}><input defaultValue={rule.keyword} onBlur={(event) => saveRule({ id: rule.id, keyword: event.target.value, reply_template_id: rule.reply_template_id, set_status: rule.set_status, set_light: rule.set_light, is_active: rule.is_active })} style={{ minWidth: 100 }} /></td>
                  <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><select value={rule.reply_template_id || ''} onChange={(event) => saveRule({ id: rule.id, keyword: rule.keyword, reply_template_id: event.target.value || null, set_status: rule.set_status, set_light: rule.set_light, is_active: rule.is_active })}><option value="">— No reply —</option>{templateList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                  <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><select value={rule.set_status || ''} onChange={(event) => saveRule({ id: rule.id, keyword: rule.keyword, reply_template_id: rule.reply_template_id, set_status: event.target.value || null, set_light: rule.set_light, is_active: rule.is_active })}><option value="">— No change —</option>{customerStatuses.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
                  <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><select value={rule.set_light || ''} onChange={(event) => saveRule({ id: rule.id, keyword: rule.keyword, reply_template_id: rule.reply_template_id, set_status: rule.set_status, set_light: event.target.value || null, is_active: rule.is_active })}><option value="">— No change —</option><option value="confirmed">🟢 Confirmed</option><option value="awaiting">🟡 Awaiting</option><option value="rejected">🔴 Rejected</option></select></td>
                  <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><input type="checkbox" checked={rule.is_active} onChange={(event) => saveRule({ id: rule.id, keyword: rule.keyword, reply_template_id: rule.reply_template_id, set_status: rule.set_status, set_light: rule.set_light, is_active: event.target.checked })} /></td>
                  <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><button type="button" className="btn-danger" onClick={() => deleteRule(rule.id)}>Delete</button></td>
                </tr>)}
                <tr>
                  <td style={{ padding: 8 }}><input value={newRule.keyword} onChange={(event) => setNewRule((r) => ({ ...r, keyword: event.target.value }))} placeholder="e.g. DEBIT" style={{ minWidth: 100 }} /></td>
                  <td style={{ padding: 8 }}><select value={newRule.reply_template_id} onChange={(event) => setNewRule((r) => ({ ...r, reply_template_id: event.target.value }))}><option value="">— No reply —</option>{templateList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                  <td style={{ padding: 8 }}><select value={newRule.set_status} onChange={(event) => setNewRule((r) => ({ ...r, set_status: event.target.value }))}><option value="">— No change —</option>{customerStatuses.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).map((item) => <option key={item} value={item}>{item}</option>)}</select></td>
                  <td style={{ padding: 8 }}><select value={newRule.set_light} onChange={(event) => setNewRule((r) => ({ ...r, set_light: event.target.value }))}><option value="">— No change —</option><option value="confirmed">🟢 Confirmed</option><option value="awaiting">🟡 Awaiting</option><option value="rejected">🔴 Rejected</option></select></td>
                  <td style={{ padding: 8 }} colSpan={2}><button type="button" onClick={addRule}>Add rule</button></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section> : null}

        {isAdmin ? <section className="card grid" style={{ boxShadow: 'none' }}>
          <h2 style={{ margin: 0 }}>Users</h2>
          <form className="grid grid-2" onSubmit={saveUser}>
            <label>Email<input value={newUserEmail} onChange={(event) => setNewUserEmail(event.target.value)} required /></label>
            <label>Full name<input value={newUserName} onChange={(event) => setNewUserName(event.target.value)} /></label>
            <label>Role<select value={newUserRole} onChange={(event) => setNewUserRole(event.target.value)}>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></label>
            <label>Initial password<input type="text" value={newUserPassword} onChange={(event) => setNewUserPassword(event.target.value)} placeholder="min 6 characters" autoComplete="new-password" /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={newUserDash} onChange={(event) => setNewUserDash(event.target.checked)} style={{ width: 'auto' }} />Dashboard access</label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={newUserPay} onChange={(event) => setNewUserPay(event.target.checked)} style={{ width: 'auto' }} />Payment App access</label>
            <button type="submit">Add / Update User</button>
          </form>
          <p className="muted" style={{ margin: 0 }}>Set an initial password to create the user&apos;s login. They can change it later from Account. Leave blank to update profile/role only. <strong>App access</strong> controls which apps each user can open.</p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Email', 'Name', 'Role', 'Active', 'Dashboard', 'Payment App', 'Password'].map((heading) => <th key={heading} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>{heading}</th>)}</tr></thead>
              <tbody>{users.map((user) => <tr key={user.id}>
                <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>{user.email}</td>
                <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><input defaultValue={user.full_name || ''} onBlur={(event) => updateUser(user, { full_name: event.target.value })} /></td>
                <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><select value={user.role} onChange={(event) => updateUser(user, { role: event.target.value })}>{roleOptionsFor(user.role).map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</select></td>
                <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><input type="checkbox" checked={user.is_active} onChange={(event) => updateUser(user, { is_active: event.target.checked })} /></td>
                <td style={{ padding: 8, borderBottom: '1px solid var(--border)', textAlign: 'center' }}><input type="checkbox" checked={user.can_access_dashboard !== false} onChange={(event) => updateUser(user, { can_access_dashboard: event.target.checked })} /></td>
                <td style={{ padding: 8, borderBottom: '1px solid var(--border)', textAlign: 'center' }}><input type="checkbox" checked={user.can_access_payments === true} onChange={(event) => updateUser(user, { can_access_payments: event.target.checked })} /></td>
                <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><button type="button" className="btn-secondary" onClick={() => resetUserPassword(user)}>Reset</button></td>
              </tr>)}</tbody>
            </table>
          </div>
        </section> : null}

        {isAdmin ? <section className="card grid" style={{ boxShadow: 'none', border: '2px solid #1a1a1a' }}>
          <h2 style={{ margin: 0 }}>Payment App · Message Templates</h2>
          <p className="muted" style={{ margin: 0 }}>These belong to the <strong>Payment App</strong> only (kept separate from the Delivery Dashboard templates below).</p>
          <label>Customer SMS (sent with the payment link)
            <textarea value={payTpl.sms} onChange={(event) => setPayTpl((t) => ({ ...t, sms: event.target.value }))} style={{ minHeight: 120 }} />
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Placeholders: {'{customer_name}'}, {'{amount}'}, {'{order_number}'}, {'{link}'}. Must include {'{link}'}.</p>
          <label>Salesperson confirmation email — subject
            <input value={payTpl.emailSubject} onChange={(event) => setPayTpl((t) => ({ ...t, emailSubject: event.target.value }))} />
          </label>
          <label>Salesperson confirmation email — body
            <textarea value={payTpl.emailBody} onChange={(event) => setPayTpl((t) => ({ ...t, emailBody: event.target.value }))} style={{ minHeight: 160 }} />
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>Placeholders: {'{customer_name}'}, {'{order_number}'}, {'{amount}'}, {'{paid_at}'}, {'{allocation_note}'}.</p>
          <button type="button" onClick={savePaymentTemplates}>Save Payment App Templates</button>
        </section> : null}

        {isAdmin ? <section className="card grid" style={{ boxShadow: 'none' }}>
          <h2 style={{ margin: 0 }}>Delivery Dashboard · SMS Templates</h2>
          <p className="muted" style={{ margin: 0 }}>These are the <strong>Delivery Dashboard</strong> notification templates (order/delivery messages) — separate from the Payment App templates above.</p>
          <Link href="/templates" style={{ textDecoration: 'none' }}><button type="button">Open Dashboard SMS Templates</button></Link>
        </section> : null}

        {isAdmin ? <section className="card grid" style={{ boxShadow: 'none' }}>
          <h2 style={{ margin: 0 }}>Salespeople</h2>
          <p className="muted" style={{ margin: 0 }}>Record each salesperson&apos;s <strong>code</strong>, <strong>name</strong> and <strong>email</strong>, grouped by store. Codes appear here automatically from imports (the Transforma sync&apos;s AREA code, e.g. &quot;SS&quot;, and the BCA Tour Totals &quot;Recipient&quot; column) and are tagged with the store they came from. The <strong>name</strong> you enter is what shows on the dashboard in place of the code; the <strong>email</strong> is used for the delivery notification and the dashboard&apos;s email button. Use the <strong>Store</strong> dropdown to move anyone who lands in the wrong group.</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ flex: 1, minWidth: 160 }}>Add a code manually<input value={newSalesCode} onChange={(event) => setNewSalesCode(event.target.value)} placeholder="e.g. SS" /></label>
            <label style={{ minWidth: 180 }}>Store<select value={newSalesBrand} onChange={(event) => setNewSalesBrand(event.target.value)}><option value="transforma">Transforma</option><option value="bca">BoConcept Adelaide</option></select></label>
            <button type="button" onClick={addSalesperson}>Add</button>
          </div>
          {([{ key: 'bca', label: 'BoConcept Adelaide' }, { key: 'transforma', label: 'Transforma' }, { key: '', label: 'Unassigned' }] as { key: string; label: string }[]).map((group) => {
            const rows = salespeople.filter((sp) => (sp.brand || '') === group.key)
            if (group.key === '' && !rows.length) return null
            return (
              <div key={group.label || 'unassigned'} style={{ marginTop: 4 }}>
                <h3 style={{ margin: '8px 0 6px', fontSize: 15 }}>{group.label} <span className="muted" style={{ fontWeight: 400 }}>({rows.length})</span></h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>{['Code', 'Name', 'Email', 'Store'].map((heading) => <th key={heading} style={{ textAlign: 'left', padding: 8, borderBottom: '1px solid var(--border)' }}>{heading}</th>)}</tr></thead>
                    <tbody>{rows.length ? rows.map((sp) => <tr key={sp.id}>
                      <td style={{ padding: 8, borderBottom: '1px solid var(--border)', fontWeight: 700 }}>{sp.code}</td>
                      <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><input defaultValue={sp.name || ''} placeholder="Full name (optional)" onBlur={(event) => updateSalesperson(sp.id, { name: event.target.value })} /></td>
                      <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><input type="email" defaultValue={sp.email || ''} placeholder="name@boconcept.com.au" onBlur={(event) => updateSalesperson(sp.id, { email: event.target.value })} /></td>
                      <td style={{ padding: 8, borderBottom: '1px solid var(--border)' }}><select value={sp.brand || ''} onChange={(event) => updateSalesperson(sp.id, { brand: event.target.value || null })}><option value="">— Unassigned —</option><option value="transforma">Transforma</option><option value="bca">BoConcept Adelaide</option></select></td>
                    </tr>) : <tr><td colSpan={4} style={{ padding: 8 }} className="muted">None yet.</td></tr>}</tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </section> : null}

        {isAdmin ? <section className="card grid" style={{ boxShadow: 'none' }}>
          <h2 style={{ margin: 0 }}>Delivery Email to Salesperson</h2>
          <p className="muted" style={{ margin: 0 }}>When an order&apos;s status is set to &quot;Delivered&quot;, email its salesperson (using their email from the table above). Requires the email service to be configured.</p>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700 }}>
            <input type="checkbox" checked={deliveryEmail.enabled} onChange={(event) => setDeliveryEmail((d) => ({ ...d, enabled: event.target.checked }))} style={{ width: 'auto' }} />
            Send this email when an order is delivered
          </label>
          <label>Subject<input value={deliveryEmail.subject} onChange={(event) => setDeliveryEmail((d) => ({ ...d, subject: event.target.value }))} /></label>
          <label>Message<textarea value={deliveryEmail.body} onChange={(event) => setDeliveryEmail((d) => ({ ...d, body: event.target.value }))} style={{ minHeight: 160 }} /></label>
          <p className="muted">Available fields: {'{salesperson_name}'}, {'{salesperson_code}'}, {'{order_number}'}, {'{customer_name}'}, {'{delivery_date}'}</p>
          <button type="button" onClick={saveDeliveryEmail}>Save Delivery Email</button>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <label style={{ flex: 1, minWidth: 200 }}>Send a test email to<input type="email" value={testEmailTo} onChange={(event) => setTestEmailTo(event.target.value)} placeholder="you@boconcept.com.au" /></label>
            <button type="button" className="btn-secondary" onClick={sendTestEmail}>Send Test</button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>The test uses your saved template with sample data. If the email service isn&apos;t configured yet, the status line will show the exact error.</p>
        </section> : null}

        {status ? <p className="muted">{status}</p> : null}
      </div>
    </main>
  )
}
