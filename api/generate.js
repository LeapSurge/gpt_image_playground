import { processGenerateRequest } from '../server/gateway.js'
import { errorResponse, json } from '../server/json.js'

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    try {
      const result = await processGenerateRequest(request)
      return json(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = /登录/.test(message) ? 401 : /额度/.test(message) ? 403 : /请求体过大/.test(message) ? 413 : 502
      return errorResponse(status, message)
    }
  },
}
