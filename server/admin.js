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

function validateRedeemCodeBatchPayload(payload) {
  const productName = typeof payload.productName === 'string' ? payload.productName.trim() : ''
  const credits = readPositiveInteger(payload.credits, '额度')
  const quantity = readPositiveInteger(payload.quantity, '数量')
  const source = typeof payload.source === 'string' ? payload.source.trim() : ''

  if (!productName) {
    throw new Error('请输入商品名称')
  }
  if (!source) {
    throw new Error('请输入渠道来源')
  }
  if (quantity > 500) {
    throw new Error('单次最多生成 500 个兑换码')
  }

  return { productName, credits, quantity, source }
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

function maskRedeemCode(code) {
  return `****${code.slice(-4)}`
}

export async function createAdminRedeemCodeBatch(payload) {
  const { productName, credits, quantity, source } = validateRedeemCodeBatchPayload(payload)
  const batchId = randomSecret(8)
  const createdCodes = Array.from({ length: quantity }, () => {
    const code = randomSecret(12)
    return {
      code,
      codeHash: hashAccessCode(code),
      codePreview: maskRedeemCode(code),
      credits,
      source,
      productName,
      batchId,
    }
  })

  const redeemCodes = await getManagedGatewayStore().createRedeemCodeBatch({
    batchId,
    operator: 'admin-console',
    codes: createdCodes.map((item) => ({
      codeHash: item.codeHash,
      codePreview: item.codePreview,
      credits: item.credits,
      source: item.source,
      productName: item.productName,
      batchId: item.batchId,
    })),
  })

  return {
    batchId,
    createdCodes: redeemCodes.map((item, index) => ({
      ...item,
      code: createdCodes[index].code,
    })),
  }
}

export async function listAdminRedeemCodes(limit) {
  const normalizedLimit = Number.isInteger(limit) ? limit : Number.parseInt(String(limit ?? ''), 10)
  const safeLimit = Number.isFinite(normalizedLimit)
    ? Math.max(1, Math.min(200, normalizedLimit))
    : 50
  return getManagedGatewayStore().listRedeemCodes(safeLimit)
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
