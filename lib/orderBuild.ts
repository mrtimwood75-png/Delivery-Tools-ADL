import { buildOrderPdf } from '@/lib/orderPdf'
import { locateBalanceAnchor, locateHeaderLayout } from '@/lib/orderPdfLocate'
import { attachmentsForBuild } from '@/lib/orderAttachments'

const audFmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })

// Build the branded PDF from an Order Tools multipart form (the uploaded doc +
// options + stitched attachments). Shared by the download (/build) and email
// routes so they stay identical.
export async function buildBrandedFromForm(form: FormData): Promise<{ bytes: Uint8Array; downloadName: string } | { error: string }> {
  const file = form.get('file')
  if (!(file instanceof File)) return { error: 'No PDF uploaded.' }

  const heading = (String(form.get('heading') || '').trim()) || null
  const payNowUrl = (String(form.get('payNowUrl') || '').trim()) || null
  const payNowLabel = String(form.get('payNowLabel') || 'Pay Now').trim() || 'Pay Now'
  const amountNum = Number(form.get('amount') || 0)
  const payNowAmount = Number.isFinite(amountNum) && amountNum > 0 ? audFmt.format(amountNum) : null
  const downloadName = (String(form.get('filename') || 'BoConcept-document.pdf').trim() || 'BoConcept-document.pdf').replace(/[^\w.\- ]+/g, '_')

  // Library attachments to stitch (both standard + optional, as ticked).
  let selectedIds: string[] = []
  try {
    const raw = String(form.get('attachmentIds') || '')
    if (raw) selectedIds = JSON.parse(raw)
    if (!Array.isArray(selectedIds)) selectedIds = []
  } catch { selectedIds = [] }
  const libraryDocs = await attachmentsForBuild(selectedIds.map(String))

  // Ad-hoc uploads — always stitched last.
  const extraFiles = form.getAll('extraFiles').filter((f): f is File => f instanceof File)
  const extraDocs: Uint8Array[] = []
  for (const f of extraFiles) extraDocs.push(new Uint8Array(await f.arrayBuffer()))
  const attachments = [...libraryDocs, ...extraDocs]

  const src = new Uint8Array(await file.arrayBuffer())
  const headerLayout = await locateHeaderLayout(src)
  const payAnchor = payNowUrl ? await locateBalanceAnchor(src) : null
  const bytes = await buildOrderPdf(src, { heading, headerLayout, payNowUrl, payNowLabel, payNowAmount, payAnchor, attachments })
  return { bytes, downloadName }
}
