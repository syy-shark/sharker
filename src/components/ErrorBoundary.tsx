/**
 * 渲染错误捕获与降级展示
 * @see src/ARCH.md
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'

/** ErrorBoundary Props */
interface Props {
  children: ReactNode
}

/** ErrorBoundary 内部状态 */
interface State {
  error: Error | null
}

/** React 渲染错误捕获，展示降级 UI */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Sharker render error:', error, info)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 32,
            fontFamily: 'system-ui, sans-serif',
            color: 'var(--text, #18181b)',
            background: 'var(--bg-base, transparent)'
          }}
        >
          <h2 style={{ marginBottom: 12 }}>界面加载出错</h2>
          <pre
            style={{
              background: 'var(--danger-soft, #fef2f2)',
              color: 'var(--danger, #b91c1c)',
              padding: 16,
              borderRadius: 8,
              fontSize: 13,
              overflow: 'auto',
              border: '0.5px solid color-mix(in srgb, var(--danger, #ff3b30) 22%, transparent)'
            }}
          >
            {this.state.error.message}
          </pre>
          <p style={{ marginTop: 16, color: 'var(--text-muted, #71717a)', fontSize: 14 }}>
            请关闭窗口后重新运行 npm run dev
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
