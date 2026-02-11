import type { FC } from 'react'
import { ChatApp } from './components/ChatApp'
import './styles/base.css'
import './styles/chat.css'
import './styles/tool-calls.css'
import './styles/thinking.css'
import './styles/composer.css'
import './styles/markdown.css'
import './styles/markdown-content.css'
import './styles/settings.css'
import './styles/skills.css'
import './styles/sidebar.css'
import './styles/marketplace.css'

const App: FC = () => {
  return <ChatApp />
}

export default App
