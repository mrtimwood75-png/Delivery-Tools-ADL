import { createHash } from 'crypto'

const pepper = process.env.APP_PASSWORD_PEPPER || 'delivery-tools-bcb-v1'

export function hashPassword(password: string) {
  return createHash('sha256').update(`${pepper}:${password}`).digest('hex')
}

export function isValidPassword(password: string) {
  return String(password || '').length >= 6
}
