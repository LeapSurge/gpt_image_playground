import { useMemo, useRef, useState, useEffect } from 'react'
import { useStore, reuseConfig, editOutputs, removeTask } from '../store'
import TaskCard from './TaskCard'

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 640)
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return isMobile
}

export default function TaskGrid() {
  const tasks = useStore((s) => s.tasks)
  const searchQuery = useStore((s) => s.searchQuery)
  const filterStatus = useStore((s) => s.filterStatus)
  const filterFavorite = useStore((s) => s.filterFavorite)
  const setFilterStatus = useStore((s) => s.setFilterStatus)
  const setFilterFavorite = useStore((s) => s.setFilterFavorite)
  const setSearchQuery = useStore((s) => s.setSearchQuery)
  const setDetailTaskId = useStore((s) => s.setDetailTaskId)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const selectedTaskIds = useStore((s) => s.selectedTaskIds)
  const setSelectedTaskIds = useStore((s) => s.setSelectedTaskIds)
  const clearSelection = useStore((s) => s.clearSelection)
  const isMobile = useIsMobile()
  const rootRef = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const focusedSectionRef = useRef<HTMLElement>(null)
  const [selectionBox, setSelectionBox] = useState<{ startX: number; startY: number; currentX: number; currentY: number } | null>(null)
  const [isFocusedTaskVisible, setIsFocusedTaskVisible] = useState(true)
  const isDragging = useRef(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)
  const hasDragged = useRef(false)
  const suppressClickUntil = useRef(0)
  const startedOnCard = useRef(false)
  const startedWithCtrl = useRef(false)
  const initialSelection = useRef<string[]>([])
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)

  const filteredTasks = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt)
    const q = searchQuery.trim().toLowerCase()
    
    return sorted.filter((t) => {
      if (filterFavorite && !t.isFavorite) return false
      const matchStatus = filterStatus === 'all' || t.status === filterStatus
      if (!matchStatus) return false
      
      if (!q) return true
      const prompt = (t.prompt || '').toLowerCase()
      const paramStr = JSON.stringify(t.params).toLowerCase()
      return prompt.includes(q) || paramStr.includes(q)
    })
  }, [tasks, searchQuery, filterStatus, filterFavorite])

  const latestActiveTask = useMemo(() => {
    return [...tasks]
      .sort((a, b) => b.createdAt - a.createdAt)
      .find((task) => task.status === 'running' || (task.status === 'error' && task.falRecoverable))
  }, [tasks])

  const isActiveTaskHidden = Boolean(
    latestActiveTask &&
    !filteredTasks.some((task) => task.id === latestActiveTask.id)
  )

  const shouldShowFocusedTask = Boolean(
    isMobile &&
    latestActiveTask &&
    !isActiveTaskHidden &&
    !searchQuery.trim() &&
    !filterFavorite &&
    filterStatus === 'all'
  )

  const regularTasks = useMemo(() => {
    if (!shouldShowFocusedTask || !latestActiveTask) return filteredTasks
    return filteredTasks.filter((task) => task.id !== latestActiveTask.id)
  }, [filteredTasks, latestActiveTask, shouldShowFocusedTask])

  const focusedTaskStatusLabel = latestActiveTask?.status === 'error' && latestActiveTask?.falRecoverable
    ? '重连中'
    : '正在生成'

  const revealActiveTask = () => {
    setSearchQuery('')
    setFilterFavorite(false)
    setFilterStatus('all')
  }

  const showFloatingReminder = Boolean(
    isMobile &&
    latestActiveTask &&
    (isActiveTaskHidden || !isFocusedTaskVisible)
  )

  const handleFocusReminderClick = () => {
    if (isActiveTaskHidden) {
      revealActiveTask()
      window.setTimeout(() => {
        focusedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
      return
    }
    focusedSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const handleDelete = (task: typeof tasks[0]) => {
    setConfirmDialog({
      title: '删除记录',
      message: '确定要删除这条记录吗？关联的图片资源也会被清理（如果没有其他任务引用）。',
      action: () => removeTask(task),
    })
  }

  const beginSelection = (target: HTMLElement, clientX: number, clientY: number, isCtrl: boolean) => {
    startedOnCard.current = Boolean(target.closest('.task-card-wrapper'))
    startedWithCtrl.current = isCtrl
    initialSelection.current = [...useStore.getState().selectedTaskIds]

    isDragging.current = true
    hasDragged.current = false
    dragStart.current = { x: clientX, y: clientY }
    document.body.classList.add('select-none')
    document.body.classList.add('drag-selecting')
    setSelectionBox({
      startX: clientX,
      startY: clientY,
      currentX: clientX,
      currentY: clientY,
    })
  }

  const updateSelectionFromPoint = (clientX: number, clientY: number) => {
    const start = dragStart.current
    if (!start || !gridRef.current) return

    const minX = Math.min(start.x, clientX)
    const maxX = Math.max(start.x, clientX)
    const minY = Math.min(start.y, clientY)
    const maxY = Math.max(start.y, clientY)

    const cards = gridRef.current.querySelectorAll('.task-card-wrapper')
    const newSelected = new Set(initialSelection.current)
    const initialSelected = new Set(initialSelection.current)

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect()
      const taskId = card.getAttribute('data-task-id')
      if (!taskId) return

      const isIntersecting =
        minX < rect.right && maxX > rect.left && minY < rect.bottom && maxY > rect.top

      if (isIntersecting) {
        if (initialSelected.has(taskId)) {
          newSelected.delete(taskId)
        } else {
          newSelected.add(taskId)
        }
      } else if (!initialSelected.has(taskId)) {
        newSelected.delete(taskId)
      }
    })

    setSelectedTaskIds(Array.from(newSelected))
  }

  useEffect(() => {
    const getEventElement = (e: MouseEvent) => {
      if (e.target instanceof Element) return e.target
      return document.elementFromPoint(e.clientX, e.clientY)
    }

    const handleDocumentMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return
      const target = getEventElement(e)
      if (!target) return
      if (!target.closest('[data-drag-select-surface]')) return
      if (target.closest('[data-input-bar]')) return
      if (target.closest('[data-no-drag-select], [data-lightbox-root]')) return
      if (target.closest('button, a, input, textarea, select')) return

      const isCtrl = isMac ? e.metaKey : e.ctrlKey
      beginSelection(target as HTMLElement, e.clientX, e.clientY, isCtrl)
      e.preventDefault()
    }

    const handleDocumentMouseMove = (e: MouseEvent) => {
      if (!isDragging.current || !dragStart.current) return

      const start = dragStart.current
      const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y)
      if (distance < 6 && !hasDragged.current) return

      hasDragged.current = true
      setSelectionBox({
        startX: start.x,
        startY: start.y,
        currentX: e.clientX,
        currentY: e.clientY,
      })
      updateSelectionFromPoint(e.clientX, e.clientY)
      e.preventDefault()
    }

    const handleDocumentMouseUp = () => {
      if (isDragging.current) {
        document.body.classList.remove('select-none')
        document.body.classList.remove('drag-selecting')
      }
      if (isDragging.current && !hasDragged.current && !startedOnCard.current && !startedWithCtrl.current) {
        clearSelection()
      }
      if (isDragging.current && hasDragged.current) {
        suppressClickUntil.current = Date.now() + 250
      }
      isDragging.current = false
      dragStart.current = null
      setSelectionBox(null)
    }

    document.addEventListener('mousedown', handleDocumentMouseDown, true)
    document.addEventListener('mousemove', handleDocumentMouseMove, true)
    document.addEventListener('mouseup', handleDocumentMouseUp, true)
    return () => {
      document.removeEventListener('mousedown', handleDocumentMouseDown, true)
      document.removeEventListener('mousemove', handleDocumentMouseMove, true)
      document.removeEventListener('mouseup', handleDocumentMouseUp, true)
    }
  }, [clearSelection, isMac])

  useEffect(() => {
    if (!shouldShowFocusedTask || !focusedSectionRef.current) {
      setIsFocusedTaskVisible(false)
      return
    }

    const target = focusedSectionRef.current
    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsFocusedTaskVisible(entry.isIntersecting)
      },
      {
        threshold: 0.35,
      },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [shouldShowFocusedTask, latestActiveTask?.id])

  if (!filteredTasks.length && !isActiveTaskHidden) {
    return (
      <div className="py-8 text-gray-400 dark:text-gray-500 sm:py-10">
        <p className="text-center text-sm">
          {tasks.length === 0 ? '还没有生成记录' : '没有找到匹配的记录'}
        </p>
      </div>
    )
  }

  return (
    <div 
      ref={rootRef}
      data-task-grid-root
      className="relative min-h-[50vh]"
    >
      {showFloatingReminder && latestActiveTask && (
        <button
          type="button"
          onClick={handleFocusReminderClick}
          className="fixed left-1/2 z-40 flex w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 items-center gap-2 rounded-full border border-gray-300 bg-white px-3 py-2 text-left text-gray-900 shadow-[0_16px_32px_rgba(15,23,42,0.18)] transition hover:bg-gray-50 dark:border-white/[0.12] dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-900 sm:left-auto sm:right-6 sm:w-auto sm:max-w-none sm:translate-x-0"
          style={{ bottom: '6.75rem' }}
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500 animate-pulse" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-200">
            {isActiveTaskHidden ? '当前任务被筛选隐藏' : '当前任务进行中'}
          </span>
          <span className="shrink-0 text-[11px] font-semibold text-gray-500 dark:text-gray-300">
            查看
          </span>
        </button>
      )}
      {shouldShowFocusedTask && latestActiveTask && (
        <section ref={focusedSectionRef} className="mb-5">
          <div className="rounded-[28px] border border-gray-200/80 bg-white/90 p-4 shadow-[0_16px_36px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-gray-900/90">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0 flex items-center gap-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50">
                  当前任务
                </h2>
                <div className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] text-gray-500 dark:text-gray-400">
                  <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                  {focusedTaskStatusLabel}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailTaskId(latestActiveTask.id)}
                className="shrink-0 rounded-full border border-gray-200/80 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-white dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-gray-200 dark:hover:bg-white/[0.08]"
              >
                查看详情
              </button>
            </div>
            <TaskCard
              task={latestActiveTask}
              onClick={(e) => {
                e.preventDefault()
                setDetailTaskId(latestActiveTask.id)
              }}
              onReuse={() => reuseConfig(latestActiveTask)}
              onEditOutputs={() => editOutputs(latestActiveTask)}
              onDelete={() => handleDelete(latestActiveTask)}
              isSelected={selectedTaskIds.includes(latestActiveTask.id)}
              variant="focus"
            />
          </div>
        </section>
      )}
      {regularTasks.length > 0 && shouldShowFocusedTask && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="text-[11px] font-semibold tracking-[0.14em] text-gray-400 dark:text-gray-500">
            最近记录
          </div>
        </div>
      )}
      <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-10">
        {regularTasks.map((task) => (
          <div key={task.id} className="task-card-wrapper" data-task-id={task.id}>
            <TaskCard
              task={task}
              onClick={(e) => {
                if (Date.now() < suppressClickUntil.current) {
                  e.preventDefault()
                  return
                }
                suppressClickUntil.current = 0
                const isCtrl = isMac ? e.metaKey : e.ctrlKey
                if (isCtrl) {
                  useStore.getState().toggleTaskSelection(task.id)
                } else if (selectedTaskIds.length > 0) {
                  clearSelection()
                  setDetailTaskId(task.id)
                } else {
                  setDetailTaskId(task.id)
                }
              }}
              onReuse={() => reuseConfig(task)}
              onEditOutputs={() => editOutputs(task)}
              onDelete={() => handleDelete(task)}
              isSelected={selectedTaskIds.includes(task.id)}
            />
          </div>
        ))}
      </div>
      {selectionBox && (
        <div
          className="fixed bg-blue-500/20 border border-blue-500/50 pointer-events-none z-[30]"
          style={{
            left: Math.min(selectionBox.startX, selectionBox.currentX),
            top: Math.min(selectionBox.startY, selectionBox.currentY),
            width: Math.abs(selectionBox.currentX - selectionBox.startX),
            height: Math.abs(selectionBox.currentY - selectionBox.startY),
          }}
        />
      )}
    </div>
  )
}
