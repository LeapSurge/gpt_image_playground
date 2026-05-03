import { useState } from 'react'
import { loginManagedSession } from '../lib/managedGatewayClient'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'

export default function AuthModal() {
  const showAuthDialog = useStore((state) => state.showAuthDialog)
  const setShowAuthDialog = useStore((state) => state.setShowAuthDialog)
  const setSession = useStore((state) => state.setSession)
  const showToast = useStore((state) => state.showToast)
  const [email, setEmail] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useCloseOnEscape(showAuthDialog, () => setShowAuthDialog(false))

  if (!showAuthDialog) return null

  const handleSubmit = async () => {
    if (isSubmitting) return
    if (!email.trim() || !accessCode.trim()) {
      showToast('请输入邮箱和访问码', 'error')
      return
    }

    try {
      setIsSubmitting(true)
      const session = await loginManagedSession(email.trim(), accessCode.trim())
      setSession(session)
      setShowAuthDialog(false)
      setAccessCode('')
      showToast('登录成功', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div data-no-drag-select className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in"
        onClick={() => !isSubmitting && setShowAuthDialog(false)}
      />
      <div className="relative z-10 w-full max-w-sm rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">客户登录</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            当前浏览器可先免费试用少量额度；用完后使用管理员分配的邮箱和访问码继续生成。
          </p>
        </div>

        <div className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">邮箱</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoFocus
              autoComplete="email"
              className="rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.03]"
              placeholder="customer@example.com"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">访问码</span>
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              type="password"
              autoComplete="current-password"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleSubmit()
                }
              }}
              className="rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.03]"
              placeholder="由管理员提供"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setShowAuthDialog(false)}
            disabled={isSubmitting}
            className="rounded-xl px-3 py-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-white/[0.06]"
          >
            {isSubmitting ? '登录中...' : '登录'}
          </button>
        </div>
      </div>
    </div>
  )
}
