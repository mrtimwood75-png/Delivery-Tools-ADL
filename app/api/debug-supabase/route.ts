import { NextResponse } from 'next/server'

function decodeJwtPayload(token: string | undefined) {
  if (!token) return null
  try {
    const parts = token.split('.')
    if (parts.length < 2) return { error: 'Not a JWT format' }
    const payload = parts[1]
      .replace(/-/g, '+')
      .replace(/_/g, '/')
      .padEnd(Math.ceil(parts[1].length / 4) * 4, '=')
    const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    return {
      iss: decoded.iss || null,
      ref: decoded.ref || null,
      role: decoded.role || null,
      exp: decoded.exp || null
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Could not decode JWT' }
  }
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  return NextResponse.json({
    supabaseUrl,
    supabaseProjectRefFromUrl: supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || null,
    anonKeyPresent: Boolean(anonKey),
    anonKeyLength: anonKey.length,
    anonKeyPayload: decodeJwtPayload(anonKey),
    serviceRoleKeyPresent: Boolean(serviceKey),
    serviceRoleKeyLength: serviceKey.length,
    serviceRoleKeyPayload: decodeJwtPayload(serviceKey),
    expectedServiceRole: 'service_role'
  })
}
