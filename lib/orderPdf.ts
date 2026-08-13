import { PDFDocument, PDFFont, PDFName, PDFPage, PDFString, StandardFonts, rgb } from 'pdf-lib'
import { BOCONCEPT_LOGO_PNG_BASE64 } from '@/lib/logoAsset'
import type { BalanceAnchor, HeaderLayout } from '@/lib/orderPdfLocate'

// Brand + augment a BoConcept "Confirmation" order/quote PDF:
//   - stamp the BoConcept logo into the empty top band of every page
//   - optionally overlay "Tax Invoice" over the "Confirmation" heading
//   - optionally embed a working Pay Now / Confirm Order link button — top of
//     page 1, and repeated beside the final balance
//   - optionally append extra PDFs (T&Cs, care guides, …)
//
// The template is fixed: the "Confirmation" heading sits at ~(325, 83) from the
// top on every page, and the top ~72pt is empty. pdf-lib's origin is the
// bottom-left, so we convert with `page.getHeight() - topOffset`.

// Payment CTA styling — a restrained, brand-consistent charcoal button with a
// small lock and the amount, following the app's #1a1a1a primary. Change
// BTN_BG to restyle globally.
const BTN_BG = rgb(0.486, 0.388, 0.18) // premium gold (#7C632E)
const WHITE = rgb(1, 1, 1)
const AMOUNT_TINT = rgb(0.96, 0.93, 0.85) // warm near-white for the amount

export type BuildOptions = {
  heading?: string | null // desired heading (e.g. "Quotation", "Tax Invoice"); overlaid only when it differs from what's printed
  headerLayout?: HeaderLayout | null // page-1 margin + printed heading position
  payNowUrl?: string | null
  payNowLabel?: string // e.g. "Pay Now" or "Confirm Order"
  payNowAmount?: string | null // formatted, e.g. "$8,080.30"
  payAnchor?: BalanceAnchor | null // where the final balance is (for the repeat button)
  attachments?: Uint8Array[] // extra PDFs to append after the order
}

function bytesFromBase64(b64: string): Uint8Array {
  const bin = Buffer.from(b64, 'base64')
  return new Uint8Array(bin.buffer, bin.byteOffset, bin.byteLength)
}

// A filled rounded rectangle (subtle corner radius r).
function roundedRect(page: PDFPage, x: number, y: number, w: number, h: number, r: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x: x + r, y, width: Math.max(0, w - 2 * r), height: h, color })
  page.drawRectangle({ x, y: y + r, width: w, height: Math.max(0, h - 2 * r), color })
  page.drawEllipse({ x: x + r, y: y + r, xScale: r, yScale: r, color })
  page.drawEllipse({ x: x + w - r, y: y + r, xScale: r, yScale: r, color })
  page.drawEllipse({ x: x + r, y: y + h - r, xScale: r, yScale: r, color })
  page.drawEllipse({ x: x + w - r, y: y + h - r, xScale: r, yScale: r, color })
}

// A small padlock glyph, drawn in `color`, centred at (cx, cy).
function lockIcon(page: PDFPage, cx: number, cy: number, s: number, color: ReturnType<typeof rgb>) {
  page.drawEllipse({ x: cx, y: cy + s * 0.26, xScale: s * 0.3, yScale: s * 0.32, borderColor: color, borderWidth: s * 0.13 })
  page.drawRectangle({ x: cx - s * 0.5, y: cy - s * 0.5, width: s, height: s * 0.62, color }) // body (masks the ring's lower half → shackle)
}

function addLink(pdf: PDFDocument, page: PDFPage, x: number, y: number, w: number, h: number, url: string) {
  const annot = pdf.context.obj({
    Type: PDFName.of('Annot'),
    Subtype: PDFName.of('Link'),
    Rect: [x, y, x + w, y + h],
    Border: [0, 0, 0],
    A: pdf.context.obj({ Type: PDFName.of('Action'), S: PDFName.of('URI'), URI: PDFString.of(url) })
  })
  const ref = pdf.context.register(annot)
  const annots = page.node.Annots()
  if (annots) annots.push(ref)
  else page.node.set(PDFName.of('Annots'), pdf.context.obj([ref]))
}

// A compact, restrained pay button. Single line: lock · title · amount.
// Right-aligned to `rightEdge`; its top sits at `topY`. Returns its box.
function payButton(
  pdf: PDFDocument,
  page: PDFPage,
  o: { rightEdge: number; topY: number; title: string; amount?: string | null; url: string; font: PDFFont; fontBold: PDFFont; maxWidth?: number }
) {
  const h = 24, size = 10.5, r = 4
  const padL = 11, lockS = h * 0.44, gapLock = 6, gapMid = 8, padR = 12
  const titleW = o.fontBold.widthOfTextAtSize(o.title, size)
  const full = padL + lockS + gapLock + titleW + (o.amount ? gapMid + o.font.widthOfTextAtSize(o.amount, size) : 0) + padR
  // Drop the amount if the button wouldn't fit the available space (e.g. beside
  // the Total figure) — the amount is already printed right next to it there.
  const amount = o.amount && o.maxWidth && full > o.maxWidth ? null : o.amount
  const amountW = amount ? o.font.widthOfTextAtSize(amount, size) : 0
  const w = padL + lockS + gapLock + titleW + (amount ? gapMid + amountW : 0) + padR
  const x = o.rightEdge - w
  const y = o.topY - h

  roundedRect(page, x, y, w, h, r, BTN_BG)
  lockIcon(page, x + padL + lockS / 2, y + h / 2, lockS, WHITE)
  let tx = x + padL + lockS + gapLock
  page.drawText(o.title, { x: tx, y: y + (h - size) / 2 + 0.7, size, font: o.fontBold, color: WHITE })
  if (amount) {
    tx += titleW + gapMid
    page.drawText(amount, { x: tx, y: y + (h - size) / 2 + 0.7, size, font: o.font, color: AMOUNT_TINT })
  }
  addLink(pdf, page, x, y, w, h, o.url)
  return { x, y, w, h }
}

export async function buildOrderPdf(source: Uint8Array, opts: BuildOptions = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(source)
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const logo = await pdf.embedPng(bytesFromBase64(BOCONCEPT_LOGO_PNG_BASE64))

  // Align the logo to the document's own left margin (confirmations sit at ~72,
  // quotations at ~54); fall back to 72 if we couldn't read it.
  const logoX = opts.headerLayout?.contentLeftX ?? 72

  // Overlay the heading only when it genuinely differs from what's printed (so a
  // quotation keeps its single native "Quotation"), placed over the real one.
  const printed = opts.headerLayout?.heading || null
  const doHeading = !!(opts.heading && printed && opts.heading.toLowerCase() !== printed.text.toLowerCase())

  const pages = pdf.getPages()
  pages.forEach((page) => {
    const H = page.getHeight()

    // --- Logo, top-left, in the empty header band (all pages) ---
    const logoW = 150
    const logoH = (logo.height / logo.width) * logoW // keep aspect (~32pt)
    page.drawImage(logo, { x: logoX, y: H - 24 - logoH, width: logoW, height: logoH })

    // --- Heading override, positioned over the printed heading (all pages) ---
    if (doHeading && printed && opts.heading) {
      const size = printed.height + 1
      page.drawRectangle({ x: printed.x - 3, y: printed.baselineY - 4, width: Math.max(printed.width, helvBold.widthOfTextAtSize(opts.heading, size)) + 8, height: printed.height + 7, color: rgb(1, 1, 1) })
      page.drawText(opts.heading, { x: printed.x, y: printed.baselineY, size, font: helvBold, color: rgb(0, 0, 0) })
    }
  })

  if (opts.payNowUrl) {
    const title = opts.payNowLabel || 'Pay Now'
    const url = opts.payNowUrl
    const amount = opts.payNowAmount
    const a = opts.payAnchor

    // Top of page 1, right side of the header band — right-aligned to the same
    // content edge as the document (falls back to the standard margin).
    const p0 = pages[0]
    const topRight = a ? a.totalRightX : p0.getWidth() - 72
    payButton(pdf, p0, { rightEdge: topRight, topY: p0.getHeight() - 22, title, amount, url, font: helv, fontBold: helvBold })

    // Repeat near the Total. Prefer inside the totals band, in the blank space
    // just left of the Total figure (between the two rules). If that gap is too
    // tight (e.g. quotations have extra Tax/Round-off columns), fall back to
    // right under the Total, just below the totals band.
    if (a && pages[a.pageIndex]) {
      const pg = pages[a.pageIndex]
      const cy = (a.headerY + a.valuesY) / 2 + 3.6 // vertical centre of the band
      const inBandRight = a.totalLeftX - 8
      const inBandMax = inBandRight - (a.leftNeighborRight + 10)
      if (inBandMax >= 70) {
        payButton(pdf, pg, { rightEdge: inBandRight, topY: cy + 12, title, amount, url, font: helv, fontBold: helvBold, maxWidth: inBandMax })
      } else {
        // Below the totals band's bottom rule, right-aligned to the Total's edge,
        // in the clear gap before the footer/signature.
        const topY = a.valuesY - 14
        if ((topY - 24) - (a.belowTotalsY + 6) >= 0) {
          payButton(pdf, pg, { rightEdge: a.totalRightX, topY, title, amount, url, font: helv, fontBold: helvBold })
        }
      }
    }
  }

  // --- Append attachments (admin library first, then ad-hoc uploads) ---
  if (opts.attachments?.length) {
    for (const att of opts.attachments) {
      try {
        await appendDoc(pdf, att)
      } catch { /* skip an unreadable attachment rather than fail the whole build */ }
    }
  }

  return pdf.save()
}

// Detect a document's type from its magic bytes (don't trust the upload's mime).
function sniff(b: Uint8Array): 'pdf' | 'png' | 'jpg' | 'other' {
  if (b.length >= 4 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return 'pdf'
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  return 'other'
}

// Append one document: PDF pages are copied in; an image becomes a fitted A4 page.
async function appendDoc(pdf: PDFDocument, bytes: Uint8Array) {
  const kind = sniff(bytes)
  if (kind === 'pdf') {
    const doc = await PDFDocument.load(bytes)
    const copied = await pdf.copyPages(doc, doc.getPageIndices())
    copied.forEach((p) => pdf.addPage(p))
    return
  }
  if (kind === 'png' || kind === 'jpg') {
    const img = kind === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes)
    const A4W = 595.28, A4H = 841.89, margin = 36
    const scale = Math.min((A4W - 2 * margin) / img.width, (A4H - 2 * margin) / img.height)
    const w = img.width * scale, h = img.height * scale
    const page = pdf.addPage([A4W, A4H])
    page.drawImage(img, { x: (A4W - w) / 2, y: (A4H - h) / 2, width: w, height: h })
  }
  // else: unsupported type — skip.
}
