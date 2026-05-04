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
      <div className="safe-area-x safe-header-inner mx-auto flex max-w-7xl pt-1 sm:pt-0">
        <div className="grid min-h-[2.5rem] w-full grid-cols-[auto,1fr,auto] items-center gap-2.5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="flex h-[34px] w-[34px] items-center justify-center overflow-hidden rounded-[12px] bg-[#00061e] shadow-sm ring-1 ring-black/5 dark:ring-white/[0.08]">
              <img
                src="/chatgpt-image-may-3.svg"
                alt="寒兔AI"
                className="h-full w-full scale-[1.18] object-cover"
              />
            </div>
            <h1 className="truncate text-[16px] font-bold leading-none tracking-tight text-gray-800 dark:text-gray-100 sm:text-lg">寒兔AI</h1>
            {hasUpdate && latestRelease && (
              <a
                href={latestRelease.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={dismiss}
                className="mt-0.5 rounded border border-red-500/30 bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white transition-colors hover:bg-red-600 animate-fade-in"
                title={`新版本 ${latestRelease.tag}`}
              >
                NEW
              </a>
            )}
            <div className="hidden min-w-0 rounded-full border border-gray-200/70 bg-white/68 px-2 py-0.5 text-[10px] text-gray-600 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300 sm:inline-flex sm:max-w-none sm:px-3 sm:py-1 sm:text-xs">
              {session.status === 'loading' && <span>状态检查中...</span>}
              {session.status === 'anonymous' && (
                <div className="min-w-0 leading-tight">
                  <div className="truncate font-medium text-gray-700 dark:text-gray-100">
                    {session.trial ? `试用剩余 ${session.trial.remainingCredits}/${session.trial.limit}` : '匿名试用'}
                  </div>
                  <div className="truncate text-[10px] text-gray-500 dark:text-gray-400">{trialBadge}</div>
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
          </div>
          <div className="flex justify-center sm:hidden">
            <div className="inline-flex max-w-[9.75rem] items-center gap-1.5 rounded-full border border-gray-200/70 bg-white/68 px-2 py-0.5 text-[10px] text-gray-600 shadow-sm dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-300">
              {session.status === 'loading' && <span>状态检查中...</span>}
              {session.status === 'anonymous' && (
                <div className="min-w-0 leading-tight">
                  <div className="truncate font-medium text-gray-700 dark:text-gray-100">
                    {session.trial ? `试用剩余 ${session.trial.remainingCredits}/${session.trial.limit}` : '匿名试用'}
                  </div>
                  <div className="truncate text-[10px] text-gray-500 dark:text-gray-400">{trialBadge}</div>
                </div>
              )}
              {session.status === 'authenticated' && session.customer && (
                <span className="truncate">额度 {session.customer.remainingCredits}</span>
              )}
            </div>
          </div>
          <div className="flex flex-shrink-0 items-center justify-end gap-1 sm:gap-2">
            <button
              onClick={() => setShowAuthDialog(true)}
              className="flex h-8 items-center rounded-full border border-blue-100 bg-blue-50 px-2.5 text-[11px] font-semibold leading-none text-blue-600 shadow-sm transition-colors hover:bg-blue-100 dark:border-blue-400/20 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20 sm:h-auto sm:rounded-lg sm:px-3 sm:py-2 sm:text-xs"
              title={session.status === 'authenticated' ? '输入兑换码加额' : '购买或输入兑换码'}
            >
              {session.status === 'authenticated' ? '充值/兑换' : '购买/兑换'}
            </button>
            {session.status === 'authenticated' && (
              <button
                onClick={() => void handleLogout()}
                className="flex h-8 items-center rounded-lg px-2.5 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-900 sm:h-auto sm:px-3 sm:py-2 sm:text-xs"
                title="退出当前兑换"
              >
                退出
              </button>
            )}
            <button
              onClick={() => setShowHelp(true)}
              className="hidden h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900 sm:flex sm:h-auto sm:w-auto sm:rounded-lg sm:p-2"
              title="操作指南"
            >
              <svg
                className="h-[18px] w-[18px] text-gray-600 dark:text-gray-400 sm:h-5 sm:w-5"
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
              className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-900 sm:h-auto sm:w-auto sm:rounded-lg sm:p-2"
              title="设置"
            >
              <svg
                className="h-[18px] w-[18px] text-gray-600 dark:text-gray-400 sm:h-5 sm:w-5"
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
      </div>
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
    </header>
  )
}
