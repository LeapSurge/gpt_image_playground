import { clearAdminSession, createAdminSession, getAdminSessionFromRequest } from '../../server/admin-auth.js'
import { errorResponse, json, readJsonBody } from '../../server/json.js'

export default {
  async fetch(request) {
    try {
      if (request.method === 'GET') {
        const session = await getAdminSessionFromRequest(request)
        return json(session ?? { authenticated: false, expiresAt: null })
      }

      if (request.method === 'POST') {
        const body = await readJsonBody(request, 8 * 1024)
        const secret = typeof body.secret === 'string' ? body.secret : ''
        const session = await createAdminSession(request, secret)
        return json({
          authenticated: true,
          expiresAt: session.expiresAt,
        }, {
          headers: {
            'Set-Cookie': session.cookie,
          },
        })
      }

      if (request.method === 'DELETE') {
        const cookie = await clearAdminSession(request)
        return json({ ok: true }, {
          headers: {
            'Set-Cookie': cookie,
          },
        })
      }

      return new Response('Method Not Allowed', { status: 405 })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const status = /管理员密钥不正确|登录状态无效/.test(message)
        ? 401
        : /缺少 ADMIN_SECRET|MANAGED_GATEWAY_SESSION_SECRET/.test(message)
          ? 503
          : 400
      return errorResponse(status, message)
    }
  },
}
