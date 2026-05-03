import { describe, expect, it, vi } from 'vitest'
import { createNeonStore, serializeTimestamp } from './neon-store.js'

function createFakeSql() {
  let transactionCount = 0
  const sql = () => ({})
  sql.transaction = vi.fn(async (queries) => {
    transactionCount += 1
    if (transactionCount === 1) {
      return []
    }

    return queries.map((_, index) => ([{
      id: `redeem-${index + 1}`,
      batch_id: 'batch-1',
      code_preview: `****${index + 1}`,
      status: 'unused',
      credits: 20,
      source: 'card_site',
      product_name: '工作包',
      redeemed_by_customer_id: null,
      redeemed_by_customer_email: null,
      redeemed_by_customer_name: null,
      redeemed_at: null,
      created_at: '2026-05-03T08:00:00.000Z',
    }]))
  })
  return sql
}

function createFakeClient() {
  const state = {
    customers: [],
    redeemCodes: [
      {
        id: 'redeem-1',
        batch_id: 'batch-1',
        code_hash: 'hash-1',
        code_preview: '****1',
        status: 'unused',
        credits: 20,
        source: 'card_site',
        product_name: '工作包',
        redeemed_by_customer_id: null,
        redeemed_at: null,
        created_at: '2026-05-03T08:00:00.000Z',
      },
    ],
    quotaGrants: [],
  }

  return class FakeClient {
    async connect() {}

    async end() {}

    async query(text, params = []) {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') {
        return { rows: [] }
      }

      if (/FROM managed_redeem_codes/i.test(text) && /FOR UPDATE/i.test(text)) {
        return {
          rows: state.redeemCodes.filter((item) => item.code_hash === params[0]).slice(0, 1),
        }
      }

      if (/INSERT INTO managed_customers/i.test(text)) {
        const record = {
          id: params[0],
          email: params[1],
          name: params[2],
          access_code_hash: params[3],
          remaining_credits: 0,
          status: 'active',
        }
        state.customers.push(record)
        return { rows: [{ id: record.id }] }
      }

      if (/UPDATE managed_customers/i.test(text)) {
        const customer = state.customers.find((item) => item.id === params[0] && item.status === 'active')
        if (!customer) return { rows: [] }
        customer.remaining_credits += Number(params[1])
        return {
          rows: [{
            id: customer.id,
            email: customer.email,
            name: customer.name,
            remaining_credits: customer.remaining_credits,
            status: customer.status,
          }],
        }
      }

      if (/UPDATE managed_redeem_codes/i.test(text)) {
        const redeemCode = state.redeemCodes.find((item) => item.id === params[0] && item.status === 'unused')
        if (!redeemCode) return { rows: [] }
        redeemCode.status = 'redeemed'
        redeemCode.redeemed_by_customer_id = params[1]
        redeemCode.redeemed_at = '2026-05-03T09:00:00.000Z'
        return {
          rows: [{
            id: redeemCode.id,
            batch_id: redeemCode.batch_id,
            code_preview: redeemCode.code_preview,
            status: redeemCode.status,
            credits: redeemCode.credits,
            source: redeemCode.source,
            product_name: redeemCode.product_name,
            redeemed_by_customer_id: redeemCode.redeemed_by_customer_id,
            redeemed_at: redeemCode.redeemed_at,
            created_at: redeemCode.created_at,
          }],
        }
      }

      if (/INSERT INTO managed_quota_grants/i.test(text)) {
        state.quotaGrants.push({
          id: params[0],
          customer_id: params[1],
          credits: params[2],
          reason: params[3],
          operator: params[4],
        })
        return { rows: [] }
      }

      throw new Error(`Unexpected query: ${text}`)
    }
  }
}

describe('serializeTimestamp', () => {
  it('returns null for missing values', () => {
    expect(serializeTimestamp(null)).toBeNull()
    expect(serializeTimestamp(undefined)).toBeNull()
    expect(serializeTimestamp('')).toBeNull()
  })

  it('returns an ISO string for valid timestamps', () => {
    expect(serializeTimestamp('2026-05-03T08:00:00.000Z')).toBe('2026-05-03T08:00:00.000Z')
  })

  it('falls back to the raw value for invalid timestamps instead of throwing', () => {
    expect(() => serializeTimestamp('not-a-time')).not.toThrow()
    expect(serializeTimestamp('not-a-time')).toBe('not-a-time')
  })
})

describe('createNeonStore', () => {
  it('flattens nested transaction rows when creating redeem codes', async () => {
    const sql = createFakeSql()
    const store = createNeonStore('postgres://example', () => sql)

    const created = await store.createRedeemCodeBatch({
      batchId: 'batch-1',
      operator: 'admin-console',
      codes: [
        {
          codeHash: 'hash-1',
          codePreview: '****1',
          credits: 20,
          source: 'card_site',
          productName: '工作包',
        },
        {
          codeHash: 'hash-2',
          codePreview: '****2',
          credits: 20,
          source: 'card_site',
          productName: '工作包',
        },
      ],
    })

    expect(created).toHaveLength(2)
    expect(created[0]).toMatchObject({
      id: 'redeem-1',
      code: '****1',
      createdAt: '2026-05-03T08:00:00.000Z',
    })
  })

  it('redeems a code using an interactive client transaction', async () => {
    const sql = createFakeSql()
    const FakeClient = createFakeClient()
    const store = createNeonStore('postgres://example', () => sql, FakeClient)

    const redeemed = await store.consumeRedeemCode({
      codeHash: 'hash-1',
      customerId: null,
      createCustomer: {
        email: 'redeem@example.com',
        name: 'Redeem User',
        accessCodeHash: 'session-hash',
      },
      operator: 'anonymous-redeem',
    })

    expect(redeemed.createdCustomer).toBe(true)
    expect(redeemed.customer).toMatchObject({
      email: 'redeem@example.com',
      name: 'Redeem User',
      remainingCredits: 20,
    })
    expect(redeemed.redeemCode).toMatchObject({
      code: '****1',
      status: 'redeemed',
      redeemedByCustomerEmail: 'redeem@example.com',
      redeemedByCustomerName: 'Redeem User',
    })
  })
})
