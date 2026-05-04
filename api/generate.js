import { processGenerateRequest } from '../server/gateway.js'

const IMAGE_CHUNK_BASE64_SIZE = 128 * 1024
const HEARTBEAT_INTERVAL_MS = 10_000

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

function parseDataUrl(dataUrl) {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) {
    return {
      mime: 'image/png',
      base64: dataUrl,
    }
  }

  const meta = dataUrl.slice(0, commaIndex)
  const base64 = dataUrl.slice(commaIndex + 1)
  const mimeMatch = meta.match(/^data:([^;,]+)/i)

  return {
    mime: mimeMatch?.[1] || 'image/png',
    base64,
  }
}

function emitNdjson(controller, encoder, payload) {
  controller.enqueue(encoder.encode(createNdjsonLine(payload)))
}

function streamGeneratedImages(controller, encoder, result) {
  for (let index = 0; index < result.images.length; index += 1) {
    const imageId = `image-${index + 1}`
    const { mime, base64 } = parseDataUrl(result.images[index])
    emitNdjson(controller, encoder, {
      type: 'image-start',
      id: imageId,
      mime,
    })

    for (let offset = 0; offset < base64.length; offset += IMAGE_CHUNK_BASE64_SIZE) {
      emitNdjson(controller, encoder, {
        type: 'image-chunk',
        id: imageId,
        data: base64.slice(offset, offset + IMAGE_CHUNK_BASE64_SIZE),
      })
    }

    emitNdjson(controller, encoder, {
      type: 'image-end',
      id: imageId,
    })
  }
}

function createGenerateErrorResponse(error) {
  const message = error instanceof Error ? error.message : String(error)
  return new Response(JSON.stringify({
    error: {
      message,
    },
  }), {
    status: getErrorStatus(message),
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, max-age=0',
    },
  })
}

function createEnhancedGenerateResponse(request) {
  const encoder = new TextEncoder()
  let finished = false
  let heartbeatTimer = null
  const clearHeartbeat = () => {
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  return new Response(new ReadableStream({
    start(controller) {
      const closeStream = () => {
        if (finished) {
          return
        }
        finished = true
        clearHeartbeat()
        controller.close()
      }
      const emit = (payload) => {
        if (finished) {
          return
        }
        emitNdjson(controller, encoder, payload)
      }

      emit({
        type: 'accepted',
        at: new Date().toISOString(),
      })

      heartbeatTimer = setInterval(() => {
        emit({
          type: 'heartbeat',
          at: new Date().toISOString(),
        })
      }, HEARTBEAT_INTERVAL_MS)

      void (async () => {
        try {
          const result = await processGenerateRequest(request, {
            skipResponseSizeLimit: true,
          })
          if (finished) {
            return
          }
          streamGeneratedImages(controller, encoder, result)
          emit({
            type: 'result',
            data: {
              ...result,
              images: [],
            },
          })
        } catch (error) {
          if (!finished) {
            const message = error instanceof Error ? error.message : String(error)
            emit({
              type: 'error',
              status: getErrorStatus(message),
              message,
            })
          }
        } finally {
          closeStream()
        }
      })()
    },
    cancel() {
      finished = true
      clearHeartbeat()
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

    try {
      return createEnhancedGenerateResponse(request)
    } catch (error) {
      return createGenerateErrorResponse(error)
    }
  },
}
