import { createHash } from 'node:crypto'
import { getManagedGatewayConfig } from './config.js'
import { getClientIp } from './request.js'
import { getManagedGatewayStore } from './store/index.js'

export const ANONYMOUS_TRIAL_LIMIT = 3
export const ANONYMOUS_TRIAL_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

function getAnonymousTrialKey(request) {
  const config = getManagedGatewayConfig()
  const clientIp = getClientIp(request)
  return createHash('sha256').update(`${config.sessionSecret}:trial:${clientIp}`).digest('hex')
}

export async function getAnonymousTrialState(request) {
  const store = getManagedGatewayStore()
  return store.getAnonymousTrialBalance({
    ipHash: getAnonymousTrialKey(request),
    limit: ANONYMOUS_TRIAL_LIMIT,
    windowMs: ANONYMOUS_TRIAL_WINDOW_MS,
  })
}

export async function consumeAnonymousTrial(request) {
  const store = getManagedGatewayStore()
  return store.consumeAnonymousTrial({
    ipHash: getAnonymousTrialKey(request),
    limit: ANONYMOUS_TRIAL_LIMIT,
    windowMs: ANONYMOUS_TRIAL_WINDOW_MS,
  })
}
