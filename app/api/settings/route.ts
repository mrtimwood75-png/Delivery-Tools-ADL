import { NextRequest, NextResponse } from 'next/server'

const allowedDensity = ['compact', 'normal', 'spacious']

function densityFrom(value: unknown) {
  const text = String(value || '')
  return allowedDensity.includes(text) ? text : 'normal'
}

export async function GET(request: NextRequest) {
  const density = densityFrom(request.cookies.get('delivery_density')?.value)
  return NextResponse.json({ settings: { density } })
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const density = densityFrom(body.density)
  const response = NextResponse.json({ settings: { density } })
  response.cookies.set('delivery_density', density, { path: '/' })
  return response
}
