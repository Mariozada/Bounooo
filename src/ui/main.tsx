import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App'

const params = new URLSearchParams(window.location.search)
const tabId = params.get('tabId')
const groupId = params.get('groupId')

if (tabId) {
  ;(window as unknown as { __bounoTabId: number }).__bounoTabId = parseInt(tabId, 10)
}
if (groupId) {
  ;(window as unknown as { __bounoGroupId: number }).__bounoGroupId = parseInt(groupId, 10)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
