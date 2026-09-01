/**
 * React 入口：挂载根节点并包裹错误边界
 * @see src/ARCH.md
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles/motion.css'
import './styles/global.css'
import './styles/glass.css'
import './styles/maka-shell.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
)
