import { createAuthenticatedSession } from '../server/auth.js'
import { errorResponse, json, readJsonBody } from '../server/json.js'

const FAILED_LOGIN_WINDOW_MS = 10 * 60 * 1000
const FAILED_LOGIN_LIMIT = 5
const failedLoginAttempts = new Map()

function getClientKey(request, email) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const clientIp = forwardedFor || request.headers.get('x-real-ip') || 'unknown'
  return `${clientIp}:${email.trim().toLowerCase()}`
}

function isRateLimited(clientKey) {
  const now = Date.now()
  const record = failedLoginAttempts.get(clientKey)
  if (!record) return false
  if (record.blockedUntil && record.blockedUntil > now) return true
  if (record.firstAttemptAt + FAILED_LOGIN_WINDOW_MS <= now) {
    failedLoginAttempts.delete(clientKey)
    return false
  }
  return false
}

function recordFailedLogin(clientKey) {
  const now = Date.now()
  const current = failedLoginAttempts.get(clientKey)
  if (!current || current.firstAttemptAt + FAILED_LOGIN_WINDOW_MS <= now) {
    failedLoginAttempts.set(clientKey, {
      count: 1,
      firstAttemptAt: now,
      blockedUntil: null,
    })
    return
  }

  const nextCount = current.count + 1
  failedLoginAttempts.set(clientKey, {
    count: nextCount,
    firstAttemptAt: current.firstAttemptAt,
    blockedUntil: nextCount >= FAILED_LOGIN_LIMIT ? now + FAILED_LOGIN_WINDOW_MS : null,
  })
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    let email = ''
    try {
      const body = await readJsonBody(request, 32 * 1024)
      email = typeof body.email === 'string' ? body.email : ''
      const accessCode = typeof body.accessCode === 'string' ? body.accessCode : ''
      if (!email.trim() || !accessCode.trim()) {
        return errorResponse(400, '请输入邮箱和访问码')
      }
      const clientKey = getClientKey(request, email)
      if (isRateLimited(clientKey)) {
        return errorResponse(429, '登录失败次数过多，请稍后再试')
      }

      const session = await createAuthenticatedSession(request, email, accessCode)
      failedLoginAttempts.delete(clientKey)
      return json({
        customer: session.customer,
        expiresAt: session.expiresAt,
      }, {
        headers: {
          'Set-Cookie': session.cookie,
        },
      })
    } catch (error) {
      if (email) {
        recordFailedLogin(getClientKey(request, email))
      }
      return errorResponse(401, error instanceof Error ? error.message : String(error))
    }
  },
}
