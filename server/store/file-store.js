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
    redeemCodes: [],
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

function toPublicRedeemCode(redeemCode, customer = null) {
  return {
    id: redeemCode.id,
    code: redeemCode.codePreview,
    status: redeemCode.status,
    credits: redeemCode.credits,
    source: redeemCode.source,
    productName: redeemCode.productName,
    redeemedByCustomerId: redeemCode.redeemedByCustomerId ?? null,
    redeemedByCustomerEmail: customer?.email ?? null,
    redeemedByCustomerName: customer?.name ?? null,
    redeemedAt: redeemCode.redeemedAt ?? null,
    batchId: redeemCode.batchId,
    createdAt: redeemCode.createdAt,
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

  function findActiveCustomerByAccessCodeHash(state, accessCodeHash) {
    const matches = state.customers.filter((item) =>
      item.accessCodeHash === accessCodeHash &&
      item.status === 'active',
    )

    if (matches.length > 1) {
      throw new Error('兑换码存在重复配置，请联系管理员处理')
    }

    return matches[0] ?? null
  }

  function findRedeemCodeByHash(state, codeHash) {
    return (state.redeemCodes ?? []).find((item) => item.codeHash === codeHash) ?? null
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

    async authenticateCustomerByAccessCode(accessCodeHash) {
      return readOnly((state) => {
        const customer = findActiveCustomerByAccessCodeHash(state, accessCodeHash)
        return customer ? toPublicCustomer(customer) : null
      })
    },

    async createCustomer({ email, name, accessCodeHash, remainingCredits }) {
      return queueWrite((state) => {
        const normalizedEmail = email.toLowerCase()
        if (state.customers.some((item) => item.email.toLowerCase() === normalizedEmail)) {
          throw new Error('客户邮箱已存在')
        }
        if (state.customers.some((item) => item.accessCodeHash === accessCodeHash)) {
          throw new Error('访问码已存在，请重新生成')
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

    async createRedeemCodeBatch({ batchId, operator, codes }) {
      return queueWrite((state) => {
        state.redeemCodes = state.redeemCodes ?? []
        for (const code of codes) {
          if (state.redeemCodes.some((item) => item.codeHash === code.codeHash)) {
            throw new Error('生成的兑换码与现有码重复，请重试')
          }
        }

        const createdAt = new Date().toISOString()
        const created = codes.map((code) => {
          const redeemCode = {
            id: randomId('redeem'),
            codeHash: code.codeHash,
            codePreview: code.codePreview,
            status: 'unused',
            credits: code.credits,
            source: code.source,
            productName: code.productName,
            redeemedByCustomerId: null,
            redeemedAt: null,
            batchId,
            operator,
            createdAt,
          }
          state.redeemCodes.push(redeemCode)
          return redeemCode
        })

        return created.map((item) => toPublicRedeemCode(item))
      })
    },

    async listRedeemCodes(limit = 50) {
      return readOnly((state) => (state.redeemCodes ?? [])
        .slice()
        .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())
        .slice(0, limit)
        .map((item) => {
          const customer = item.redeemedByCustomerId
            ? state.customers.find((customerItem) => customerItem.id === item.redeemedByCustomerId) ?? null
            : null
          return toPublicRedeemCode(item, customer)
        }))
    },

    async consumeRedeemCode({ codeHash, customerId, createCustomer, operator }) {
      return queueWrite((state) => {
        state.redeemCodes = state.redeemCodes ?? []
        const redeemCode = findRedeemCodeByHash(state, codeHash)
        if (!redeemCode) {
          throw new Error('兑换码不正确')
        }
        if (redeemCode.status === 'disabled') {
          throw new Error('兑换码已停用')
        }
        if (redeemCode.status === 'redeemed') {
          throw new Error('兑换码已使用')
        }

        let customer = customerId
          ? state.customers.find((item) => item.id === customerId && item.status === 'active') ?? null
          : null
        if (customerId && !customer) {
          throw new Error('当前账户不可用，请重新兑换')
        }

        if (!customer) {
          if (!createCustomer) {
            throw new Error('缺少兑换目标账户')
          }
          customer = {
            id: randomId('customer'),
            email: createCustomer.email,
            name: createCustomer.name,
            accessCodeHash: createCustomer.accessCodeHash,
            remainingCredits: 0,
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
          state.customers.push(customer)
        }

        customer.remainingCredits += redeemCode.credits
        customer.updatedAt = new Date().toISOString()
        redeemCode.status = 'redeemed'
        redeemCode.redeemedByCustomerId = customer.id
        redeemCode.redeemedAt = new Date().toISOString()
        state.quotaGrants.push({
          id: randomId('grant'),
          customerId: customer.id,
          credits: redeemCode.credits,
          reason: `redeem:${redeemCode.productName}`,
          operator,
          createdAt: new Date().toISOString(),
        })

        return {
          customer: toPublicCustomer(customer),
          redeemCode: toPublicRedeemCode(redeemCode, customer),
          createdCustomer: !customerId,
        }
      })
    },

    async deleteCustomer(customerId) {
      return queueWrite((state) => {
        const customerIndex = state.customers.findIndex((item) => item.id === customerId)
        if (customerIndex === -1) throw new Error('客户不存在')
        const [customer] = state.customers.splice(customerIndex, 1)
        state.sessions = state.sessions.filter((item) => item.customerId !== customerId)
        state.usageLogs = state.usageLogs.filter((item) => item.customerId !== customerId)
        state.quotaGrants = state.quotaGrants.filter((item) => item.customerId !== customerId)
        state.redeemCodes = (state.redeemCodes ?? []).map((item) =>
          item.redeemedByCustomerId === customerId
            ? {
                ...item,
                redeemedByCustomerId: null,
              }
            : item,
        )
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
          throw new Error('试用已用完，请购买或输入兑换码继续生成')
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
