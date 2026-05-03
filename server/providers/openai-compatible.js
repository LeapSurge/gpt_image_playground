import { devLog, serializeError } from '../dev-log.js'

const MIME_MAP = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

function normalizeBase64Image(value, fallbackMime) {
  return value.startsWith('data:') ? value : `data:${fallbackMime};base64,${value}`
}

async function getApiErrorMessage(response) {
  let errorMsg = `HTTP ${response.status}`
  try {
    const errJson = await response.json()
    if (errJson.error?.message) errorMsg = errJson.error.message
    else if (typeof errJson.detail === 'string') errorMsg = errJson.detail
    else if (typeof errJson.error === 'string') errorMsg = errJson.error
    else if (typeof errJson.message === 'string') errorMsg = errJson.message
  } catch {
    try {
      errorMsg = await response.text()
    } catch {
      /* noop */
    }
  }
  return errorMsg
}

function pickActualParams(source) {
  if (!source || typeof source !== 'object') return {}
  const actualParams = {}
  if (typeof source.size === 'string') actualParams.size = source.size
  if (['auto', 'low', 'medium', 'high'].includes(source.quality)) actualParams.quality = source.quality
  if (['png', 'jpeg', 'webp'].includes(source.output_format)) actualParams.output_format = source.output_format
  if (typeof source.output_compression === 'number') actualParams.output_compression = source.output_compression
  if (['auto', 'low'].includes(source.moderation)) actualParams.moderation = source.moderation
  if (typeof source.n === 'number') actualParams.n = source.n
  return actualParams
}

function mergeActualParams(...sources) {
  const merged = Object.assign({}, ...sources.filter((source) => source && Object.keys(source).length))
  return Object.keys(merged).length ? merged : undefined
}

async function fetchImageUrlAsDataUrl(url, fallbackMime, signal) {
  if (url.startsWith('data:')) return url
  const response = await fetch(url, { cache: 'no-store', signal })
  if (!response.ok) {
    throw new Error(`图片 URL 下载失败：HTTP ${response.status}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')
  return `data:${response.headers.get('content-type') || fallbackMime};base64,${base64}`
}

async function dataUrlToBlob(dataUrl, fallbackType = 'image/png') {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  return blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: fallbackType })
}

export async function invokeOpenAICompatibleProvider(provider, request, context = {}) {
  const params = {
    ...request.params,
    n: 1,
  }
  const prompt = request.prompt
  const isEdit = request.inputImageDataUrls.length > 0
  const mime = MIME_MAP[params.output_format] || 'image/png'
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), provider.timeoutSeconds * 1000)
  const startedAt = Date.now()

  try {
    devLog('provider', 'attempt-start', {
      requestId: context.requestId ?? null,
      providerKey: provider.key,
      providerLabel: provider.label,
      providerModel: provider.model,
      isEdit,
      timeoutSeconds: provider.timeoutSeconds,
      promptLength: prompt.length,
    })

    let response
    if (isEdit) {
      const formData = new FormData()
      formData.append('model', provider.model)
      formData.append('prompt', prompt)
      formData.append('size', params.size)
      formData.append('quality', params.quality)
      formData.append('output_format', params.output_format)
      formData.append('moderation', params.moderation)

      if (params.output_format !== 'png' && params.output_compression != null) {
        formData.append('output_compression', String(params.output_compression))
      }

      for (let index = 0; index < request.inputImageDataUrls.length; index += 1) {
        const blob = await dataUrlToBlob(request.inputImageDataUrls[index])
        const ext = blob.type.split('/')[1] || 'png'
        formData.append('image[]', blob, `input-${index + 1}.${ext}`)
      }

      if (request.maskDataUrl) {
        const maskBlob = await dataUrlToBlob(request.maskDataUrl, 'image/png')
        formData.append('mask', maskBlob, 'mask.png')
      }

      response = await fetch(`${provider.baseUrl}/images/edits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Cache-Control': 'no-store, no-cache, max-age=0',
          Pragma: 'no-cache',
        },
        cache: 'no-store',
        body: formData,
        signal: controller.signal,
      })
    } else {
      response = await fetch(`${provider.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          'Cache-Control': 'no-store, no-cache, max-age=0',
          Pragma: 'no-cache',
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          model: provider.model,
          prompt,
          size: params.size,
          quality: params.quality,
          output_format: params.output_format,
          moderation: params.moderation,
        }),
        signal: controller.signal,
      })
    }

    if (!response.ok) {
      devLog('provider', 'attempt-http-error', {
        requestId: context.requestId ?? null,
        providerKey: provider.key,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
      })
      throw new Error(await getApiErrorMessage(response))
    }

    const payload = await response.json()
    const data = Array.isArray(payload.data) ? payload.data : []
    if (!data.length) {
      throw new Error('接口未返回图片数据')
    }

    const images = []
    const revisedPrompts = []
    for (const item of data) {
      if (typeof item.b64_json === 'string' && item.b64_json.trim()) {
        images.push(normalizeBase64Image(item.b64_json, mime))
        revisedPrompts.push(typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined)
        continue
      }
      if (typeof item.url === 'string' && item.url.trim()) {
        images.push(await fetchImageUrlAsDataUrl(item.url, mime, controller.signal))
        revisedPrompts.push(typeof item.revised_prompt === 'string' ? item.revised_prompt : undefined)
      }
    }

    if (!images.length) {
      throw new Error('接口未返回可用图片数据')
    }

    const actualParams = mergeActualParams(pickActualParams(payload))
    devLog('provider', 'attempt-success', {
      requestId: context.requestId ?? null,
      providerKey: provider.key,
      providerLabel: provider.label,
      providerModel: provider.model,
      elapsedMs: Date.now() - startedAt,
      imageCount: images.length,
      actualParams,
    })
    return {
      images,
      actualParams,
      actualParamsList: images.map(() => actualParams),
      revisedPrompts,
      provider: {
        key: provider.key,
        label: provider.label,
        kind: 'openai',
        model: provider.model,
      },
    }
  } catch (error) {
    devLog('provider', 'attempt-failed', {
      requestId: context.requestId ?? null,
      providerKey: provider.key,
      providerLabel: provider.label,
      providerModel: provider.model,
      elapsedMs: Date.now() - startedAt,
      error: serializeError(error),
    })
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
