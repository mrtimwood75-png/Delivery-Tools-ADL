import { getDocumentProxy } from 'unpdf'

// Locate the "final balance" area so a second Pay Now button can be placed next
// to it. Anchors on the "Sales balance … Total" row and the signature line,
// searching from the last page back (the totals sit on the last content page,
// not any trailing notes page). Coordinates are PDF user space (origin
// bottom-left), matching pdf-lib.
export type BalanceAnchor = {
  pageIndex: number
  headerY: number // baseline of the "Sales balance … Total" label row
  valuesY: number // baseline of the totals values row (holds the Total figure)
  totalRightX: number // right edge of the Total figure
  totalLeftX: number // left edge of the Total figure — button sits just left of this
  leftNeighborRight: number // right edge of the value left of the Total (e.g. GST) — button's left bound
  belowTotalsY: number // baseline of the first content below the totals band (footer/signature) — keep the fallback button above it
  pageWidth: number
  pageHeight: number
}

type Item = { str: string; x: number; y: number; right: number }
type Line = { y: number; text: string; maxRight: number; items: Item[] }

// Page-1 header geometry: the document's left content margin (so the logo
// aligns to it) and the printed heading ("Confirmation" / "Quotation" / …) so a
// replacement can be placed exactly over it — and skipped when unchanged.
export type HeaderLayout = {
  contentLeftX: number
  heading: { text: string; x: number; baselineY: number; width: number; height: number } | null
  pageWidth: number
  pageHeight: number
}

const HEADING_RE = /^(confirmation|quotation|tax invoice|invoice)$/i

export async function locateHeaderLayout(bytes: Uint8Array): Promise<HeaderLayout | null> {
  try {
    const doc = await getDocumentProxy(new Uint8Array(bytes))
    const page = await doc.getPage(1)
    const vp = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const items = content.items
      .map((it: unknown) => it as { str?: string; transform?: number[]; width?: number; height?: number })
      .filter((it) => it.str && it.str.trim() && Array.isArray(it.transform))
      .map((it) => ({ str: (it.str as string).trim(), x: (it.transform as number[])[4], y: (it.transform as number[])[5], w: it.width || 0, h: it.height || 0 }))

    // Left content margin: the left-most real text in the upper half of the page.
    const headerItems = items.filter((it) => it.y > vp.height * 0.5 && it.x > 20)
    let contentLeftX = headerItems.length ? Math.min(...headerItems.map((i) => i.x)) : 72
    contentLeftX = Math.max(36, Math.min(100, contentLeftX))

    // Printed heading, in the top region of the page.
    const top = items.filter((it) => it.y > vp.height - 150)
    const hd = top.find((it) => HEADING_RE.test(it.str))
    const heading = hd ? { text: hd.str, x: hd.x, baselineY: hd.y, width: hd.w, height: hd.h } : null

    return { contentLeftX, heading, pageWidth: vp.width, pageHeight: vp.height }
  } catch {
    return null
  }
}

export async function locateBalanceAnchor(bytes: Uint8Array): Promise<BalanceAnchor | null> {
  try {
    // pdf.js transfers/detaches the ArrayBuffer it's given, so hand it a copy —
    // the caller reuses `bytes` afterwards (e.g. to stamp with pdf-lib).
    const doc = await getDocumentProxy(new Uint8Array(bytes))
    for (let i = doc.numPages; i >= 1; i--) {
      const page = await doc.getPage(i)
      const vp = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items: Item[] = content.items
        .map((it: unknown) => it as { str?: string; transform?: number[]; width?: number })
        .filter((it) => it.str && it.str.trim() && Array.isArray(it.transform))
        .map((it) => {
          const x = (it.transform as number[])[4]
          return { str: it.str as string, x, y: (it.transform as number[])[5], right: x + (it.width || 0) }
        })

      // Cluster items into lines with a small y-tolerance — pdf.js can place the
      // (bold) Total figure on a fractionally different baseline than the rest
      // of its row, so exact-y grouping would split it off.
      const sorted = [...items].sort((a, b) => b.y - a.y)
      const clusters: Item[][] = []
      for (const it of sorted) {
        const last = clusters[clusters.length - 1]
        if (last && Math.abs(last[0].y - it.y) <= 2.5) last.push(it)
        else clusters.push([it])
      }
      const lines: Line[] = clusters.map((its) => ({
        y: its[0].y,
        text: its.slice().sort((a, b) => a.x - b.x).map((t) => t.str).join(' '),
        maxRight: Math.max(...its.map((t) => t.right)),
        items: its
      }))

      const header = lines.find((l) => /sales balance/i.test(l.text) && /total/i.test(l.text))
      if (!header) continue
      const below = lines.filter((l) => l.y < header.y).sort((a, b) => b.y - a.y)[0]
      const valuesY = below ? below.y : header.y - 14

      // The Total figure is the right-most item on the values row; the button
      // sits in the blank space between the value left of it (e.g. GST) and it.
      const rowItems = below ? below.items : header.items
      const totalItem = rowItems.reduce((m, it) => (it.right > m.right ? it : m), rowItems[0])
      const totalRightX = totalItem ? totalItem.right : header.maxRight
      const totalLeftX = totalItem ? totalItem.x : totalRightX - 40
      const leftNeighborRight = rowItems.filter((it) => it !== totalItem).reduce((m, it) => Math.max(m, it.right), 0)

      // First content below the totals band (the footer, or a signature line) —
      // the fallback button sits between the totals rule and this.
      const belowLines = lines.filter((l) => l.y < valuesY - 18)
      const belowTotalsY = belowLines.length ? Math.max(...belowLines.map((l) => l.y)) : 40

      return { pageIndex: i - 1, headerY: header.y, valuesY, totalRightX, totalLeftX, leftNeighborRight, belowTotalsY, pageWidth: vp.width, pageHeight: vp.height }
    }
  } catch { /* fall through */ }
  return null
}
