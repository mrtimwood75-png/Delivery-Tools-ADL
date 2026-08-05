import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { getRequestAppUser } from '@/lib/apiAuth'

// Receives a pasted image, stores it in the public 'sms-media' bucket, and
// returns its public URL — which the send endpoint then passes to MessageMedia
// as MMS media and stores on the message for the thread to render.
export async function POST(request: NextRequest) {
  const me = await getRequestAppUser()
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid upload.' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No image provided.' }, { status: 400 })

  const type = file.type || 'image/jpeg'
  if (!type.startsWith('image/')) return NextResponse.json({ error: 'Only images can be attached.' }, { status: 400 })
  // MMS media must stay small; the client downscales, this is a safety cap.
  if (file.size > 2_000_000) return NextResponse.json({ error: 'Image too large (max ~2MB).' }, { status: 413 })

  const ext = (type.split('/')[1] || 'jpg').replace('jpeg', 'jpg').replace('+xml', '')
  const path = `${me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error } = await supabaseAdmin.storage.from('sms-media').upload(path, buffer, { contentType: type, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data } = supabaseAdmin.storage.from('sms-media').getPublicUrl(path)
  return NextResponse.json({ url: data.publicUrl })
}
