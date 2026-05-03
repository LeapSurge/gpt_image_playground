import { listAdminUsage } from '../../server/admin.js'
import { requireAdminSession } from '../../server/admin-auth.js'
import { errorResponse, json } from '../../server/json.js'

export default {
  async fetch(request) {
    try {
      await requireAdminSession(request)

      if (request.method !== 'GET') {
        return new Response('Method Not Allowed', { status: 405 })
      }

      const url = new URL(request.url)
      return json({
        usage: await listAdminUsage(url.searchParams.get('limit')),
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
