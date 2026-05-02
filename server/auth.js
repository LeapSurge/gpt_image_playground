import { createHash, scryptSync } from 'node:crypto'
import { createClearedSessionCookie, createSessionCookie, getSessionCookieName, parseCookies } from './cookies.js'
import { getManagedGatewayConfig } from './config.js'
import { randomSecret } from './ids.js'
import { getManagedGatewayStore } from './store/index.js'

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

export function hashAccessCode(accessCode) {
  const derived = scryptSync(accessCode.trim(), 'gpt-image-playground-managed-gateway', 32)
  return `scrypt:${derived.toString('hex')}`
}

export async function createAuthenticatedSession(request, email, accessCode) {
  const store = getManagedGatewayStore()
  const config = getManagedGatewayConfig()
  const customer = await store.authenticateCustomer(normalizeEmail(email), hashAccessCode(accessCode))
  if (!customer) {
    throw new Error('邮箱或访问码不正确')
  }

  const rawToken = randomSecret(32)
  const tokenHash = sha256(`${config.sessionSecret}:${rawToken}`)
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000)
  await store.createSession({
    customerId: customer.id,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
  })

  return {
    customer,
    expiresAt: expiresAt.toISOString(),
    cookie: createSessionCookie(request, rawToken, expiresAt),
  }
}

export async function getSessionFromRequest(request) {
  const cookies = parseCookies(request)
  const token = cookies[getSessionCookieName()]
  if (!token) return null

  const store = getManagedGatewayStore()
  const config = getManagedGatewayConfig()
  const record = await store.getSessionWithCustomer(sha256(`${config.sessionSecret}:${token}`))
  if (!record) return null

  return {
    customer: record.customer,
    expiresAt: typeof record.session.expiresAt === 'string'
      ? record.session.expiresAt
      : new Date(record.session.expiresAt).toISOString(),
  }
}

export async function clearAuthenticatedSession(request) {
  const cookies = parseCookies(request)
  const token = cookies[getSessionCookieName()]
  if (token) {
    const store = getManagedGatewayStore()
    const config = getManagedGatewayConfig()
    const tokenHash = sha256(`${config.sessionSecret}:${token}`)
    await store.revokeSession(tokenHash)
  }

  return createClearedSessionCookie(request)
}
