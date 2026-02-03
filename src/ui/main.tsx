import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'

// Read tabId from URL params (set by background when opening panel)
const params = new URLSearchParams(window.location.search)
const tabId = params.get('tabId')

// Store tabId globally for use in components
if (tabId) {
  ;(window as unknown as { __browseRunTabId: number }).__browseRunTabId = parseInt(tabId, 10)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
