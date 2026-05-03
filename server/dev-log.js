import { appendFile } from 'node:fs/promises'
import path from 'node:path'

const DEV_LOG_PATH = path.resolve(process.cwd(), '.dev-server.log')
let processHooksInstalled = false

function readFlag(name, fallback) {
  const value = process.env[name]
  if (typeof value !== 'string' || !value.trim()) return fallback
  return value.trim()
}

export function isDevLogEnabled() {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return false
  return readFlag('MANAGED_GATEWAY_DEV_LOG', process.env.NODE_ENV === 'production' ? '0' : '1') === '1'
}

export function createDevRequestId(prefix = 'req') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

export function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    }
  }
  return {
    message: String(error),
  }
}

export function devLog(scope, event, meta = {}) {
  if (!isDevLogEnabled()) return

  const payload = {
    ts: new Date().toISOString(),
    scope,
    event,
    ...meta,
  }

  const line = JSON.stringify(payload)
  console.info(`[dev-log] ${scope} ${event} ${line}`)
  appendFile(DEV_LOG_PATH, `${line}\n`, 'utf8').catch(() => {})
}

export function installDevProcessLogging() {
  if (!isDevLogEnabled() || processHooksInstalled) return
  processHooksInstalled = true

  process.on('uncaughtException', (error) => {
    devLog('process', 'uncaught-exception', {
      error: serializeError(error),
    })
  })

  process.on('unhandledRejection', (reason) => {
    devLog('process', 'unhandled-rejection', {
      error: serializeError(reason),
    })
  })

  process.on('exit', (code) => {
    devLog('process', 'exit', {
      code,
    })
  })

  process.on('beforeExit', (code) => {
    devLog('process', 'before-exit', {
      code,
    })
  })
}
