import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

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

function createRequest(size: string) {
  return new Request('http://localhost/api/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: 'prompt',
      params: {
        size,
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

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns JSON for 1K-class requests after generation resolves', async () => {
    const deferred = createDeferred<{
      images: string[]
      provider: { key: string; label: string; kind: 'openai'; model: string }
    }>()
    processGenerateRequestMock.mockReturnValueOnce(deferred.promise)

    const handlerPromise = import('./generate.js').then(({ default: handler }) => handler.fetch(createRequest('1024x1024')))
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
    expect(response.headers.get('content-type')).toContain('application/json')

    const body = await response.json()
    expect(body).toMatchObject({
      images: ['data:image/png;base64,aW1hZ2U='],
      provider: {
        key: 'primary',
        label: 'xtoken-primary',
        kind: 'openai',
        model: 'gpt-image-2',
      },
    })
  })

  it('returns NDJSON immediately for 2K+ requests and emits heartbeat before the final result', async () => {
    vi.useFakeTimers()

    const deferred = createDeferred<{
      images: string[]
      provider: { key: string; label: string; kind: 'openai'; model: string }
    }>()
    processGenerateRequestMock.mockReturnValueOnce(deferred.promise)

    const handlerPromise = import('./generate.js').then(({ default: handler }) => handler.fetch(createRequest('2048x2048')))

    const response = await handlerPromise
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')

    const bodyPromise = response.text()
    await vi.advanceTimersByTimeAsync(10_000)

    deferred.resolve({
      images: ['data:image/png;base64,aW1hZ2U='],
      provider: {
        key: 'primary',
        label: 'xtoken-primary',
        kind: 'openai',
        model: 'gpt-image-2',
      },
    })

    const body = await bodyPromise
    expect(body).toContain('"type":"accepted"')
    expect(body).toContain('"type":"heartbeat"')
    expect(body).toContain('"type":"image-start"')
    expect(body).toContain('"type":"image-chunk"')
    expect(body).toContain('"type":"image-end"')
    expect(body).toContain('"type":"result"')
  })

  it('streams an error event when a 2K+ request fails after the stream starts', async () => {
    const deferred = createDeferred<never>()
    processGenerateRequestMock.mockReturnValueOnce(deferred.promise)

    const handlerPromise = import('./generate.js').then(({ default: handler }) => handler.fetch(createRequest('2048x2048')))
    const response = await handlerPromise

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/x-ndjson')

    const bodyPromise = response.text()
    deferred.reject(new Error('所有上游都失败了：xtoken-primary: Upstream request failed'))

    const body = await bodyPromise
    expect(body).toContain('"type":"accepted"')
    expect(body).toContain('"type":"error"')
    expect(body).toContain('"status":502')
    expect(body).toContain('所有上游都失败了：xtoken-primary: Upstream request failed')
  })
})
