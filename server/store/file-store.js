import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomId } from '../ids.js'

function createEmptyState() {
  return {
    customers: [],
    sessions: [],
    usageLogs: [],
    quotaGrants: [],
  }
}

function toPublicCustomer(customer) {
  return {
    id: customer.id,
    email: customer.email,
    name: customer.name,
    remainingCredits: customer.remainingCredits,
    status: customer.status,
  }
}

export function createFileStore(filePath) {
  let writeChain = Promise.resolve()

  async function ensureFileState() {
    try {
      const raw = await readFile(filePath, 'utf8')
      const parsed = JSON.parse(raw)
      return {
        ...createEmptyState(),
        ...parsed,
      }
    } catch (error) {
      if (error && typeof error === 'object' && error.code === 'ENOENT') {
        await mkdir(path.dirname(path.resolve(filePath)), { recursive: true })
        const state = createEmptyState()
        await writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
        return state
      }
      throw error
    }
  }

  async function writeState(state) {
    await writeFile(filePath, JSON.stringify(state, null, 2), 'utf8')
  }

  function queueWrite(work) {
    const next = writeChain.then(async () => {
      const state = await ensureFileState()
      const result = await work(state)
      await writeState(state)
      return result
    })
    writeChain = next.catch(() => undefined)
    return next
  }

  async function readOnly(work) {
    const state = await ensureFileState()
    return work(state)
  }

  return {
    async authenticateCustomer(email, accessCodeHash) {
      return readOnly((state) => {
        const customer = state.customers.find((item) =>
          item.email.toLowerCase() === email.toLowerCase() &&
          item.accessCodeHash === accessCodeHash &&
          item.status === 'active',
        )
        return customer ? toPublicCustomer(customer) : null
      })
    },

    async createCustomer({ email, name, accessCodeHash, remainingCredits }) {
      return queueWrite((state) => {
        const normalizedEmail = email.toLowerCase()
        if (state.customers.some((item) => item.email.toLowerCase() === normalizedEmail)) {
          throw new Error('客户邮箱已存在')
        }
        const customer = {
          id: randomId('customer'),
          email: normalizedEmail,
          name,
          accessCodeHash,
          remainingCredits,
          status: 'active',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
        state.customers.push(customer)
        return toPublicCustomer(customer)
      })
    },

    async listCustomers() {
      return readOnly((state) => state.customers.map(toPublicCustomer))
    },

    async createSession({ customerId, tokenHash, expiresAt }) {
      return queueWrite((state) => {
        const session = {
          id: randomId('session'),
          customerId,
          tokenHash,
          expiresAt,
          revokedAt: null,
          createdAt: new Date().toISOString(),
        }
        state.sessions.push(session)
        return session
      })
    },

    async getSessionWithCustomer(tokenHash) {
      return readOnly((state) => {
        const now = Date.now()
        const session = state.sessions.find((item) =>
          item.tokenHash === tokenHash &&
          !item.revokedAt &&
          new Date(item.expiresAt).getTime() > now,
        )
        if (!session) return null
        const customer = state.customers.find((item) => item.id === session.customerId)
        if (!customer || customer.status !== 'active') return null
        return {
          session,
          customer: toPublicCustomer(customer),
        }
      })
    },

    async revokeSession(tokenHash) {
      return queueWrite((state) => {
        const session = state.sessions.find((item) => item.tokenHash === tokenHash && !item.revokedAt)
        if (session) {
          session.revokedAt = new Date().toISOString()
        }
      })
    },

    async consumeCreditsAndLog({ customerId, credits, usageLog }) {
      return queueWrite((state) => {
        const customer = state.customers.find((item) => item.id === customerId && item.status === 'active')
        if (!customer) throw new Error('客户不存在')
        if (customer.remainingCredits < credits) {
          throw new Error('额度不足')
        }
        customer.remainingCredits -= credits
        customer.updatedAt = new Date().toISOString()
        state.usageLogs.push({
          id: usageLog.id,
          customerId,
          creditsDelta: -credits,
          providerKey: usageLog.providerKey,
          providerLabel: usageLog.providerLabel,
          providerModel: usageLog.providerModel,
          imageCount: usageLog.imageCount,
          status: 'success',
          promptPreview: usageLog.promptPreview,
          errorMessage: null,
          createdAt: new Date().toISOString(),
        })
        return toPublicCustomer(customer)
      })
    },

    async recordFailedUsage({ customerId, usageLog }) {
      return queueWrite((state) => {
        state.usageLogs.push({
          id: usageLog.id,
          customerId,
          creditsDelta: 0,
          providerKey: usageLog.providerKey,
          providerLabel: usageLog.providerLabel,
          providerModel: usageLog.providerModel,
          imageCount: usageLog.imageCount,
          status: 'failed',
          promptPreview: usageLog.promptPreview,
          errorMessage: usageLog.errorMessage ?? null,
          createdAt: new Date().toISOString(),
        })
      })
    },

    async grantCredits({ customerId, credits, reason, operator }) {
      return queueWrite((state) => {
        const customer = state.customers.find((item) => item.id === customerId)
        if (!customer) throw new Error('客户不存在')
        customer.remainingCredits += credits
        customer.updatedAt = new Date().toISOString()
        state.quotaGrants.push({
          id: randomId('grant'),
          customerId,
          credits,
          reason,
          operator,
          createdAt: new Date().toISOString(),
        })
        return toPublicCustomer(customer)
      })
    },
  }
}
