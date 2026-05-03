import { useState } from 'react'
import { copyTextToClipboard, getClipboardFailureMessage } from '../lib/clipboard'
import { redeemManagedSession } from '../lib/managedGatewayClient'
import { getTrialResetGuidance } from '../lib/trialCopy'
import { useStore } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'

const SELF_SERVICE_PURCHASE_URL = 'https://pay.ldxp.cn/shop/TLQ7ACG1'
const WECHAT_CONTACT_ID = 'kutouyoubin'

export default function AuthModal() {
  const showAuthDialog = useStore((state) => state.showAuthDialog)
  const setShowAuthDialog = useStore((state) => state.setShowAuthDialog)
  const setSession = useStore((state) => state.setSession)
  const session = useStore((state) => state.session)
  const showToast = useStore((state) => state.showToast)
  const [accessCode, setAccessCode] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useCloseOnEscape(showAuthDialog, () => setShowAuthDialog(false))

  if (!showAuthDialog) return null

  const handleCopyWechat = async () => {
    try {
      await copyTextToClipboard(WECHAT_CONTACT_ID)
      showToast(`微信号已复制：${WECHAT_CONTACT_ID}`, 'success')
    } catch (error) {
      showToast(getClipboardFailureMessage('复制微信号失败，请手动添加 kutouyoubin', error), 'error')
    }
  }

  const handleSubmit = async () => {
    if (isSubmitting) return
    if (!accessCode.trim()) {
      showToast('请输入兑换码', 'error')
      return
    }

    try {
      setIsSubmitting(true)
      const session = await redeemManagedSession(accessCode.trim())
      setSession(session)
      setShowAuthDialog(false)
      setAccessCode('')
      showToast(
        session.status === 'authenticated' && session.customer
          ? `兑换成功，当前额度 ${session.customer.remainingCredits}`
          : '兑换成功',
        'success',
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const trialGuidance =
    session.status === 'anonymous'
      ? getTrialResetGuidance(session.trial)
      : '输入新的兑换码后，额度会直接加到当前账户。'

  return (
    <div data-no-drag-select className="fixed inset-0 z-[75] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in"
        onClick={() => !isSubmitting && setShowAuthDialog(false)}
      />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10">
        <div className="mb-5">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">购买或兑换</h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {session.status === 'authenticated'
              ? '输入新的兑换码即可给当前账户加额，也可以直接去购买更多额度。'
              : '先试用，用完后购买额度并输入兑换码继续生成，无需注册。'}
          </p>
        </div>

        {session.status === 'anonymous' && session.trial && (
          <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
            <div className="font-medium">试用剩余 {session.trial.remainingCredits}/{session.trial.limit}</div>
            <div className="mt-1 text-blue-600/80 dark:text-blue-200/80">{trialGuidance}</div>
          </div>
        )}

        <div className="space-y-4 rounded-2xl border border-gray-200/70 bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
          <div>
            <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100">我已有兑换码</h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {session.status === 'authenticated'
                ? '兑换成功后，额度会直接加到当前账户。'
                : '兑换成功后，额度会直接加到当前浏览器。'}
            </p>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-gray-500 dark:text-gray-400">兑换码</span>
            <input
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              autoFocus
              autoComplete="one-time-code"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void handleSubmit()
                }
              }}
              className="rounded-xl border border-gray-200/60 bg-white/70 px-3 py-2 text-sm outline-none transition-colors focus:border-blue-400 dark:border-white/[0.08] dark:bg-white/[0.03]"
              placeholder="输入购买后拿到的兑换码"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isSubmitting}
            className="w-full rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-white/[0.06]"
          >
            {isSubmitting ? '兑换中...' : '立即兑换'}
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-gray-200/70 bg-gray-50/80 p-4 text-xs text-gray-600 dark:border-white/[0.08] dark:bg-white/[0.02] dark:text-gray-300">
          <div>
            <h4 className="text-sm font-medium text-gray-800 dark:text-gray-100">我还没有兑换码</h4>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              {session.status === 'authenticated'
                ? '购买后会获得新的兑换码，回到这里输入即可完成加额。'
                : '购买后会获得兑换码，回到这里输入即可继续使用。'}
            </p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <a
              href={SELF_SERVICE_PURCHASE_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              自助购买
            </a>
            <button
              type="button"
              onClick={() => void handleCopyWechat()}
              className="rounded-xl border border-gray-200/70 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
            >
              复制微信号购买
            </button>
          </div>
          <div className="mt-3 rounded-xl border border-dashed border-gray-200/80 bg-white/70 px-3 py-2 text-[11px] text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
            客服微信号：<span className="font-medium text-gray-700 dark:text-gray-200">{WECHAT_CONTACT_ID}</span>
          </div>
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
        </div>
      </div>
    </div>
  )
}
