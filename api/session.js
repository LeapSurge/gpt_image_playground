import { getSessionFromRequest } from '../server/auth.js'
import { json } from '../server/json.js'
import { getAnonymousTrialState } from '../server/trial.js'

export default {
  async fetch(request) {
    if (request.method !== 'GET') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const session = await getSessionFromRequest(request)
    if (!session) {
      return json({
        customer: null,
        expiresAt: null,
        trial: await getAnonymousTrialState(request),
      })
    }

    return json({
      ...session,
      trial: null,
    })
  },
}
