import { processGenerateRequest } from '../server/gateway.js'

const STREAM_HEARTBEAT_MS = 10_000

function getErrorStatus(message) {
  return /登录状态已失效|session|401/i.test(message)
    ? 401
    : /额度|试用/.test(message)
      ? 403
      : /请求体过大/.test(message)
        ? 413
        : 502
}

function createNdjsonLine(payload) {
  return `${JSON.stringify(payload)}\n`
}

function streamGenerateResponse(request) {
  const encoder = new TextEncoder()

  return new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(createNdjsonLine({
        type: 'accepted',
        at: new Date().toISOString(),
      })))

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(createNdjsonLine({
          type: 'heartbeat',
          at: new Date().toISOString(),
        })))
      }, STREAM_HEARTBEAT_MS)

      void processGenerateRequest(request)
        .then((result) => {
          clearInterval(heartbeat)
          controller.enqueue(encoder.encode(createNdjsonLine({
            type: 'result',
            data: result,
          })))
          controller.close()
        })
        .catch((error) => {
          clearInterval(heartbeat)
          const message = error instanceof Error ? error.message : String(error)
          controller.enqueue(encoder.encode(createNdjsonLine({
            type: 'error',
            status: getErrorStatus(message),
            message,
          })))
          controller.close()
        })
    },
    cancel() {
      // Browser disconnected. Let the in-flight provider request finish naturally.
    },
  }), {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, max-age=0',
      Connection: 'keep-alive',
    },
  })
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    return streamGenerateResponse(request)
  },
}
