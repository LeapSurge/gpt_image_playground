import { useEffect, useState } from 'react'
import {
  createAdminCustomer,
  deleteAdminCustomer,
  fetchAdminCustomers,
  fetchAdminSession,
  fetchAdminUsage,
  grantAdminCredits,
  loginAdminSession,
  logoutAdminSession,
} from './lib/adminClient'
import type { AdminCustomer, AdminUsageRecord } from './lib/adminClient'

type AdminViewState = 'loading' | 'unauthenticated' | 'authenticated'

interface NoticeState {
  type: 'success' | 'error'
  message: string
}

function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString('zh-CN', { hour12: false })
  } catch {
    return value
  }
}

export default function AdminApp() {
  const [viewState, setViewState] = useState<AdminViewState>('loading')
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [customers, setCustomers] = useState<AdminCustomer[]>([])
  const [usage, setUsage] = useState<AdminUsageRecord[]>([])
  const [notice, setNotice] = useState<NoticeState | null>(null)
  const [secret, setSecret] = useState('')
  const [loginSubmitting, setLoginSubmitting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [grantSubmitting, setGrantSubmitting] = useState(false)
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null)
  const [lastCreatedAccessCode, setLastCreatedAccessCode] = useState<string | null>(null)
  const [createForm, setCreateForm] = useState({
    email: '',
    name: '',
    credits: '100',
  })
  const [grantForm, setGrantForm] = useState({
    customerId: '',
    credits: '10',
    reason: 'manual grant',
  })

  async function loadDashboard() {
    const [nextCustomers, nextUsage] = await Promise.all([
      fetchAdminCustomers(),
      fetchAdminUsage(20),
    ])
    setCustomers(nextCustomers)
    setUsage(nextUsage)
    setGrantForm((current) => ({
      ...current,
      customerId: current.customerId || nextCustomers[0]?.id || '',
    }))
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const session = await fetchAdminSession()
        if (cancelled) return
        if (!session.authenticated) {
          setViewState('unauthenticated')
          return
        }
        setExpiresAt(session.expiresAt)
        await loadDashboard()
        if (!cancelled) {
          setViewState('authenticated')
        }
      } catch (error) {
        if (!cancelled) {
          setNotice({
            type: 'error',
            message: error instanceof Error ? error.message : String(error),
          })
          setViewState('unauthenticated')
        }
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  const handleRefresh = async () => {
    try {
      setRefreshing(true)
      await loadDashboard()
      setNotice({
        type: 'success',
        message: '数据已刷新',
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setRefreshing(false)
    }
  }

  const handleLogin = async () => {
    if (loginSubmitting) return
    try {
      setLoginSubmitting(true)
      const session = await loginAdminSession(secret)
      setExpiresAt(session.expiresAt)
      await loadDashboard()
      setViewState('authenticated')
      setSecret('')
      setNotice({
        type: 'success',
        message: '管理员登录成功',
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setLoginSubmitting(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logoutAdminSession()
      setViewState('unauthenticated')
      setCustomers([])
      setUsage([])
      setExpiresAt(null)
      setLastCreatedAccessCode(null)
      setNotice({
        type: 'success',
        message: '已退出管理员后台',
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const handleCreateCustomer = async () => {
    if (createSubmitting) return
    try {
      setCreateSubmitting(true)
      const created = await createAdminCustomer({
        email: createForm.email.trim(),
        name: createForm.name.trim(),
        credits: Number(createForm.credits),
      })
      await loadDashboard()
      setLastCreatedAccessCode(created.accessCode)
      setCreateForm({
        email: '',
        name: '',
        credits: createForm.credits,
      })
      setGrantForm((current) => ({
        ...current,
        customerId: created.customer.id,
      }))
      setNotice({
        type: 'success',
        message: `客户 ${created.customer.email} 已创建`,
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setCreateSubmitting(false)
    }
  }

  const handleGrantCredits = async () => {
    if (grantSubmitting) return
    try {
      setGrantSubmitting(true)
      const updated = await grantAdminCredits({
        customerId: grantForm.customerId,
        credits: Number(grantForm.credits),
        reason: grantForm.reason.trim(),
      })
      setCustomers((current) => current.map((item) => item.id === updated.id ? updated : item))
      setNotice({
        type: 'success',
        message: `已为 ${updated.email} 增加 ${grantForm.credits} 点额度`,
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setGrantSubmitting(false)
    }
  }

  const handleDeleteCustomer = async (customer: AdminCustomer) => {
    if (deletingCustomerId) return
    const confirmed = window.confirm(`确定删除客户 ${customer.name}（${customer.email}）吗？这会同时删除该客户的会话和使用记录。`)
    if (!confirmed) return

    try {
      setDeletingCustomerId(customer.id)
      await deleteAdminCustomer(customer.id)
      setCustomers((current) => current.filter((item) => item.id !== customer.id))
      setUsage((current) => current.filter((item) => item.customerId !== customer.id))
      setGrantForm((current) => ({
        ...current,
        customerId: current.customerId === customer.id
          ? ''
          : current.customerId,
      }))
      setNotice({
        type: 'success',
        message: `客户 ${customer.email} 已删除`,
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setDeletingCustomerId(null)
    }
  }

  const handleCopyAccessCode = async () => {
    if (!lastCreatedAccessCode) return
    try {
      await navigator.clipboard.writeText(lastCreatedAccessCode)
      setNotice({
        type: 'success',
        message: '访问码已复制到剪贴板',
      })
    } catch (error) {
      setNotice({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.14),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eff6ff_100%)] text-gray-900">
      <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-600">Internal Admin</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950">Managed Gateway Console</h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-600">
                仅提供最小运维能力：查看客户、创建客户、手动加额，以及查看最近使用记录。
              </p>
            </div>
            {viewState === 'authenticated' && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleRefresh()}
                  disabled={refreshing}
                  className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
                >
                  {refreshing ? '刷新中...' : '刷新'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                >
                  退出
                </button>
              </div>
            )}
          </div>
          {expiresAt && viewState === 'authenticated' && (
            <p className="text-xs text-gray-500">当前管理员会话到期时间：{formatDateTime(expiresAt)}</p>
          )}
          {notice && (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                notice.type === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}
            >
              {notice.message}
            </div>
          )}
        </div>

        {viewState === 'loading' && (
          <section className="rounded-[32px] border border-white/70 bg-white/90 p-8 text-sm text-gray-600 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            正在检查管理员会话...
          </section>
        )}

        {viewState === 'unauthenticated' && (
          <section className="mx-auto w-full max-w-md rounded-[32px] border border-white/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <h2 className="text-xl font-semibold text-gray-950">管理员登录</h2>
            <p className="mt-2 text-sm text-gray-600">
              输入部署环境中的 <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">ADMIN_SECRET</code> 进入后台。
            </p>
            <label className="mt-6 flex flex-col gap-2">
              <span className="text-sm font-medium text-gray-700">管理员密钥</span>
              <input
                type="password"
                value={secret}
                onChange={(event) => setSecret(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void handleLogin()
                  }
                }}
                autoFocus
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-blue-400"
                placeholder="输入 ADMIN_SECRET"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleLogin()}
              disabled={loginSubmitting}
              className="mt-6 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
            >
              {loginSubmitting ? '登录中...' : '进入后台'}
            </button>
          </section>
        )}

        {viewState === 'authenticated' && (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">客户列表</h2>
                  <p className="text-sm text-gray-500">查看当前额度和状态。</p>
                </div>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  {customers.length} 位客户
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-gray-500">
                    <tr>
                      <th className="pb-3 pr-4 font-medium">客户</th>
                      <th className="pb-3 pr-4 font-medium">邮箱</th>
                      <th className="pb-3 pr-4 font-medium">额度</th>
                      <th className="pb-3 pr-4 font-medium">状态</th>
                      <th className="pb-3 font-medium">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {customers.map((customer) => (
                      <tr key={customer.id}>
                        <td className="py-3 pr-4 font-medium text-gray-900">{customer.name}</td>
                        <td className="py-3 pr-4 text-gray-600">{customer.email}</td>
                        <td className="py-3 pr-4 text-gray-900">{customer.remainingCredits}</td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              customer.status === 'active'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {customer.status === 'active' ? 'active' : 'disabled'}
                          </span>
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => void handleDeleteCustomer(customer)}
                            disabled={deletingCustomerId === customer.id}
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:border-red-100 disabled:bg-red-50 disabled:text-red-300"
                          >
                            {deletingCustomerId === customer.id ? '删除中...' : '删除'}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {customers.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-sm text-gray-500">
                          暂无客户
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <div className="grid gap-6">
              <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                <h2 className="text-lg font-semibold text-gray-950">创建客户</h2>
                <div className="mt-4 grid gap-3">
                  <input
                    value={createForm.name}
                    onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-blue-400"
                    placeholder="客户名称"
                  />
                  <input
                    value={createForm.email}
                    onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-blue-400"
                    placeholder="customer@example.com"
                  />
                  <input
                    value={createForm.credits}
                    onChange={(event) => setCreateForm((current) => ({ ...current, credits: event.target.value }))}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-blue-400"
                    inputMode="numeric"
                    placeholder="初始额度"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleCreateCustomer()}
                  disabled={createSubmitting}
                  className="mt-4 w-full rounded-2xl bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                >
                  {createSubmitting ? '创建中...' : '创建客户'}
                </button>
                {lastCreatedAccessCode && (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium">新访问码</p>
                      <button
                        type="button"
                        onClick={() => void handleCopyAccessCode()}
                        className="rounded-xl border border-amber-300 bg-white/80 px-3 py-1.5 text-xs font-medium text-amber-900 transition-colors hover:bg-white"
                      >
                        复制密钥
                      </button>
                    </div>
                    <p className="mt-1 break-all font-mono text-xs">{lastCreatedAccessCode}</p>
                    <p className="mt-2 text-xs text-amber-700">访问码只在创建成功后返回一次，请立即发给客户。</p>
                  </div>
                )}
              </section>

              <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
                <h2 className="text-lg font-semibold text-gray-950">手动加额</h2>
                <div className="mt-4 grid gap-3">
                  <select
                    value={grantForm.customerId}
                    onChange={(event) => setGrantForm((current) => ({ ...current, customerId: event.target.value }))}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-blue-400"
                  >
                    <option value="">选择客户</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name} ({customer.email})
                      </option>
                    ))}
                  </select>
                  <input
                    value={grantForm.credits}
                    onChange={(event) => setGrantForm((current) => ({ ...current, credits: event.target.value }))}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-blue-400"
                    inputMode="numeric"
                    placeholder="增加额度"
                  />
                  <input
                    value={grantForm.reason}
                    onChange={(event) => setGrantForm((current) => ({ ...current, reason: event.target.value }))}
                    className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-blue-400"
                    placeholder="加额原因"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleGrantCredits()}
                  disabled={grantSubmitting}
                  className="mt-4 w-full rounded-2xl bg-gray-950 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {grantSubmitting ? '处理中...' : '确认加额'}
                </button>
              </section>
            </div>

            <section className="rounded-[32px] border border-white/70 bg-white/90 p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] lg:col-span-2">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-gray-950">最近使用记录</h2>
                <p className="text-sm text-gray-500">仅展示最近 20 条生成记录。</p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-gray-500">
                    <tr>
                      <th className="pb-3 pr-4 font-medium">时间</th>
                      <th className="pb-3 pr-4 font-medium">客户</th>
                      <th className="pb-3 pr-4 font-medium">额度变动</th>
                      <th className="pb-3 pr-4 font-medium">Provider</th>
                      <th className="pb-3 pr-4 font-medium">状态</th>
                      <th className="pb-3 font-medium">提示词</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {usage.map((record) => (
                      <tr key={record.id}>
                        <td className="py-3 pr-4 text-gray-600">{formatDateTime(record.createdAt)}</td>
                        <td className="py-3 pr-4">
                          <div className="font-medium text-gray-900">{record.customerName}</div>
                          <div className="text-xs text-gray-500">{record.customerEmail}</div>
                        </td>
                        <td className="py-3 pr-4 text-gray-900">{record.creditsDelta}</td>
                        <td className="py-3 pr-4 text-gray-600">
                          <div>{record.providerLabel}</div>
                          <div className="text-xs text-gray-500">{record.providerModel}</div>
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                              record.status === 'success'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-red-50 text-red-700'
                            }`}
                          >
                            {record.status}
                          </span>
                        </td>
                        <td className="py-3 text-gray-600">
                          <div className="max-w-xl truncate">{record.promptPreview}</div>
                          {record.errorMessage && (
                            <div className="mt-1 text-xs text-red-600">{record.errorMessage}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {usage.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-sm text-gray-500">
                          暂无使用记录
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
