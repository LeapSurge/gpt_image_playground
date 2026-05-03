import { useRef } from 'react'
import { useStore, exportData, importData, clearAllData } from '../store'
import { useCloseOnEscape } from '../hooks/useCloseOnEscape'

export default function SettingsModal() {
  const showSettings = useStore((s) => s.showSettings)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const session = useStore((s) => s.session)
  const importInputRef = useRef<HTMLInputElement>(null)

  useCloseOnEscape(showSettings, () => setShowSettings(false))

  if (!showSettings) return null

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      await importData(file)
    }
    event.target.value = ''
  }

  return (
    <div data-no-drag-select className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in"
        onClick={() => setShowSettings(false)}
      />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-white/50 bg-white/95 p-5 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 overflow-y-auto max-h-[85vh] custom-scrollbar">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">设置</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              你无需自己配置接口或密钥，登录后即可继续使用。
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="select-none font-mono text-xs text-gray-400 dark:text-gray-500">v{__APP_VERSION__}</span>
            <button
              onClick={() => setShowSettings(false)}
              className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label="关闭"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="space-y-6">
          <section className="space-y-3 rounded-2xl border border-gray-200/70 bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div>
              <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">账户状态</h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                当前可用额度和使用权限以你的账号状态为准。
              </p>
            </div>
            {session.status === 'authenticated' && session.customer ? (
              <div className="space-y-1 text-sm text-gray-700 dark:text-gray-200">
                <div>邮箱：{session.customer.email}</div>
                <div>名称：{session.customer.name || '未设置'}</div>
                <div>额度：{session.customer.remainingCredits}</div>
                <div>状态：{session.customer.status === 'active' ? '可用' : '停用'}</div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                尚未登录客户账号。
                {session.trial ? ` 当前浏览器试用额度：${session.trial.remainingCredits}/${session.trial.limit}。` : ''}
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200/70 bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div>
              <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">习惯配置</h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                这些设置仍然只保存在当前浏览器中。
              </p>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm text-gray-700 dark:text-gray-200">提交任务后清空输入框</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">开启后，提交成功时会清空提示词和参考图。</div>
              </div>
              <button
                type="button"
                onClick={() => setSettings({ clearInputAfterSubmit: !settings.clearInputAfterSubmit })}
                className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${settings.clearInputAfterSubmit ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                role="switch"
                aria-checked={settings.clearInputAfterSubmit}
                aria-label="提交任务后清空输入框"
              >
                <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition-transform ${settings.clearInputAfterSubmit ? 'translate-x-[11px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
          </section>

          <section className="space-y-3 rounded-2xl border border-gray-200/70 bg-white/70 p-4 dark:border-white/[0.08] dark:bg-white/[0.03]">
            <div>
              <h4 className="text-sm font-medium text-gray-800 dark:text-gray-200">数据管理</h4>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                历史任务、收藏和本地图片保存在当前浏览器中，可手动导入导出。
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void exportData()}
                className="rounded-xl border border-gray-200/70 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/[0.06]"
              >
                导出数据
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                className="rounded-xl border border-gray-200/70 bg-white px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/[0.06]"
              >
                导入数据
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirmDialog({
                    title: '确认清空',
                    message: '这会清空当前浏览器中的任务记录、图片缓存和本地设置，无法恢复。',
                    confirmText: '清空',
                    tone: 'danger',
                    action: () => {
                      void handleClearAllData()
                    },
                  })
                }
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20 sm:col-span-2"
              >
                清空本地数据
              </button>
            </div>
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={handleImport}
            />
          </section>
        </div>
      </div>
    </div>
  )

  async function handleClearAllData() {
    await clearAllData()
    setShowSettings(false)
  }
}
