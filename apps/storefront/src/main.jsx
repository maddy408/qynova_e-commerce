import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      const scriptUrl = registration.active?.scriptURL || ''
      if (!scriptUrl.includes('firebase-messaging-sw.js')) {
        registration.unregister().catch(() => {})
      }
    }
  }).catch(() => {})
}

if (typeof document !== 'undefined') {
  document.title = 'Shop with Adam — Fresh Daily Essentials'
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
