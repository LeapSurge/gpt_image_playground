import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import customersHandler from './customers.js'
import redeemCodesHandler from './redeem-codes.js'
import sessionHandler from './session.js'
import redeemHandler from '../redeem.js'
import { resetManagedGatewayStoreForTests } from '../../server/store/index.js'

const storePath = path.resolve(process.cwd(), '.tmp-admin-test-store.json')

function withJson(method, url, body, headers = {}) {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

describe('admin api', () => {
  beforeEach(async () => {
    process.env.ADMIN_SECRET = 'admin-secret'
    process.env.MANAGED_GATEWAY_SESSION_SECRET = 'test-session-secret'
    process.env.MANAGED_GATEWAY_PRIMARY_BASE_URL = 'https://example.test/v1'
    process.env.MANAGED_GATEWAY_PRIMARY_API_KEY = 'test-key'
    process.env.MANAGED_GATEWAY_FILE_STORE_PATH = storePath
    delete process.env.DATABASE_URL
    delete process.env.VERCEL
    process.env.NODE_ENV = 'test'
    resetManagedGatewayStoreForTests()
    await rm(storePath, { force: true })
  })

  afterEach(async () => {
    resetManagedGatewayStoreForTests()
    await rm(storePath, { force: true })
  })

  it('rejects customer admin access without an admin session', async () => {
    const response = await customersHandler.fetch(new Request('http://localhost/api/admin/customers', {
      method: 'GET',
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({
      error: {
        message: expect.stringContaining('管理员登录状态'),
      },
    })
  })

  it('creates and lists customers after admin login', async () => {
    const loginResponse = await sessionHandler.fetch(withJson(
      'POST',
      'http://localhost/api/admin/session',
      { secret: 'admin-secret' },
    ))
    expect(loginResponse.status).toBe(200)
    const cookie = loginResponse.headers.get('set-cookie')
    expect(cookie).toContain('gip_admin_session=')

    const createResponse = await customersHandler.fetch(withJson(
      'POST',
      'http://localhost/api/admin/customers',
      {
        email: 'demo@example.com',
        name: 'Demo Customer',
        credits: 12,
      },
      { cookie: cookie ?? '' },
    ))
    expect(createResponse.status).toBe(200)
    await expect(createResponse.json()).resolves.toMatchObject({
      customer: {
        email: 'demo@example.com',
        name: 'Demo Customer',
        remainingCredits: 12,
        status: 'active',
      },
      accessCode: expect.any(String),
    })

    const listResponse = await customersHandler.fetch(new Request('http://localhost/api/admin/customers', {
      method: 'GET',
      headers: {
        cookie: cookie ?? '',
      },
    }))
    expect(listResponse.status).toBe(200)
    await expect(listResponse.json()).resolves.toMatchObject({
      customers: [
        expect.objectContaining({
          email: 'demo@example.com',
          remainingCredits: 12,
        }),
      ],
    })
  })

  it('deletes a customer after admin login', async () => {
    const loginResponse = await sessionHandler.fetch(withJson(
      'POST',
      'http://localhost/api/admin/session',
      { secret: 'admin-secret' },
    ))
    const cookie = loginResponse.headers.get('set-cookie')

    const createResponse = await customersHandler.fetch(withJson(
      'POST',
      'http://localhost/api/admin/customers',
      {
        email: 'delete-me@example.com',
        name: 'Delete Me',
        credits: 3,
      },
      { cookie: cookie ?? '' },
    ))
    const createdPayload = await createResponse.json()

    const deleteResponse = await customersHandler.fetch(new Request(
      `http://localhost/api/admin/customers?customerId=${createdPayload.customer.id}`,
      {
        method: 'DELETE',
        headers: {
          cookie: cookie ?? '',
        },
      },
    ))

    expect(deleteResponse.status).toBe(200)
    await expect(deleteResponse.json()).resolves.toMatchObject({
      customer: expect.objectContaining({
        email: 'delete-me@example.com',
      }),
    })

    const listResponse = await customersHandler.fetch(new Request('http://localhost/api/admin/customers', {
      method: 'GET',
      headers: {
        cookie: cookie ?? '',
      },
    }))
    await expect(listResponse.json()).resolves.toMatchObject({
      customers: [],
    })
  })

  it('creates redeem codes and allows anonymous first redeem plus authenticated top-up', async () => {
    const adminLoginResponse = await sessionHandler.fetch(withJson(
      'POST',
      'http://localhost/api/admin/session',
      { secret: 'admin-secret' },
    ))
    const adminCookie = adminLoginResponse.headers.get('set-cookie')

    const createBatchResponse = await redeemCodesHandler.fetch(withJson(
      'POST',
      'http://localhost/api/admin/redeem-codes',
      {
        productName: '工作包',
        credits: 20,
        quantity: 2,
        source: 'card-site',
      },
      { cookie: adminCookie ?? '' },
    ))
    expect(createBatchResponse.status).toBe(200)
    const createdBatch = await createBatchResponse.json()
    expect(createdBatch.codes).toHaveLength(2)

    const firstRedeemResponse = await redeemHandler.fetch(withJson(
      'POST',
      'http://localhost/api/redeem',
      { accessCode: createdBatch.codes[0].code },
    ))
    expect(firstRedeemResponse.status).toBe(200)
    const firstRedeemPayload = await firstRedeemResponse.json()
    const customerCookie = firstRedeemResponse.headers.get('set-cookie')
    expect(customerCookie).toContain('gip_session=')
    expect(firstRedeemPayload.customer.remainingCredits).toBe(20)

    const secondRedeemResponse = await redeemHandler.fetch(withJson(
      'POST',
      'http://localhost/api/redeem',
      { accessCode: createdBatch.codes[1].code },
      { cookie: customerCookie ?? '' },
    ))
    expect(secondRedeemResponse.status).toBe(200)
    const secondRedeemPayload = await secondRedeemResponse.json()
    expect(secondRedeemPayload.customer.id).toBe(firstRedeemPayload.customer.id)
    expect(secondRedeemPayload.customer.remainingCredits).toBe(40)

    const listCodesResponse = await redeemCodesHandler.fetch(new Request('http://localhost/api/admin/redeem-codes', {
      method: 'GET',
      headers: {
        cookie: adminCookie ?? '',
      },
    }))
    expect(listCodesResponse.status).toBe(200)
    const listedCodesPayload = await listCodesResponse.json()
    const currentBatchCodes = listedCodesPayload.codes.filter((item) => item.batchId === createdBatch.batchId)
    expect(currentBatchCodes).toHaveLength(2)
    expect(currentBatchCodes.every((item) => item.status === 'redeemed')).toBe(true)
  })
})
