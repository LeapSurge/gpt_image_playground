import { assertManagedGatewayConfig, getManagedGatewayConfig } from './config.js'
import { getSessionFromRequest } from './auth.js'
import { randomId } from './ids.js'
import { readJsonBody } from './json.js'
import { invokeOpenAICompatibleProvider } from './providers/openai-compatible.js'
import { getManagedGatewayStore } from './store/index.js'

function validateGenerateRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('请求体不能为空')
  }
  if (typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
    throw new Error('缺少提示词')
  }
  if (!payload.params || typeof payload.params !== 'object') {
    throw new Error('缺少生成参数')
  }
  if (!Array.isArray(payload.inputImageDataUrls)) {
    throw new Error('输入图片格式无效')
  }

  return {
    prompt: payload.prompt.trim(),
    params: {
      ...payload.params,
      n: 1,
    },
    inputImageDataUrls: payload.inputImageDataUrls.filter((item) => typeof item === 'string'),
    maskDataUrl: typeof payload.maskDataUrl === 'string' ? payload.maskDataUrl : undefined,
  }
}

function getInputImageByteSize(request) {
  const encoder = new TextEncoder()
  return request.inputImageDataUrls.reduce((sum, dataUrl) => sum + encoder.encode(dataUrl).byteLength, 0) +
    (request.maskDataUrl ? encoder.encode(request.maskDataUrl).byteLength : 0)
}

function buildPromptPreview(prompt) {
  return prompt.length > 160 ? `${prompt.slice(0, 157)}...` : prompt
}

function getGenerateResponseByteSize(result, remainingCredits) {
  const encoder = new TextEncoder()
  return encoder.encode(JSON.stringify({
    ...result,
    remainingCredits,
  })).byteLength
}

export async function processGenerateRequest(request) {
  const config = getManagedGatewayConfig()
  assertManagedGatewayConfig(config)
  const session = await getSessionFromRequest(request)
  if (!session) {
    throw new Error('登录状态已失效，请重新登录')
  }

  if (session.customer.remainingCredits < config.creditsPerRequest) {
    throw new Error('当前账号额度不足，请联系管理员充值')
  }

  const payload = validateGenerateRequest(await readJsonBody(request, config.maxRequestBodyBytes))
  if (getInputImageByteSize(payload) > config.maxInputImageBytes) {
    throw new Error('参考图请求体过大：当前托管网关无法处理，请减少参考图数量或改用更小的图片。')
  }

  const store = getManagedGatewayStore()
  const attemptErrors = []

  for (const provider of config.providers) {
    try {
      const result = await invokeOpenAICompatibleProvider(provider, payload)
      const estimatedRemainingCredits = Math.max(0, session.customer.remainingCredits - config.creditsPerRequest)
      if (getGenerateResponseByteSize(result, estimatedRemainingCredits) > config.maxRequestBodyBytes) {
        throw new Error('生成结果过大：当前托管网关无法安全返回该图片，请降低尺寸或质量后重试。')
      }

      let customer
      try {
        customer = await store.consumeCreditsAndLog({
          customerId: session.customer.id,
          credits: config.creditsPerRequest,
          usageLog: {
            id: randomId('usage'),
            providerKey: provider.key,
            providerLabel: provider.label,
            providerModel: provider.model,
            imageCount: result.images.length,
            promptPreview: buildPromptPreview(payload.prompt),
          },
        })
      } catch (billingError) {
        await store.recordFailedUsage({
          customerId: session.customer.id,
          usageLog: {
            id: randomId('usage'),
            providerKey: provider.key,
            providerLabel: provider.label,
            providerModel: provider.model,
            imageCount: result.images.length,
            promptPreview: buildPromptPreview(payload.prompt),
            errorMessage: billingError instanceof Error ? billingError.message : String(billingError),
          },
        })
        throw new Error('图片已生成，但额度记账失败；为避免重复生成，本次不会自动切换到备用线路，请稍后重试或联系管理员。')
      }

      return {
        ...result,
        remainingCredits: customer.remainingCredits,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/额度记账失败|生成结果过大/.test(message)) {
        throw error
      }
      attemptErrors.push(`${provider.label}: ${message}`)
      await store.recordFailedUsage({
        customerId: session.customer.id,
        usageLog: {
          id: randomId('usage'),
          providerKey: provider.key,
          providerLabel: provider.label,
          providerModel: provider.model,
          imageCount: 0,
          promptPreview: buildPromptPreview(payload.prompt),
          errorMessage: message,
        },
      })
    }
  }

  throw new Error(attemptErrors.length ? `所有上游都失败了：${attemptErrors.join(' | ')}` : '没有可用的上游 Provider')
}
