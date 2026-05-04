import { assertManagedGatewayConfig, getManagedGatewayConfig } from './config.js'
import { createDevRequestId, devLog, serializeError } from './dev-log.js'
import { getSessionFromRequest } from './auth.js'
import { randomId } from './ids.js'
import { readJsonBody } from './json.js'
import { invokeOpenAICompatibleProvider } from './providers/openai-compatible.js'
import { getManagedGatewayStore } from './store/index.js'
import { consumeAnonymousTrial, getAnonymousTrialState } from './trial.js'

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

async function finalizeSuccessfulGenerate({
  store,
  customer,
  request,
  config,
  provider,
  result,
  requestId,
  startedAt,
  promptPreview,
}) {
  if (customer) {
    let billedCustomer
    try {
      billedCustomer = await store.consumeCreditsAndLog({
        customerId: customer.id,
        credits: config.creditsPerRequest,
        usageLog: {
          id: randomId('usage'),
          providerKey: provider.key,
          providerLabel: provider.label,
          providerModel: provider.model,
          imageCount: result.images.length,
          promptPreview,
        },
      })
    } catch (billingError) {
      await store.recordFailedUsage({
        customerId: customer.id,
        usageLog: {
          id: randomId('usage'),
          providerKey: provider.key,
          providerLabel: provider.label,
          providerModel: provider.model,
          imageCount: result.images.length,
          promptPreview,
          errorMessage: billingError instanceof Error ? billingError.message : String(billingError),
        },
      })
      throw new Error('图片已生成，但额度记账失败；为避免重复生成，本次不会自动切换到备用线路，请稍后重试或联系客服。')
    }

    devLog('generate', 'request-success', {
      requestId,
      authenticated: true,
      customerId: customer.id,
      providerKey: provider.key,
      providerLabel: provider.label,
      imageCount: result.images.length,
      remainingCredits: billedCustomer.remainingCredits,
      elapsedMs: Date.now() - startedAt,
    })
    return {
      ...result,
      remainingCredits: billedCustomer.remainingCredits,
    }
  }

  try {
    const trialState = await consumeAnonymousTrial(request)
    await store.recordAnonymousUsage({
      usageLog: {
        id: randomId('usage'),
        providerKey: provider.key,
        providerLabel: provider.label,
        providerModel: provider.model,
        imageCount: result.images.length,
        status: 'success',
        promptPreview,
        trialRemaining: trialState.remainingCredits,
      },
    })
    devLog('generate', 'request-success', {
      requestId,
      authenticated: false,
      providerKey: provider.key,
      providerLabel: provider.label,
      imageCount: result.images.length,
      trialRemaining: trialState.remainingCredits,
      elapsedMs: Date.now() - startedAt,
    })
    return {
      ...result,
      anonymousTrial: trialState,
    }
  } catch {
    throw new Error('图片已生成，但试用额度记账失败；为避免重复生成，本次不会自动切换到备用线路，请稍后重试或登录后继续。')
  }
}

export async function processGenerateRequest(request, options = {}) {
  const requestId = request.headers.get('x-request-id') || createDevRequestId('gen')
  const startedAt = Date.now()
  const config = getManagedGatewayConfig()
  assertManagedGatewayConfig(config)
  try {
    const session = await getSessionFromRequest(request)
    const customer = session?.customer ?? null
    const anonymousTrial = customer ? null : await getAnonymousTrialState(request)

    if (!customer && (!anonymousTrial || anonymousTrial.remainingCredits <= 0)) {
      throw new Error('试用已用完，请购买或输入兑换码继续生成')
    }

    if (customer && customer.remainingCredits < config.creditsPerRequest) {
      throw new Error('额度已用完，请购买更多额度或联系客服')
    }

    const payload = validateGenerateRequest(await readJsonBody(request, config.maxRequestBodyBytes))
    const inputBytes = getInputImageByteSize(payload)
    devLog('generate', 'request-ready', {
      requestId,
      authenticated: Boolean(customer),
      customerId: customer?.id ?? null,
      customerEmail: customer?.email ?? null,
      trialRemaining: anonymousTrial?.remainingCredits ?? null,
      promptLength: payload.prompt.length,
      promptPreview: buildPromptPreview(payload.prompt),
      inputImageCount: payload.inputImageDataUrls.length,
      hasMask: Boolean(payload.maskDataUrl),
      inputBytes,
      params: payload.params,
    })

    if (inputBytes > config.maxInputImageBytes) {
      throw new Error('参考图请求体过大：当前托管网关无法处理，请减少参考图数量或改用更小的图片。')
    }

    const store = getManagedGatewayStore()
    const attemptErrors = []
    const promptPreview = buildPromptPreview(payload.prompt)

    for (const provider of config.providers) {
      try {
        const result = await invokeOpenAICompatibleProvider(provider, payload, { requestId })
        const estimatedRemainingCredits = customer
          ? Math.max(0, customer.remainingCredits - config.creditsPerRequest)
          : undefined
        if (
          !options.skipResponseSizeLimit &&
          getGenerateResponseByteSize(result, estimatedRemainingCredits) > config.maxRequestBodyBytes
        ) {
          throw new Error('生成结果过大：当前托管网关无法安全返回该图片，请降低尺寸或质量后重试。')
        }
        return await finalizeSuccessfulGenerate({
          store,
          customer,
          request,
          config,
          provider,
          result,
          requestId,
          startedAt,
          promptPreview,
        })
      } catch (providerError) {
        const message = providerError instanceof Error ? providerError.message : String(providerError)
        if (/额度记账失败|试用额度记账失败|生成结果过大/.test(message)) {
          throw providerError
        }
        attemptErrors.push(`${provider.label}: ${message}`)
        if (customer) {
          await store.recordFailedUsage({
            customerId: customer.id,
            usageLog: {
              id: randomId('usage'),
              providerKey: provider.key,
              providerLabel: provider.label,
              providerModel: provider.model,
              imageCount: 0,
              promptPreview,
              errorMessage: message,
            },
          })
        }
        }
      }

      if (!customer) {
        await store.recordAnonymousUsage({
          usageLog: {
            id: randomId('usage'),
            providerKey: 'all-providers',
            providerLabel: 'All providers',
            providerModel: '-',
            imageCount: 0,
            status: 'failed',
            promptPreview,
            errorMessage: attemptErrors.join(' | '),
            trialRemaining: anonymousTrial?.remainingCredits ?? null,
          },
        })
      }
      throw new Error(attemptErrors.length ? `所有上游都失败了：${attemptErrors.join(' | ')}` : '没有可用的上游 Provider')
  } catch (error) {
    devLog('generate', 'request-error', {
      requestId,
      elapsedMs: Date.now() - startedAt,
      error: serializeError(error),
    })
    throw error
  }
}
