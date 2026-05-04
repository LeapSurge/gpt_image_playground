import { beforeEach, describe, expect, it, vi } from 'vitest'

const { processGenerateRequestMock } = vi.hoisted(() => ({
  processGenerateRequestMock: vi.fn(),
}))

vi.mock('../server/gateway.js', () => ({
  processGenerateRequest: processGenerateRequestMock,
}))

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createRequest() {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: 'prompt',
      params: {
        size: '1024x1024',
        quality: 'auto',
        output_format: 'png',
        moderation: 'auto',
        n: 1,
      },
      inputImageDataUrls: [],
    }),
  })
}

describe('api/generate', () => {
  beforeEach(() => {
    processGenerateRequestMock.mockReset()
    vi.resetModules()
  })

  it('waits for the generate result before returning the response stream', async () => {
    const deferred = createDeferred<{
      images: string[]
      provider: { key: string; label: string; kind: 'openai'; model: string }
    }>()
    processGenerateRequestMock.mockReturnValueOnce(deferred.promise)

    const handlerPromise = import('./generate.js').then(({ default: handler }) => handler.fetch(createRequest()))
    let settled = false
    void handlerPromise.then(() => {
      settled = true
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)

    deferred.resolve({
      images: ['data:image/png;base64,aW1hZ2U='],
      provider: {
        key: 'primary',
        label: 'xtoken-primary',
        kind: 'openai',
        model: 'gpt-image-2',
      },
    })

    const response = await handlerPromise
    expect(response.status).toBe(200)

    const body = await response.text()
    expect(body).toContain('"type":"image-start"')
    expect(body).toContain('"type":"image-chunk"')
    expect(body).toContain('"type":"result"')
    expect(body).not.toContain('"type":"accepted"')
    expect(body).not.toContain('"type":"heartbeat"')
  })

  it('returns a 502 json error when generation fails before streaming starts', async () => {
    processGenerateRequestMock.mockRejectedValueOnce(new Error('所有上游都失败了：xtoken-primary: Upstream request failed'))

    const { default: handler } = await import('./generate.js')
    const response = await handler.fetch(createRequest())

    expect(response.status).toBe(502)
    await expect(response.json()).resolves.toEqual({
      error: {
        message: '所有上游都失败了：xtoken-primary: Upstream request failed',
      },
    })
  })
})
