export function json(data, init = {}) {
  const headers = new Headers(init.headers ?? {})
  headers.set('Content-Type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(data), {
    ...init,
    headers,
  })
}

export function errorResponse(status, message, extra = {}) {
  return json({
    error: {
      message,
      ...extra,
    },
  }, { status })
}

export async function readJsonBody(request, maxBytes) {
  const text = await request.text()
  const byteLength = new TextEncoder().encode(text).byteLength
  if (byteLength > maxBytes) {
    throw new Error('请求体过大')
  }
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('请求体不是有效的 JSON')
  }
}
