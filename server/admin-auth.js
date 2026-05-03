import { createHash, timingSafeEqual } from 'node:crypto'
import { getManagedGatewayConfig } from './config.js'
import {
  createAdminSessionCookie,
  createClearedAdminSessionCookie,
  getAdminSessionCookieName,
  parseCookies,
} from './cookies.js'

const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function buildAdminSessionToken(config, expiresAtMs) {
  const signature = sha256(`${config.sessionSecret}:${config.adminSecret}:${expiresAtMs}`)
  return `${expiresAtMs}.${signature}`
}

function safelyCompareStrings(left, right) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  if (leftBuffer.length !== rightBuffer.length) return false
  return timingSafeEqual(leftBuffer, rightBuffer)
}

export function assertAdminSecretConfigured() {
  const config = getManagedGatewayConfig()
  if (!config.adminSecret) {
    throw new Error('缺少 ADMIN_SECRET，管理员后台不可用')
  }
  if (!config.sessionSecret) {
    throw new Error('缺少 MANAGED_GATEWAY_SESSION_SECRET')
  }
  return config
}

export async function createAdminSession(request, secret) {
  const config = assertAdminSecretConfigured()
  if (!secret.trim() || !safelyCompareStrings(secret.trim(), config.adminSecret)) {
    throw new Error('管理员密钥不正确')
  }

  const expiresAt = new Date(Date.now() + ADMIN_SESSION_TTL_MS)
  return {
    authenticated: true,
    expiresAt: expiresAt.toISOString(),
    cookie: createAdminSessionCookie(
      request,
      buildAdminSessionToken(config, expiresAt.getTime()),
      expiresAt,
    ),
  }
}

export async function getAdminSessionFromRequest(request) {
  const config = assertAdminSecretConfigured()
  const cookies = parseCookies(request)
  const token = cookies[getAdminSessionCookieName()]
  if (!token) return null

  const [expiresAtRaw = '', signature = ''] = token.split('.', 2)
  const expiresAtMs = Number.parseInt(expiresAtRaw, 10)
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return null

  const expectedToken = buildAdminSessionToken(config, expiresAtMs)
  if (!safelyCompareStrings(token, expectedToken)) return null

  return {
    authenticated: true,
    expiresAt: new Date(expiresAtMs).toISOString(),
  }
}

export async function requireAdminSession(request) {
  const session = await getAdminSessionFromRequest(request)
  if (!session) {
    throw new Error('管理员登录状态无效或已过期')
  }
  return session
}

export async function clearAdminSession(request) {
  assertAdminSecretConfigured()
  return createClearedAdminSessionCookie(request)
}
