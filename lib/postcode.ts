import postcodeData from '@/lib/auPostcodes.json'

// Suburb (UPPERCASE) -> [postcode, state]. Built from the AU localities dataset,
// preferring SA on name clashes since both brands deliver out of Adelaide.
const MAP = postcodeData as unknown as Record<string, [string, string]>

// Look up an Australian suburb's postcode + state. Returns null if unknown.
export function lookupSuburb(suburb: string | null | undefined): { postcode: string; state: string } | null {
  const key = String(suburb || '').trim().toUpperCase()
  if (!key) return null
  const hit = MAP[key]
  return hit ? { postcode: hit[0], state: hit[1] } : null
}
