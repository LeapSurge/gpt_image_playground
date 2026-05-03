import { grantAdminCredits } from '../../server/admin.js'
import { requireAdminSession } from '../../server/admin-auth.js'
import { errorResponse, json, readJsonBody } from '../../server/json.js'

export default {
  async fetch(request) {
    try {
      await requireAdminSession(request)

      if (request.method !== 'POST') {
        return new Response('Method Not Allowed', { status: 405 })
      }

      return json({
        customer: await grantAdminCredits(await readJsonBody(request, 16 * 1024)),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = /管理员登录状态无效/.test(message)
        ? 401
        : /缺少 ADMIN_SECRET|MANAGED_GATEWAY_SESSION_SECRET/.test(message)
          ? 503
          : 400
      return errorResponse(status, message)
    }
  },
}
