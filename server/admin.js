import { hashAccessCode } from './auth.js'
import { randomSecret } from './ids.js'
import { getManagedGatewayStore } from './store/index.js'

function normalizeEmail(email) {
  return email.trim().toLowerCase()
}

function readPositiveInteger(value, fieldName, { allowZero = false } = {}) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 0 || (!allowZero && number === 0)) {
    throw new Error(`${fieldName}必须是${allowZero ? '非负' : '正'}整数`)
  }
  return number
}

function validateCustomerPayload(payload) {
  const email = typeof payload.email === 'string' ? normalizeEmail(payload.email) : ''
  const name = typeof payload.name === 'string' ? payload.name.trim() : ''
  const credits = readPositiveInteger(payload.credits, '初始额度', { allowZero: true })

  if (!email || !email.includes('@')) {
    throw new Error('请输入有效的客户邮箱')
  }
  if (!name) {
    throw new Error('请输入客户名称')
  }

  return { email, name, credits }
}

function validateCreditGrantPayload(payload) {
  const customerId = typeof payload.customerId === 'string' ? payload.customerId.trim() : ''
  const credits = readPositiveInteger(payload.credits, '额度')
  const reason = typeof payload.reason === 'string' ? payload.reason.trim() : ''

  if (!customerId) {
    throw new Error('缺少客户标识')
  }
  if (!reason) {
    throw new Error('请填写加额原因')
  }

  return { customerId, credits, reason }
}

function validateCustomerId(customerId) {
  const normalized = typeof customerId === 'string' ? customerId.trim() : ''
  if (!normalized) {
    throw new Error('缺少客户标识')
  }
  return normalized
}

export async function listAdminCustomers() {
  return getManagedGatewayStore().listCustomers()
}

export async function createAdminCustomer(payload) {
  const { email, name, credits } = validateCustomerPayload(payload)
  const accessCode = randomSecret(12)
  const customer = await getManagedGatewayStore().createCustomer({
    email,
    name,
    accessCodeHash: hashAccessCode(accessCode),
    remainingCredits: credits,
  })

  return {
    customer,
    accessCode,
  }
}

export async function grantAdminCredits(payload) {
  const { customerId, credits, reason } = validateCreditGrantPayload(payload)
  return getManagedGatewayStore().grantCredits({
    customerId,
    credits,
    reason,
    operator: 'admin-console',
  })
}

export async function deleteAdminCustomer(customerId) {
  return getManagedGatewayStore().deleteCustomer(validateCustomerId(customerId))
}

export async function listAdminUsage(limit) {
  const normalizedLimit = Number.isInteger(limit) ? limit : Number.parseInt(String(limit ?? ''), 10)
  const safeLimit = Number.isFinite(normalizedLimit)
    ? Math.max(1, Math.min(100, normalizedLimit))
    : 20
  return getManagedGatewayStore().listUsageLogs(safeLimit)
}
