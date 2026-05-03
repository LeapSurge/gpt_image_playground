import { createSessionForCustomer, getSessionFromRequest, hashAccessCode } from '../server/auth.js'
import { randomSecret } from '../server/ids.js'
import { errorResponse, json, readJsonBody } from '../server/json.js'
import { getClientIp } from '../server/request.js'
import { getManagedGatewayStore } from '../server/store/index.js'

const FAILED_REDEEM_WINDOW_MS = 10 * 60 * 1000
const FAILED_REDEEM_LIMIT = 5
const failedRedeemAttempts = new Map()

function getClientKey(request, accessCode) {
  return `${getClientIp(request)}:${accessCode.trim()}`
}

function isRateLimited(clientKey) {
  const now = Date.now()
  const record = failedRedeemAttempts.get(clientKey)
  if (!record) return false
  if (record.blockedUntil && record.blockedUntil > now) return true
  if (record.firstAttemptAt + FAILED_REDEEM_WINDOW_MS <= now) {
    failedRedeemAttempts.delete(clientKey)
    return false
  }
  return false
}

function recordFailedRedeem(clientKey) {
  const now = Date.now()
  const current = failedRedeemAttempts.get(clientKey)
  if (!current || current.firstAttemptAt + FAILED_REDEEM_WINDOW_MS <= now) {
    failedRedeemAttempts.set(clientKey, {
      count: 1,
      firstAttemptAt: now,
      blockedUntil: null,
    })
    return
  }

  const nextCount = current.count + 1
  failedRedeemAttempts.set(clientKey, {
    count: nextCount,
    firstAttemptAt: current.firstAttemptAt,
    blockedUntil: nextCount >= FAILED_REDEEM_LIMIT ? now + FAILED_REDEEM_WINDOW_MS : null,
  })
}

function buildAnonymousRedeemCustomer() {
  const seed = randomSecret(10).toLowerCase()
  return {
    email: `redeem-${seed}@gpt-image-playground.local`,
    name: `兑换用户 ${seed.slice(-6)}`,
    accessCodeHash: hashAccessCode(randomSecret(16)),
  }
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    let accessCode = ''
    try {
      const body = await readJsonBody(request, 32 * 1024)
      accessCode = typeof body.accessCode === 'string' ? body.accessCode : ''
      if (!accessCode.trim()) {
        return errorResponse(400, '请输入兑换码')
      }

      const clientKey = getClientKey(request, accessCode)
      if (isRateLimited(clientKey)) {
        return errorResponse(429, '兑换失败次数过多，请稍后再试')
      }

      const activeSession = await getSessionFromRequest(request)
      const store = getManagedGatewayStore()
      const redeemed = await store.consumeRedeemCode({
        codeHash: hashAccessCode(accessCode),
        customerId: activeSession?.customer?.id ?? null,
        createCustomer: activeSession?.customer ? null : buildAnonymousRedeemCustomer(),
        operator: activeSession?.customer ? 'customer-redeem' : 'anonymous-redeem',
      })

      failedRedeemAttempts.delete(clientKey)

      if (activeSession?.customer) {
        return json({
          customer: redeemed.customer,
          expiresAt: activeSession.expiresAt,
          redeemCode: redeemed.redeemCode,
        })
      }

      const session = await createSessionForCustomer(request, redeemed.customer)
      return json({
        customer: session.customer,
        expiresAt: session.expiresAt,
        redeemCode: redeemed.redeemCode,
      }, {
        headers: {
          'Set-Cookie': session.cookie,
        },
      })
    } catch (error) {
      if (accessCode) {
        recordFailedRedeem(getClientKey(request, accessCode))
      }
      return errorResponse(401, error instanceof Error ? error.message : String(error))
    }
  },
}
