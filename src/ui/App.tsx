import type { FC } from 'react'
import { AgentChat } from './components'
import './styles/App.css'

const App: FC = () => {
  return (
    <div className="app">
      <AgentChat />
    </div>
  )
}

export default App
