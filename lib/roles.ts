// Role model (edge-safe — no imports, usable from middleware):
//   admin      — full access (unchanged)
//   manager    — read/write (unchanged)
//   standard   — legacy writer role (kept so existing users keep write access)
//   read_only  — NEW default for new users: GET only, no changes of any kind
export const READ_ONLY_ROLE = 'read_only'

// Roles selectable in the admin UI / accepted by the users API. 'standard' is
// intentionally omitted from the picker but still accepted/treated as a writer.
export const ASSIGNABLE_ROLES = ['admin', 'manager', READ_ONLY_ROLE]
export const ACCEPTED_ROLES = ['admin', 'manager', 'standard', READ_ONLY_ROLE]

export function isReadOnly(role: string | null | undefined): boolean {
  return (role || '').toLowerCase() === READ_ONLY_ROLE
}

// Anyone who is not read-only may write (admin, manager, legacy standard).
export function canWrite(role: string | null | undefined): boolean {
  return !isReadOnly(role)
}
