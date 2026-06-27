'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import BrandLogos from '@/components/BrandLogos'
import { ASSIGNABLE_ROLES } from '@/lib/roles'

type AppUser = { id: string; email: string; full_name: string | null; role: string; is_active: boolean; can_access_dashboard?: boolean; can_access_payments?: boolean }
type Density = 'compact' | 'normal' | 'spacious'

type Automation = { id: string; is_active: boolean; sort_order: number; trigger_type: string; trigger_template_id: string | null; trigger_keyword: string | null; trigger_status: string | null; match_mode: string | null; action_set_status: string | null; action_set_light: string | null; action_set_ready: string | null; action_send_template_id: string | null }
type NewAutomation = { trigger_type: string; trigger_template_id: string; trigger_keyword: string; trigger_status: string; match_mode: string; action_set_status: string; action_set_light: string; action_set_ready: string; action_send_template_id: string }
const emptyAuto: NewAutomation = { trigger_type: 'reply_to_template', trigger_template_id: '', trigger_keyword: '', trigger_status: '', match_mode: 'keyword', action_set_status: '', action_set_light: '', action_set_ready: '', action_send_template_id: '' }
const lightLabel: Record<string, string> = { confirmed: '🟢 Confirmed', awaiting: '🟡 Awaiting', rejected: '🔴 Rejected', none: '⚪ Clear' }
const triggerLabel: Record<string, string> = { template_sent: 'When this template is sent', reply_keyword: 'When a reply keyword matches', reply_to_template: 'When a customer replies to a template', status_set: 'When the status is changed to…', delivery_date_set: 'When a delivery date is set', delivery_date_cleared: 'When a delivery date is cleared' }
const REPLY_TRIGGERS = ['reply_keyword', 'reply_to_template']
const matchLabel: Record<string, string> = { keyword: 'starts with keyword', affirmative: 'says YES (yes/1/yeah…)', negative: 'says NO (no/2/nope…)', any: 'sends any reply' }

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
  const [templateList, setTemplateList] = useState<{ id: string; name: string }[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [newAuto, setNewAuto] = useState<NewAutomation>(emptyAuto)

  const isAdmin = myRole === 'admin'

  useEffect(() => {
    checkMe()
    loadSettings()
    loadUsers()
    loadCustomerStatuses()
    loadSalespeople()
    loadDeliveryEmail()
    loadAutomations()
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

  async function loadAutomations() {
    const response = await fetch('/api/automations', { cache: 'no-store' })
    const result = await response.json()
    if (response.ok) setAutomations(result.automations || [])
  }

  async function addAutomation() {
    const payload = { ...newAuto }
    if ((payload.trigger_type === 'template_sent' || payload.trigger_type === 'reply_to_template') && !payload.trigger_template_id) return setStatus('Pick the template for this trigger.')
    if (payload.trigger_type === 'reply_keyword' && !payload.trigger_keyword.trim()) return setStatus('Enter the keyword for this trigger.')
    if (payload.trigger_type === 'status_set' && !payload.trigger_status.trim()) return setStatus('Pick the status that triggers this rule.')
    if (REPLY_TRIGGERS.includes(payload.trigger_type) && payload.match_mode === 'keyword' && !payload.trigger_keyword.trim()) return setStatus('Enter the keyword to match, or change the match type.')
    if (!payload.action_set_status && !payload.action_set_light && !payload.action_set_ready && !payload.action_send_template_id) return setStatus('Pick at least one action.')
    const response = await fetch('/api/automations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Could not add automation')
    setNewAuto(emptyAuto)
    await loadAutomations()
    setStatus('Automation added.')
  }

  async function updateAutomation(id: string, patch: Record<string, unknown>) {
    const response = await fetch('/api/automations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...patch }) })
    const result = await response.json()
    if (!response.ok) return setStatus(result.error || 'Could not update automation')
    await loadAutomations()
  }

  async function moveAutomation(id: string, move: 'up' | 'down') {
    await fetch('/api/automations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, move }) })
    await loadAutomations()
  }

  async function deleteAutomation(id: string) {
    const response = await fetch('/api/automations', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    if (!response.ok) { const result = await response.json(); return setStatus(result.error || 'Could not delete automation') }
    await loadAutomations()
    setStatus('Automation deleted.')
  }

  function templateName(id: string | null) { return templateList.find((t) => t.id === id)?.name || (id ? '(unknown template)' : '') }
  function automationWhen(a: Automation) {
    if (a.trigger_type === 'template_sent') return `When "${templateName(a.trigger_template_id)}" is sent`
    if (a.trigger_type === 'status_set') return `When the status is changed to "${a.trigger_status || '—'}"`
    if (a.trigger_type === 'delivery_date_set') return 'When a delivery date is set'
    if (a.trigger_type === 'delivery_date_cleared') return 'When a delivery date is cleared'
    if (a.trigger_type === 'reply_to_template') return `When a customer replies to "${templateName(a.trigger_template_id)}" and ${matchLabel[a.match_mode || 'any']}${a.match_mode === 'keyword' && a.trigger_keyword ? ` "${a.trigger_keyword}"` : ''}`
    return `When a reply ${matchLabel[a.match_mode || 'keyword']}${a.trigger_keyword ? ` "${a.trigger_keyword}"` : ''}`
  }
  function automationThen(a: Automation) {
    const acts: string[] = []
    if (a.action_set_status) acts.push(`status → ${a.action_set_status}`)
    if (a.action_set_light) acts.push(`light → ${lightLabel[a.action_set_light] || a.action_set_light}`)
    if (a.action_set_ready) acts.push(`prep → ${a.action_set_ready}`)
    if (a.action_send_template_id) acts.push(`send "${templateName(a.action_send_template_id)}"`)
    return acts.length ? acts.join(', ') : '(no actions)'
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
          <h2 style={{ margin: 0 }}>Automations</h2>
          <p className="muted" style={{ margin: 0 }}>One place for all &quot;if this, then that&quot; rules. Pick a <strong>trigger</strong> (a template being sent, or a customer reply) and the <strong>actions</strong> that follow (set the customer status, the delivery light, the prep status, and/or auto-send a template). For replies, rules run <strong>top to bottom and the first match wins</strong> — use the arrows to order them.</p>

          {/* Builder */}
          {(() => {
            const statusOpts = customerStatuses.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
            const isReply = REPLY_TRIGGERS.includes(newAuto.trigger_type)
            const matchOpts = newAuto.trigger_type === 'reply_keyword' ? ['keyword', 'any'] : ['keyword', 'affirmative', 'negative', 'any']
            return (
              <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
                <label style={{ minWidth: 230 }}>Trigger<select value={newAuto.trigger_type} onChange={(e) => setNewAuto((a) => ({ ...a, trigger_type: e.target.value, match_mode: e.target.value === 'reply_keyword' ? 'keyword' : a.match_mode }))}>{Object.keys(triggerLabel).map((k) => <option key={k} value={k}>{triggerLabel[k]}</option>)}</select></label>
                {(newAuto.trigger_type === 'template_sent' || newAuto.trigger_type === 'reply_to_template') ? <label style={{ minWidth: 200 }}>Template<select value={newAuto.trigger_template_id} onChange={(e) => setNewAuto((a) => ({ ...a, trigger_template_id: e.target.value }))}><option value="">— Choose template —</option>{templateList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label> : null}
                {newAuto.trigger_type === 'status_set' ? <label style={{ minWidth: 200 }}>When status becomes<select value={newAuto.trigger_status} onChange={(e) => setNewAuto((a) => ({ ...a, trigger_status: e.target.value }))}><option value="">— Choose status —</option>{statusOpts.map((s) => <option key={s} value={s}>{s}</option>)}</select></label> : null}
                {isReply ? <label style={{ minWidth: 170 }}>Reply matches<select value={newAuto.match_mode} onChange={(e) => setNewAuto((a) => ({ ...a, match_mode: e.target.value }))}>{matchOpts.map((m) => <option key={m} value={m}>{matchLabel[m]}</option>)}</select></label> : null}
                {isReply && newAuto.match_mode === 'keyword' ? <label style={{ minWidth: 140 }}>Keyword<input value={newAuto.trigger_keyword} onChange={(e) => setNewAuto((a) => ({ ...a, trigger_keyword: e.target.value }))} placeholder="e.g. DEBIT" /></label> : null}
                <div style={{ flexBasis: '100%', height: 0 }} />
                <label style={{ minWidth: 180 }}>Set status<select value={newAuto.action_set_status} onChange={(e) => setNewAuto((a) => ({ ...a, action_set_status: e.target.value }))}><option value="">— No change —</option>{statusOpts.map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
                <label style={{ minWidth: 150 }}>Set light<select value={newAuto.action_set_light} onChange={(e) => setNewAuto((a) => ({ ...a, action_set_light: e.target.value }))}><option value="">— No change —</option>{Object.keys(lightLabel).map((k) => <option key={k} value={k}>{lightLabel[k]}</option>)}</select></label>
                <label style={{ minWidth: 150 }}>Set prep<select value={newAuto.action_set_ready} onChange={(e) => setNewAuto((a) => ({ ...a, action_set_ready: e.target.value }))}><option value="">— No change —</option><option value="Ready">Ready</option><option value="Not Ready">Not Ready</option></select></label>
                <label style={{ minWidth: 200 }}>Send template<select value={newAuto.action_send_template_id} onChange={(e) => setNewAuto((a) => ({ ...a, action_send_template_id: e.target.value }))}><option value="">— None —</option>{templateList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
                <button type="button" onClick={addAutomation}>Add automation</button>
              </div>
            )
          })()}

          {/* List */}
          <div className="grid" style={{ gap: 8 }}>
            {automations.length ? automations.map((a, i) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, opacity: a.is_active ? 1 : 0.55, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <button type="button" className="btn-secondary" style={{ padding: '0 8px', lineHeight: 1.4 }} disabled={i === 0} onClick={() => moveAutomation(a.id, 'up')} aria-label="Move up">▲</button>
                  <button type="button" className="btn-secondary" style={{ padding: '0 8px', lineHeight: 1.4 }} disabled={i === automations.length - 1} onClick={() => moveAutomation(a.id, 'down')} aria-label="Move down">▼</button>
                </div>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{automationWhen(a)}</div>
                  <div className="muted" style={{ fontSize: 13 }}>→ {automationThen(a)}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}><input type="checkbox" checked={a.is_active} onChange={(e) => updateAutomation(a.id, { is_active: e.target.checked })} style={{ width: 'auto' }} />Active</label>
                <button type="button" className="btn-danger" onClick={() => deleteAutomation(a.id)}>Delete</button>
              </div>
            )) : <p className="muted" style={{ margin: 0 }}>No automations yet. Build one above.</p>}
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
