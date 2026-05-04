import { processGenerateRequest } from '../server/gateway.js'

const STREAM_HEARTBEAT_MS = 10_000
const IMAGE_CHUNK_BASE64_SIZE = 128 * 1024

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

function streamGenerateResponse(request) {
  const encoder = new TextEncoder()

  return new Response(new ReadableStream({
    start(controller) {
      emitNdjson(controller, encoder, {
        type: 'accepted',
        at: new Date().toISOString(),
      })

      const heartbeat = setInterval(() => {
        emitNdjson(controller, encoder, {
          type: 'heartbeat',
          at: new Date().toISOString(),
        })
      }, STREAM_HEARTBEAT_MS)

      void processGenerateRequest(request, {
        skipResponseSizeLimit: true,
        onGenerated(result) {
          streamGeneratedImages(controller, encoder, result)
        },
      })
        .then((result) => {
          clearInterval(heartbeat)
          emitNdjson(controller, encoder, {
            type: 'result',
            data: {
              ...result,
              images: [],
            },
          })
          controller.close()
        })
        .catch((error) => {
          clearInterval(heartbeat)
          const message = error instanceof Error ? error.message : String(error)
          emitNdjson(controller, encoder, {
            type: 'error',
            status: getErrorStatus(message),
            message,
          })
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
