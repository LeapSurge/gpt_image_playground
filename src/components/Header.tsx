import { useState } from 'react'
import { logoutManagedSession } from '../lib/managedGatewayClient'
import { getTrialResetBadge } from '../lib/trialCopy'
import { useStore } from '../store'
import { useVersionCheck } from '../hooks/useVersionCheck'
import HelpModal from './HelpModal'

export default function Header() {
  const setShowSettings = useStore((s) => s.setShowSettings)
  const setShowAuthDialog = useStore((s) => s.setShowAuthDialog)
  const session = useStore((s) => s.session)
  const setSession = useStore((s) => s.setSession)
  const showToast = useStore((s) => s.showToast)
  const { hasUpdate, latestRelease, dismiss } = useVersionCheck()
  const [showHelp, setShowHelp] = useState(false)
  const trialBadge = getTrialResetBadge(session.status === 'anonymous' ? session.trial : null)

  const handleLogout = async () => {
    try {
      await logoutManagedSession()
      setSession({
        status: 'anonymous',
        customer: null,
        expiresAt: null,
        trial: null,
      })
      showToast('已退出当前兑换', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error')
    }
  }

  return (
    <header data-no-drag-select className="safe-area-top sticky top-0 z-40 bg-white/80 dark:bg-gray-950/80 backdrop-blur border-b border-gray-200 dark:border-white/[0.08]">
      <div className="safe-area-x safe-header-inner max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-start gap-1">
          <h1 className="text-lg font-bold tracking-tight text-gray-800 dark:text-gray-100">GPT Image Playground</h1>
          {hasUpdate && latestRelease && (
            <a
              href={latestRelease.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={dismiss}
              className="px-1.5 py-0.5 mt-0.5 rounded border border-red-500/30 text-[10px] font-bold bg-red-500 text-white hover:bg-red-600 transition-colors animate-fade-in leading-none"
              title={`新版本 ${latestRelease.tag}`}
            >
              NEW
            </a>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex max-w-[48vw] sm:max-w-none items-center gap-2 rounded-full border border-gray-200/70 bg-white/70 px-3 py-1 text-xs text-gray-600 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300">
            {session.status === 'loading' && <span>状态检查中...</span>}
            {session.status === 'anonymous' && (
              <div className="min-w-0 leading-tight">
                <div className="truncate font-medium text-gray-700 dark:text-gray-100">
                  {session.trial ? `试用剩余 ${session.trial.remainingCredits}/${session.trial.limit}` : '匿名试用'}
                </div>
                <div className="truncate text-[11px] text-gray-500 dark:text-gray-400">{trialBadge}</div>
              </div>
            )}
            {session.status === 'authenticated' && session.customer && (
              <>
                <span className="hidden sm:inline font-medium text-gray-700 dark:text-gray-100">已兑换</span>
                <span className="hidden sm:inline text-gray-400 dark:text-gray-500">|</span>
                <span>额度 {session.customer.remainingCredits}</span>
              </>
            )}
          </div>
          <button
            onClick={() => setShowAuthDialog(true)}
            className="rounded-lg px-3 py-2 text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-500/10"
            title={session.status === 'authenticated' ? '输入兑换码加额' : '购买或输入兑换码'}
          >
            {session.status === 'authenticated' ? '充值/兑换' : '购买/兑换'}
          </button>
          {session.status === 'authenticated' && (
            <button
              onClick={() => void handleLogout()}
              className="rounded-lg px-3 py-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900"
              title="退出当前兑换"
            >
              退出
            </button>
          )}
          <button
            onClick={() => setShowHelp(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            title="操作指南"
          >
            <svg
              className="w-5 h-5 text-gray-600 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              viewBox="0 0 24 24"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <path d="M12 17h.01" />
            </svg>
          </button>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-900 transition-colors"
            title="设置"
          >
            <svg
              className="w-5 h-5 text-gray-600 dark:text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      </div>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </header>
  )
}
