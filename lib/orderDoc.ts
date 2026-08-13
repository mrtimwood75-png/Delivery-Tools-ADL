// Parse a BoConcept "Confirmation" sales order / quotation PDF into the fields
// the Order Tools app needs. The template is fixed (labels on the same line as
// their value once text-extracted), so we anchor on the labels rather than
// coordinates. Amounts use BoConcept's European formatting (dot thousands,
// comma decimals) — e.g. "8.080,30" = 8080.30.

export type ParsedOrder = {
  name: string | null
  email: string | null
  phone: string | null
  orderNumber: string | null
  salesperson: string | null
  total: number | null
  balanceDue: number | null
  amount: number | null // suggested payable amount: balance due if present, else total
}

type Sep = '.' | ','

// Detect which character the document uses as its DECIMAL separator, from every
// money figure in it: a figure that ends in "<sep><2 digits>" reveals the
// decimal separator (currency has 2 decimals). Majority wins; null if unclear.
export function detectDecimalSep(text: string): Sep | null {
  const tokens = text.match(/\d[\d.,]*\d/g) || []
  let dot = 0, comma = 0
  for (const tk of tokens) {
    const m = /[.,](\d{2})$/.exec(tk)
    if (!m) continue
    const sep = tk[tk.length - 3]
    if (sep === '.') dot++
    else if (sep === ',') comma++
  }
  if (dot > comma) return '.'
  if (comma > dot) return ','
  return null
}

// Parse a money string. When the document's decimal separator is known (from
// detectDecimalSep) it's used for a consistent read of every amount; otherwise
// a per-number heuristic is used: the last separator followed by 1–2 digits is
// the decimal, else every separator is a thousands grouping.
//   European: "8.080,30" -> 8080.30   AU/US: "7,039.00" -> 7039.00   "4,458" -> 4458
export function parseEuroAmount(raw: string | null | undefined, docSep: Sep | null = null): number | null {
  if (!raw) return null
  let s = String(raw).trim().replace(/[^\d.,]/g, '')
  if (!s) return null

  let decimalSep: Sep | null = null
  if (docSep) {
    // Treat docSep as the decimal only if this token actually has it followed by
    // 1–2 trailing digits; otherwise the separators here are all thousands.
    const idx = s.lastIndexOf(docSep)
    const after = idx >= 0 ? s.length - idx - 1 : -1
    if (idx >= 0 && after >= 1 && after <= 2) decimalSep = docSep
  } else {
    const lastSep = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'))
    const after = lastSep >= 0 ? s.length - lastSep - 1 : 0
    if (lastSep >= 0 && after >= 1 && after <= 2) decimalSep = s[lastSep] as Sep
  }

  if (decimalSep) {
    const thousands = decimalSep === '.' ? ',' : '.'
    s = s.split(thousands).join('').replace(decimalSep, '.')
  } else {
    s = s.replace(/[.,]/g, '')
  }
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re)
  return m ? (m[1] ?? m[0]).trim() : null
}

export function parseOrderText(text: string): ParsedOrder {
  // Normalise whitespace but keep line breaks — labels sit at the start of lines.
  const t = text.replace(/\r/g, '')

  // Customer name: the very first non-empty line of the document (the customer
  // block sits at the top-left, above the address and Phone/E-Mail rows).
  const name = t.split('\n').map((l) => l.trim()).find((l) => l.length > 0) || null

  // Customer email: the first email that isn't the store's own (BoConcept)
  // address, which appears in the header/footer. Blank if the customer has none.
  const emails = t.match(/[\w.\-+]+@[\w.\-]+\.[A-Za-z]{2,}/g) || []
  const email = emails.find((e) => !/boconcept/i.test(e)) || null

  // Fields may use dotted leaders between label and value (the quotation
  // template): "Sales order :.......... os-005645". Allow dots/colons/spaces.
  const SEP = '[\\s:.]*'

  // Mobile preferred, else Phone; else any AU mobile-looking number near the top.
  const mobile = firstMatch(t, new RegExp(`Mobile phone${SEP}([0-9][0-9 ]{7,})`, 'i'))
  const landline = firstMatch(t, new RegExp(`(?:^|\\n)\\s*Phone${SEP}([0-9][0-9 ]{7,})`, 'i'))
  const phone = (mobile || landline || firstMatch(t, /\b0[45](?:[ ]?\d){8}\b/) || '')?.replace(/\s+/g, '') || null

  // Order / quote number, e.g. "Sales order os-008231" or "Sales order :... os-005645".
  const orderNumber = firstMatch(t, new RegExp(`Sales order${SEP}([A-Za-z]{1,4}-?\\d{3,})`, 'i'))

  // Salesperson from "Our ref. <name>".
  const salesperson = firstMatch(t, new RegExp(`Our ref\\.?${SEP}([A-Za-z][A-Za-z '.\\-]+?)(?:\\n|Delivery|Customer|$)`, 'i'))

  // Figure out the document's number format once, then read every amount with it.
  const docSep = detectDecimalSep(t)

  // Grand total: the row headed "Sales balance … Total" is followed by a line of
  // amounts; the Total is the last one (Misc. charges may be blank).
  let total: number | null = null
  const totalsBlock = t.match(/Sales balance[^\n]*Total\s*\n([0-9.,\s]+)/i)
  if (totalsBlock) {
    const nums = totalsBlock[1].trim().split(/\s+/).map((tok) => parseEuroAmount(tok, docSep)).filter((n): n is number => n != null)
    if (nums.length) total = nums[nums.length - 1]
  }

  // Balance due (when a deposit/prepayment applies).
  const balanceDue = parseEuroAmount(firstMatch(t, new RegExp(`Balance due${SEP}([0-9][0-9.,]*)`, 'i')), docSep)

  const amount = (balanceDue && balanceDue > 0) ? balanceDue : total

  return { name, email, phone, orderNumber, salesperson, total, balanceDue, amount }
}
