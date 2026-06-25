'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function AccountPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    client.auth.getUser().then(({ data }) => {
      if (data.user?.email) {
        setEmail(data.user.email)
        setReady(true)
      } else {
        setStatus('You are not signed in. Please log in again to change your password.')
      }
    })
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password.length < 6) return setStatus('Password must be at least 6 characters.')
    if (password !== confirm) return setStatus('Passwords do not match.')
    setStatus('Updating password...')
    const { error } = await client.auth.updateUser({ password })
    if (error) return setStatus(error.message)
    setPassword('')
    setConfirm('')
    setStatus('Password updated. Use your new password next time you log in.')
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center' }}>
      <form className="card grid" style={{ width: 'min(460px, 100%)' }} onSubmit={submit}>
        <div>
          <p className="muted" style={{ margin: 0 }}>BoConcept</p>
          <h1 style={{ margin: '4px 0 8px' }}>Change Password</h1>
          <p className="muted" style={{ margin: 0 }}>{email ? `Signed in as ${email}` : 'Update your account password.'}</p>
        </div>
        <label>New password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" disabled={!ready} /></label>
        <label>Confirm new password<input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required autoComplete="new-password" disabled={!ready} /></label>
        <button type="submit" disabled={!ready}>Update Password</button>
        <Link href="/database" style={{ textDecoration: 'none' }}><button type="button" className="btn-secondary" style={{ width: '100%' }}>Back to dashboard</button></Link>
        {status ? <p className="muted">{status}</p> : null}
      </form>
    </main>
  )
}
