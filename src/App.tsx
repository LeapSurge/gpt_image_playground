import { useEffect, useRef, useState } from 'react'
import { initStore } from './store'
import { useStore } from './store'
import { useDockerApiUrlMigrationNotice } from './hooks/useDockerApiUrlMigrationNotice'
import Header from './components/Header'
import SearchBar from './components/SearchBar'
import TaskGrid from './components/TaskGrid'
import InputBar from './components/InputBar'
import DetailModal from './components/DetailModal'
import Lightbox from './components/Lightbox'
import SettingsModal from './components/SettingsModal'
import ConfirmDialog from './components/ConfirmDialog'
import Toast from './components/Toast'
import MaskEditorModal from './components/MaskEditorModal'
import ImageContextMenu from './components/ImageContextMenu'
import AuthModal from './components/AuthModal'

export default function App() {
  const tasks = useStore((s) => s.tasks)
  const [showStarter, setShowStarter] = useState(false)
  const previousTaskCountRef = useRef(tasks.length)

  useDockerApiUrlMigrationNotice()

  useEffect(() => {
    initStore()
  }, [])

  useEffect(() => {
    if (tasks.length > previousTaskCountRef.current) {
      setShowStarter(false)
    }
    previousTaskCountRef.current = tasks.length
  }, [tasks.length])

  useEffect(() => {
    const preventPageImageDrag = (e: DragEvent) => {
      if ((e.target as HTMLElement | null)?.closest('img')) {
        e.preventDefault()
      }
    }

    document.addEventListener('dragstart', preventPageImageDrag)
    return () => document.removeEventListener('dragstart', preventPageImageDrag)
  }, [])

  return (
    <>
      <Header />
      <main data-home-main data-drag-select-surface className="pb-48">
        <div className="safe-area-x max-w-7xl mx-auto">
          {tasks.length > 0 && <SearchBar showStarter={showStarter} onToggleStarter={() => setShowStarter((value) => !value)} />}
          <TaskGrid showStarter={showStarter} onApplyStarter={() => setShowStarter(false)} />
        </div>
      </main>
      <InputBar />
      <DetailModal />
      <Lightbox />
      <SettingsModal />
      <ConfirmDialog />
      <Toast />
      <MaskEditorModal />
      <ImageContextMenu />
      <AuthModal />
    </>
  )
}
