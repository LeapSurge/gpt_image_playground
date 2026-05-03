import { createRequire } from 'node:module'
import { getManagedGatewayConfig } from '../config.js'
import { createFileStore } from './file-store.js'
import { createNeonStore } from './neon-store.js'

let store = null
const require = createRequire(import.meta.url)

export function getManagedGatewayStore() {
  if (store) return store

  const config = getManagedGatewayConfig()
  if (process.env.DATABASE_URL) {
    const { neon } = require('@neondatabase/serverless')
    store = createNeonStore(process.env.DATABASE_URL, neon)
    return store
  }

  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    throw new Error('生产环境缺少 DATABASE_URL，托管网关拒绝回退到本地文件存储')
  }

  store = createFileStore(config.fileStorePath)
  return store
}

export function resetManagedGatewayStoreForTests() {
  store = null
}
