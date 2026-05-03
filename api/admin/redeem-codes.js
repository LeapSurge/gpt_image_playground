import { createAdminRedeemCodeBatch, listAdminRedeemCodes } from '../../server/admin.js'
import { requireAdminSession } from '../../server/admin-auth.js'
import { errorResponse, json, readJsonBody } from '../../server/json.js'

export default {
  async fetch(request) {
    try {
      await requireAdminSession(request)

      if (request.method === 'GET') {
        const url = new URL(request.url)
        const redeemCodes = await listAdminRedeemCodes(url.searchParams.get('limit'))
        return json({
          redeemCodes,
          codes: redeemCodes,
        })
      }

      if (request.method === 'POST') {
        const created = await createAdminRedeemCodeBatch(await readJsonBody(request, 64 * 1024))
        return json({
          batchId: created.batchId,
          createdCodes: created.createdCodes,
          codes: created.createdCodes,
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
