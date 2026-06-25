// Which deployment of the one Adelaide codebase is this?
//   'dashboard'   — warehouse dashboard (password login, dual-brand by order source)
//   'bca'         — BoConcept Adelaide payment app (Microsoft / BoConcept tenant)
//   'transforma'  — Transforma payment app (Microsoft / Transforma tenant)
//
// Set per Vercel deployment via NEXT_PUBLIC_STORE so both server and client (and
// the edge middleware) can read it. Defaults to the dashboard.
export type Store = 'dashboard' | 'bca' | 'transforma'

export const STORE: Store = (() => {
  const value = (process.env.NEXT_PUBLIC_STORE || process.env.STORE || '').trim().toLowerCase()
  return value === 'bca' || value === 'transforma' ? value : 'dashboard'
})()

export function isPaymentStore(store: Store = STORE): boolean {
  return store === 'bca' || store === 'transforma'
}
