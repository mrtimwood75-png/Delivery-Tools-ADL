import { supabaseAdmin } from '@/lib/supabaseAdmin'

export const ORDER_ATTACHMENTS_BUCKET = 'order-attachments'

export type OrderAttachment = {
  id: string
  name: string
  file_path: string
  mode: 'always' | 'optional'
  sort_order: number
  active: boolean
}

// Fetch the PDF bytes to stitch onto a document: exactly the active library
// attachments the staff member selected (both "always" docs, which the UI
// pre-ticks, and "optional" ones). Returns them in sort order. A download
// failure skips that one rather than failing the whole build.
export async function attachmentsForBuild(selectedIds: string[]): Promise<Uint8Array[]> {
  const { data, error } = await supabaseAdmin
    .from('order_attachments')
    .select('id, name, file_path, mode, sort_order, active')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error || !data) return []

  const selected = new Set(selectedIds)
  const chosen = (data as OrderAttachment[]).filter((a) => selected.has(a.id))

  const out: Uint8Array[] = []
  for (const att of chosen) {
    try {
      const dl = await supabaseAdmin.storage.from(ORDER_ATTACHMENTS_BUCKET).download(att.file_path)
      if (dl.error || !dl.data) continue
      out.push(new Uint8Array(await dl.data.arrayBuffer()))
    } catch { /* skip an unreadable attachment */ }
  }
  return out
}

// Like attachmentsForBuild but returns named files, for attaching to an email.
export async function attachmentFilesForEmail(ids: string[]): Promise<{ filename: string; content: Uint8Array }[]> {
  if (!ids.length) return []
  const { data, error } = await supabaseAdmin
    .from('order_attachments')
    .select('id, name, file_path, mode, sort_order, active')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error || !data) return []
  const selected = new Set(ids)
  const chosen = (data as OrderAttachment[]).filter((a) => selected.has(a.id))
  const out: { filename: string; content: Uint8Array }[] = []
  for (const att of chosen) {
    try {
      const dl = await supabaseAdmin.storage.from(ORDER_ATTACHMENTS_BUCKET).download(att.file_path)
      if (dl.error || !dl.data) continue
      const safe = att.name.replace(/[^\w.\- ]+/g, '_')
      out.push({ filename: /\.pdf$/i.test(safe) ? safe : `${safe}.pdf`, content: new Uint8Array(await dl.data.arrayBuffer()) })
    } catch { /* skip */ }
  }
  return out
}
