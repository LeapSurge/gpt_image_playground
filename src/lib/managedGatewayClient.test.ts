import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { callManagedGatewayApi } from './managedGatewayClient'

function createNdjsonResponse(lines: unknown[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const line of lines) {
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`))
      }
      controller.close()
    },
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
    },
  })
}

describe('callManagedGatewayApi', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('parses the dev streaming response and returns the final result payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createNdjsonResponse([
      { type: 'accepted', at: '2026-05-03T00:00:00.000Z' },
      { type: 'heartbeat', at: '2026-05-03T00:00:10.000Z' },
      {
        type: 'result',
        data: {
          images: ['data:image/png;base64,aW1hZ2U='],
          actualParams: { size: '1024x1024', quality: 'medium', output_format: 'png' },
          actualParamsList: [{ size: '1024x1024', quality: 'medium', output_format: 'png' }],
          revisedPrompts: ['revised prompt'],
          provider: {
            key: 'primary',
            label: 'xtoken-primary',
            kind: 'openai',
            model: 'gpt-image-2',
          },
          anonymousTrial: {
            remainingCredits: 2,
            limit: 3,
            resetAt: '2026-05-10T00:00:00.000Z',
          },
        },
      },
    ]))

    const result = await callManagedGatewayApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })

    expect(result).toMatchObject({
      images: ['data:image/png;base64,aW1hZ2U='],
      actualParams: { size: '1024x1024', quality: 'medium', output_format: 'png' },
      actualParamsList: [{ size: '1024x1024', quality: 'medium', output_format: 'png' }],
      revisedPrompts: ['revised prompt'],
      providerInfo: {
        key: 'primary',
        label: 'xtoken-primary',
        kind: 'openai',
        model: 'gpt-image-2',
      },
    })
  })

  it('surfaces the final streamed error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(createNdjsonResponse([
      { type: 'accepted', at: '2026-05-03T00:00:00.000Z' },
      { type: 'heartbeat', at: '2026-05-03T00:00:10.000Z' },
      { type: 'error', status: 502, message: '所有上游都失败了：xtoken-primary: Upstream request failed' },
    ]))

    await expect(callManagedGatewayApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })).rejects.toThrow('所有上游都失败了：xtoken-primary: Upstream request failed')
  })

  it('rewrites generic fetch network errors into a local dev diagnostic message', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(callManagedGatewayApi({
      settings: DEFAULT_SETTINGS,
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
    })).rejects.toThrow('浏览器在等待 /api/generate 响应时连接被中断')
  })
})
