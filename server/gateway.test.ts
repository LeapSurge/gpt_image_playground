import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getManagedGatewayConfig: vi.fn(),
  assertManagedGatewayConfig: vi.fn(),
  getSessionFromRequest: vi.fn(),
  readJsonBody: vi.fn(),
  invokeOpenAICompatibleProvider: vi.fn(),
  getManagedGatewayStore: vi.fn(),
  getAnonymousTrialState: vi.fn(),
  consumeAnonymousTrial: vi.fn(),
}))

vi.mock('./config.js', () => ({
  getManagedGatewayConfig: mocks.getManagedGatewayConfig,
  assertManagedGatewayConfig: mocks.assertManagedGatewayConfig,
}))

vi.mock('./auth.js', () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}))

vi.mock('./json.js', () => ({
  readJsonBody: mocks.readJsonBody,
}))

vi.mock('./providers/openai-compatible.js', () => ({
  invokeOpenAICompatibleProvider: mocks.invokeOpenAICompatibleProvider,
}))

vi.mock('./store/index.js', () => ({
  getManagedGatewayStore: mocks.getManagedGatewayStore,
}))

vi.mock('./trial.js', () => ({
  getAnonymousTrialState: mocks.getAnonymousTrialState,
  consumeAnonymousTrial: mocks.consumeAnonymousTrial,
}))

describe('processGenerateRequest', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.values(mocks).forEach((mock) => mock.mockReset())

    mocks.getManagedGatewayConfig.mockReturnValue({
      providers: [
        {
          key: 'primary',
          label: 'xtoken-primary',
          model: 'gpt-image-2',
          supportsEdits: false,
        },
      ],
      creditsPerRequest: 1,
      maxRequestBodyBytes: 4 * 1024 * 1024,
      maxInputImageBytes: 4 * 1024 * 1024,
    })
    mocks.assertManagedGatewayConfig.mockReturnValue(undefined)
    mocks.getSessionFromRequest.mockResolvedValue({
      customer: {
        id: 'customer_1',
        email: 'demo@example.com',
        remainingCredits: 10,
      },
    })
    mocks.readJsonBody.mockResolvedValue({
      prompt: 'edit this image',
      params: {
        size: '1024x1024',
        quality: 'auto',
        output_format: 'png',
        moderation: 'auto',
        n: 1,
      },
      inputImageDataUrls: ['data:image/png;base64,AAAA'],
    })
    mocks.getManagedGatewayStore.mockReturnValue({})
  })

  it('fails early with a clear message when no configured provider supports image edits', async () => {
    const { processGenerateRequest } = await import('./gateway.js')

    await expect(processGenerateRequest(new Request('http://localhost/api/generate')))
      .rejects
      .toThrow('当前上游暂不支持参考图编辑（图生图），请移除参考图后重试，或切换到支持 images/edits 的上游。')

    expect(mocks.invokeOpenAICompatibleProvider).not.toHaveBeenCalled()
  })
})
