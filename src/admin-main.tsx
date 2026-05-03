import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import AdminApp from './AdminApp'
import './index.css'
import { installMobileViewportGuards } from './lib/viewport'

installMobileViewportGuards()

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister())
  })
}

createRoot(document.getElementById('admin-root')!).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
)
