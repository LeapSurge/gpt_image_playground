export interface AdminSessionState {
  authenticated: boolean
  expiresAt: string | null
}

export interface AdminCustomer {
  id: string
  email: string
  name: string
  remainingCredits: number
  status: 'active' | 'disabled'
}

export interface AdminUsageRecord {
  id: string
  customerId: string
  customerEmail: string
  customerName: string
  creditsDelta: number
  providerKey: string
  providerLabel: string
  providerModel: string
  imageCount: number
  status: 'success' | 'failed'
  promptPreview: string
  errorMessage: string | null
  createdAt: string
}

async function getApiErrorMessage(response: Response) {
  try {
    const payload = await response.json()
    if (payload?.error?.message) {
      return String(payload.error.message)
    }
  } catch {
    // ignore
  }
  return `请求失败（${response.status}）`
}

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    ...init,
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response))
  }
  return response.json() as Promise<T>
}

export function fetchAdminSession() {
  return requestJson<AdminSessionState>('/api/admin/session')
}

export function loginAdminSession(secret: string) {
  return requestJson<AdminSessionState>('/api/admin/session', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ secret }),
  })
}

export async function logoutAdminSession() {
  await requestJson<{ ok: boolean }>('/api/admin/session', {
    method: 'DELETE',
  })
}

export async function fetchAdminCustomers() {
  const payload = await requestJson<{ customers: AdminCustomer[] }>('/api/admin/customers')
  return payload.customers
}

export async function deleteAdminCustomer(customerId: string) {
  const payload = await requestJson<{ customer: AdminCustomer }>(`/api/admin/customers?customerId=${encodeURIComponent(customerId)}`, {
    method: 'DELETE',
  })
  return payload.customer
}

export function createAdminCustomer(input: {
  email: string
  name: string
  credits: number
}) {
  return requestJson<{
    customer: AdminCustomer
    accessCode: string
  }>('/api/admin/customers', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
}

export async function grantAdminCredits(input: {
  customerId: string
  credits: number
  reason: string
}) {
  const payload = await requestJson<{ customer: AdminCustomer }>('/api/admin/credits', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  })
  return payload.customer
}

export async function fetchAdminUsage(limit = 20) {
  const payload = await requestJson<{ usage: AdminUsageRecord[] }>(`/api/admin/usage?limit=${limit}`)
  return payload.usage
}
