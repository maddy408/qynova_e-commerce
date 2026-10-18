import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import './index.css'
import { AuthProvider } from './context/auth'

// Clean up any stale service workers (e.g. Workbox from other apps previously hosted on localhost:5173)
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      const scriptUrl = registration.active?.scriptURL || ''
      if (!scriptUrl.includes('firebase-messaging-sw.js')) {
        registration.unregister().then((unregistered) => {
          if (unregistered) {
            console.info('[ServiceWorker] Unregistered stale service worker:', scriptUrl)
          }
        }).catch(() => {})
      }
    }
  }).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
