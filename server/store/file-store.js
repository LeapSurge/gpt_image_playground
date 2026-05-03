import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomId } from '../ids.js'

function createEmptyState() {
  return {
    customers: [],
    sessions: [],
    usageLogs: [],
    anonymousUsageLogs: [],
    quotaGrants: [],
    anonymousTrials: [],
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

    async deleteCustomer(customerId) {
      return queueWrite((state) => {
        const customerIndex = state.customers.findIndex((item) => item.id === customerId)
        if (customerIndex === -1) throw new Error('客户不存在')
        const [customer] = state.customers.splice(customerIndex, 1)
        state.sessions = state.sessions.filter((item) => item.customerId !== customerId)
        state.usageLogs = state.usageLogs.filter((item) => item.customerId !== customerId)
        state.quotaGrants = state.quotaGrants.filter((item) => item.customerId !== customerId)
        return toPublicCustomer(customer)
      })
    },

    async listUsageLogs(limit = 20) {
      return readOnly((state) => {
        const customerLogs = state.usageLogs.map((log) => {
          const customer = state.customers.find((item) => item.id === log.customerId)
          return {
            id: log.id,
            customerId: log.customerId,
            customerEmail: customer?.email ?? '',
            customerName: customer?.name ?? '',
            audience: 'customer',
            creditsDelta: log.creditsDelta,
            providerKey: log.providerKey,
            providerLabel: log.providerLabel,
            providerModel: log.providerModel,
            imageCount: log.imageCount,
            status: log.status,
            promptPreview: log.promptPreview,
            errorMessage: log.errorMessage,
            trialRemaining: null,
            createdAt: log.createdAt,
          }
        })
        const anonymousLogs = (state.anonymousUsageLogs ?? []).map((log) => ({
          id: log.id,
          customerId: '',
          customerEmail: '',
          customerName: '',
          audience: 'anonymous',
          creditsDelta: 0,
          providerKey: log.providerKey,
          providerLabel: log.providerLabel,
          providerModel: log.providerModel,
          imageCount: log.imageCount,
          status: log.status,
          promptPreview: log.promptPreview,
          errorMessage: log.errorMessage,
          trialRemaining: log.trialRemaining ?? null,
          createdAt: log.createdAt,
        }))

        return [...customerLogs, ...anonymousLogs]
          .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
          .slice(0, limit)
      })
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

    async getAnonymousTrialBalance({ ipHash, limit, windowMs }) {
      return readOnly((state) => {
        const record = state.anonymousTrials.find((item) => item.ipHash === ipHash)
        const now = Date.now()
        if (!record) {
          return {
            remainingCredits: limit,
            limit,
            resetAt: null,
          }
        }

        const windowStartedAt = new Date(record.windowStartedAt).getTime()
        if (!Number.isFinite(windowStartedAt) || windowStartedAt + windowMs <= now) {
          return {
            remainingCredits: limit,
            limit,
            resetAt: null,
          }
        }

        return {
          remainingCredits: Math.max(0, limit - record.usedCount),
          limit,
          resetAt: new Date(windowStartedAt + windowMs).toISOString(),
        }
      })
    },

    async consumeAnonymousTrial({ ipHash, limit, windowMs }) {
      return queueWrite((state) => {
        const now = Date.now()
        const nowIso = new Date(now).toISOString()
        const record = state.anonymousTrials.find((item) => item.ipHash === ipHash)

        if (!record) {
          state.anonymousTrials.push({
            ipHash,
            usedCount: 1,
            windowStartedAt: nowIso,
            updatedAt: nowIso,
          })
          return {
            remainingCredits: Math.max(0, limit - 1),
            limit,
            resetAt: new Date(now + windowMs).toISOString(),
          }
        }

        const windowStartedAt = new Date(record.windowStartedAt).getTime()
        if (!Number.isFinite(windowStartedAt) || windowStartedAt + windowMs <= now) {
          record.usedCount = 1
          record.windowStartedAt = nowIso
          record.updatedAt = nowIso
          return {
            remainingCredits: Math.max(0, limit - 1),
            limit,
            resetAt: new Date(now + windowMs).toISOString(),
          }
        }

        if (record.usedCount >= limit) {
          throw new Error('免费试用额度已用完，请登录后继续生成')
        }

        record.usedCount += 1
        record.updatedAt = nowIso
        return {
          remainingCredits: Math.max(0, limit - record.usedCount),
          limit,
          resetAt: new Date(windowStartedAt + windowMs).toISOString(),
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

    async recordAnonymousUsage({ usageLog }) {
      return queueWrite((state) => {
        state.anonymousUsageLogs = state.anonymousUsageLogs ?? []
        state.anonymousUsageLogs.push({
          id: usageLog.id,
          providerKey: usageLog.providerKey,
          providerLabel: usageLog.providerLabel,
          providerModel: usageLog.providerModel,
          imageCount: usageLog.imageCount,
          status: usageLog.status,
          promptPreview: usageLog.promptPreview,
          errorMessage: usageLog.errorMessage ?? null,
          trialRemaining: usageLog.trialRemaining ?? null,
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
