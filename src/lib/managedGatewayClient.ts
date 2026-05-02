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

function normalizeManagedSession(payload: unknown): ManagedSessionState {
  const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {}
  const customer = record.customer && typeof record.customer === 'object'
    ? record.customer as Record<string, unknown>
    : null

  if (!customer) {
    return {
      status: 'anonymous',
      customer: null,
      expiresAt: null,
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
  const response = await fetch('/api/session', {
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
  const response = await fetch('/api/login', {
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

export async function logoutManagedSession(): Promise<void> {
  const response = await fetch('/api/logout', {
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

  const response = await fetch('/api/generate', {
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

  const payload = await response.json() as ManagedGatewayGenerateResponse
  return {
    images: payload.images,
    actualParams: payload.actualParams,
    actualParamsList: payload.actualParamsList,
    revisedPrompts: payload.revisedPrompts,
    providerInfo: payload.provider,
    remainingCredits: payload.remainingCredits,
  }
}
