const DEFAULT_REQUEST_TIMEOUT_SECONDS = 280
const DEFAULT_SESSION_TTL_HOURS = 24 * 30
const DEFAULT_MAX_REQUEST_BODY_BYTES = 4 * 1024 * 1024
const DEFAULT_MAX_INPUT_IMAGE_BYTES = Math.floor(3.75 * 1024 * 1024)
const DEFAULT_CREDITS_PER_REQUEST = 1
const DEFAULT_FILE_STORE_PATH = '.local-managed-gateway-store.json'

function readEnv(name, fallback = '') {
  const value = process.env[name]
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function readIntEnv(name, fallback) {
  const value = Number.parseInt(readEnv(name, ''), 10)
  return Number.isFinite(value) ? value : fallback
}

function createProviderConfig(slot) {
  const prefix = `MANAGED_GATEWAY_${slot}_`
  const baseUrl = readEnv(`${prefix}BASE_URL`, '').replace(/\/+$/, '')
  const apiKey = readEnv(`${prefix}API_KEY`, '')
  if (!baseUrl || !apiKey) return null

  return {
    key: slot.toLowerCase(),
    label: readEnv(`${prefix}LABEL`, slot === 'PRIMARY' ? '主线路' : '备用线路'),
    kind: 'openai',
    baseUrl,
    apiKey,
    model: readEnv(`${prefix}MODEL`, 'gpt-image-2'),
    timeoutSeconds: readIntEnv(`${prefix}TIMEOUT_SECONDS`, DEFAULT_REQUEST_TIMEOUT_SECONDS),
  }
}

export function getManagedGatewayConfig() {
  const providers = [createProviderConfig('PRIMARY'), createProviderConfig('SECONDARY')].filter(Boolean)

  return {
    providers,
    creditsPerRequest: readIntEnv('MANAGED_GATEWAY_CREDITS_PER_REQUEST', DEFAULT_CREDITS_PER_REQUEST),
    sessionTtlHours: readIntEnv('MANAGED_GATEWAY_SESSION_TTL_HOURS', DEFAULT_SESSION_TTL_HOURS),
    maxRequestBodyBytes: readIntEnv('MANAGED_GATEWAY_MAX_REQUEST_BODY_BYTES', DEFAULT_MAX_REQUEST_BODY_BYTES),
    maxInputImageBytes: readIntEnv('MANAGED_GATEWAY_MAX_INPUT_IMAGE_BYTES', DEFAULT_MAX_INPUT_IMAGE_BYTES),
    fileStorePath: readEnv('MANAGED_GATEWAY_FILE_STORE_PATH', DEFAULT_FILE_STORE_PATH),
    sessionSecret: readEnv(
      'MANAGED_GATEWAY_SESSION_SECRET',
      process.env.NODE_ENV === 'production' ? '' : 'managed-gateway-dev-session-secret',
    ),
  }
}

export function assertManagedGatewayConfig(config) {
  if (!config.sessionSecret) {
    throw new Error('缺少 MANAGED_GATEWAY_SESSION_SECRET')
  }
  if (!config.providers.length) {
    throw new Error('未配置任何托管网关上游，请至少设置 MANAGED_GATEWAY_PRIMARY_BASE_URL 和 MANAGED_GATEWAY_PRIMARY_API_KEY')
  }
}
