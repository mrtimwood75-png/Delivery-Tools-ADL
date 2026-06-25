'use client'

import { FormEvent, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

const client = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('Signing in...')

    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password
    })

    if (error || !data.user?.email) {
      setStatus(error?.message || 'Login failed.')
      return
    }

    window.localStorage.setItem('delivery_tools_email', data.user.email)
    window.location.href = '/database'
  }

  async function loginWithMicrosoft() {
    setStatus('Redirecting to Microsoft…')
    const { error } = await client.auth.signInWithOAuth({
      provider: 'azure',
      options: { scopes: 'email', redirectTo: window.location.origin }
    })
    if (error) setStatus(error.message)
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center' }}>
      <form className="card grid" style={{ width: 'min(460px, 100%)' }} onSubmit={login}>
        <div>
          <p className="muted" style={{ margin: 0 }}>BoConcept</p>
          <h1 style={{ margin: '4px 0 8px' }}>Sign in</h1>
          <p className="muted" style={{ margin: 0 }}>Sign in with your BoConcept Microsoft account, or with your email and password.</p>
        </div>

        <button type="button" onClick={loginWithMicrosoft} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, background: '#fff', color: '#1a1a1a', border: '1px solid #d9d9d9' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="https://learn.microsoft.com/en-us/entra/identity-platform/media/howto-add-branding-in-apps/ms-symbollockup_mssymbol_19.svg" alt="" width={18} height={18} />
          Sign in with Microsoft
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: '#9a9a9a', fontSize: 13 }}>
          <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />or<span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        </div>

        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label>
        <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" /></label>
        <button type="submit">Login</button>
        {status ? <p className="muted">{status}</p> : null}
      </form>
    </main>
  )
}
