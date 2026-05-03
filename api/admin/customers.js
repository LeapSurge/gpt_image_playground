import { createAdminCustomer, deleteAdminCustomer, listAdminCustomers } from '../../server/admin.js'
import { requireAdminSession } from '../../server/admin-auth.js'
import { errorResponse, json, readJsonBody } from '../../server/json.js'

export default {
  async fetch(request) {
    try {
      await requireAdminSession(request)

      if (request.method === 'GET') {
        return json({
          customers: await listAdminCustomers(),
        })
      }

      if (request.method === 'POST') {
        return json(await createAdminCustomer(await readJsonBody(request, 32 * 1024)))
      }

      if (request.method === 'DELETE') {
        const url = new URL(request.url)
        return json({
          customer: await deleteAdminCustomer(url.searchParams.get('customerId')),
        })
      }

      return new Response('Method Not Allowed', { status: 405 })
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
