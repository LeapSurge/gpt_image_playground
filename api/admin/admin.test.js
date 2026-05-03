import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { rm } from 'node:fs/promises'
import path from 'node:path'
import customersHandler from './customers.js'
import sessionHandler from './session.js'
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
})
