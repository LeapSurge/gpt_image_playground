import { clearAuthenticatedSession } from '../server/auth.js'
import { json } from '../server/json.js'

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const cookie = await clearAuthenticatedSession(request)
    return json({ ok: true }, {
      headers: {
        'Set-Cookie': cookie,
      },
    })
  },
}
