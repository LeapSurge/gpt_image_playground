import { randomBytes } from 'node:crypto'

export function randomId(prefix = 'id') {
  return `${prefix}_${randomBytes(12).toString('hex')}`
}

export function randomSecret(length = 12) {
  return randomBytes(length).toString('base64url')
}
