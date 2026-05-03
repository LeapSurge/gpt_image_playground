import type { ManagedTrialState } from '../types'

const trialResetFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

function formatTrialResetAt(resetAt: string | null) {
  if (!resetAt) return null

  const parsed = new Date(resetAt)
  if (Number.isNaN(parsed.getTime())) return null

  return trialResetFormatter.format(parsed)
}

export function getTrialResetGuidance(trial: ManagedTrialState | null) {
  const resetLabel = formatTrialResetAt(trial?.resetAt ?? null)
  if (resetLabel) {
    return `试用额度将于 ${resetLabel} 刷新`
  }
  return '试用额度每 7 天自动刷新一次'
}

export function getTrialResetBadge(trial: ManagedTrialState | null) {
  const resetLabel = formatTrialResetAt(trial?.resetAt ?? null)
  return resetLabel ? `${resetLabel} 刷新` : '每 7 天刷新'
}
