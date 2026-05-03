import type {
  ManagedGatewayGenerateRequest,
  ManagedGatewayGenerateResponse,
  ManagedSessionState,
} from '../types'
import type { CallApiOptions, CallApiResult } from './imageApiShared'
import {
  assertImageInputPayloadSize,
  getApiErrorMessage,
  getDataUrlEncodedByteSize,
} from './imageApiShared'

const MANAGED_GATEWAY_MAX_REQUEST_BYTES = 4 * 1024 * 1024

interface ManagedGatewayStreamResult {
  type: 'result'
  data: ManagedGatewayGenerateResponse
}

interface ManagedGatewayStreamError {
  type: 'error'
  status?: number
  message?: string
}

interface ManagedGatewayStreamHeartbeat {
  type: 'accepted' | 'heartbeat'
}

type ManagedGatewayStreamMessage =
  | ManagedGatewayStreamResult
  | ManagedGatewayStreamError
  | ManagedGatewayStreamHeartbeat

function normalizeManagedGatewayNetworkError(error: unknown, path: string) {
  if (error instanceof Error) {
    const message = error.message.trim()
    if (/networkerror|failed to fetch|fetch failed|load failed|network request failed/i.test(message)) {
      return new Error(
        `网络请求失败：浏览器在等待 ${path} 响应时连接被中断。` +
        '本地开发环境请查看项目根目录的 .dev-server.log，重点搜索最近一次 provider attempt-failed、generate request-error 或 dev-api request-finish。',
      )
    }
  }
  return error instanceof Error ? error : new Error(String(error))
}

async function fetchManagedGateway(input: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    throw normalizeManagedGatewayNetworkError(error, input)
  }
}

async function readManagedGatewayGenerateResponse(response: Response): Promise<ManagedGatewayGenerateResponse> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!/application\/x-ndjson/i.test(contentType)) {
    return response.json() as Promise<ManagedGatewayGenerateResponse>
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('流式响应没有可读数据')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let finalResult: ManagedGatewayGenerateResponse | null = null

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIndex = buffer.indexOf('\n')
    while (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      newlineIndex = buffer.indexOf('\n')
      if (!line) continue

      const payload = JSON.parse(line) as ManagedGatewayStreamMessage
      if (payload.type === 'result') {
        finalResult = payload.data
        continue
      }
      if (payload.type === 'error') {
        throw new Error(payload.message || '长请求处理失败')
      }
    }
  }

  if (!finalResult) {
    throw new Error('长请求未返回最终结果')
  }
  return finalResult
}

function normalizeManagedSession(payload: unknown): ManagedSessionState {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const customer = record.customer && typeof record.customer === 'object'
    ? record.customer as Record<string, unknown>
    : null
  const trial = record.trial && typeof record.trial === 'object'
    ? record.trial as Record<string, unknown>
    : null

  const normalizedTrial = trial
    ? {
        remainingCredits: Number(trial.remainingCredits ?? 0),
        limit: Number(trial.limit ?? 0),
        resetAt: typeof trial.resetAt === 'string' ? trial.resetAt : null,
      }
    : null

  if (!customer) {
    return {
      status: 'anonymous',
      customer: null,
      expiresAt: null,
      trial: normalizedTrial,
    }
  }

  return {
    status: 'authenticated',
    customer: {
      id: String(customer.id ?? ''),
      email: String(customer.email ?? ''),
      name: String(customer.name ?? ''),
      remainingCredits: Number(customer.remainingCredits ?? 0),
      status: customer.status === 'disabled' ? 'disabled' : 'active',
    },
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
    trial: normalizedTrial,
  }
}

function assertManagedGatewayRequestSize(body: ManagedGatewayGenerateRequest) {
  const imagePayloadBytes =
    body.inputImageDataUrls.reduce((sum, dataUrl) => sum + getDataUrlEncodedByteSize(dataUrl), 0) +
    (body.maskDataUrl ? getDataUrlEncodedByteSize(body.maskDataUrl) : 0)

  assertImageInputPayloadSize(imagePayloadBytes)

  const serialized = JSON.stringify(body)
  const totalBytes = new TextEncoder().encode(serialized).byteLength
  if (totalBytes > MANAGED_GATEWAY_MAX_REQUEST_BYTES) {
    throw new Error('参考图请求体过大：当前托管网关无法处理，请减少参考图数量或改用更小的图片。')
  }
}

export async function fetchManagedSession(): Promise<ManagedSessionState> {
  const response = await fetchManagedGateway('/api/session', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return normalizeManagedSession(await response.json())
}

export async function loginManagedSession(email: string, accessCode: string): Promise<ManagedSessionState> {
  const response = await fetchManagedGateway('/api/login', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, accessCode }),
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return normalizeManagedSession(await response.json())
}

export async function redeemManagedSession(accessCode: string): Promise<ManagedSessionState> {
  const response = await fetchManagedGateway('/api/redeem', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ accessCode }),
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  return normalizeManagedSession(await response.json())
}

export async function logoutManagedSession(): Promise<void> {
  const response = await fetchManagedGateway('/api/logout', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }
}

export async function callManagedGatewayApi(opts: CallApiOptions): Promise<CallApiResult> {
  const body: ManagedGatewayGenerateRequest = {
    prompt: opts.prompt,
    params: {
      ...opts.params,
      n: 1,
    },
    inputImageDataUrls: opts.inputImageDataUrls,
    ...(opts.maskDataUrl ? { maskDataUrl: opts.maskDataUrl } : {}),
  }

  assertManagedGatewayRequestSize(body)

  const response = await fetchManagedGateway('/api/generate', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }

  const payload = await readManagedGatewayGenerateResponse(response)
  return {
    images: payload.images,
    actualParams: payload.actualParams,
    actualParamsList: payload.actualParamsList,
    revisedPrompts: payload.revisedPrompts,
    providerInfo: payload.provider,
    remainingCredits: payload.remainingCredits,
    anonymousTrial: payload.anonymousTrial,
  }
}
