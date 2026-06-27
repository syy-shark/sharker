/**
 * 集成终端（xterm.js + node-pty IPC）。
 */
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './EmbeddedTerminal.css'

interface Props {
  workspacePath: string
}

/** xterm 终端面板 */
export function EmbeddedTerminal({ workspacePath }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const sessionRef = useRef<string | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !window.sharker?.createTerminal) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
      theme: {
        background: '#1a1d24',
        foreground: '#e8eaed'
      }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    let disposed = false
    const offData = window.sharker.onTerminalData?.((payload) => {
      if (payload.id !== sessionRef.current) return
      term.write(payload.data)
    })
    const offExit = window.sharker.onTerminalExit?.((payload) => {
      if (payload.id !== sessionRef.current) return
      term.writeln('\r\n[进程已退出]')
    })

    void window.sharker.createTerminal(workspacePath).then(({ id }) => {
      if (disposed) {
        void window.sharker.killTerminal(id)
        return
      }
      sessionRef.current = id
      term.onData((data) => {
        void window.sharker.writeTerminal(id, data)
      })
      const cols = term.cols
      const rows = term.rows
      void window.sharker.resizeTerminal(id, cols, rows)
    })

    const ro = new ResizeObserver(() => {
      fit.fit()
      const id = sessionRef.current
      if (id && termRef.current) {
        void window.sharker.resizeTerminal(id, term.cols, term.rows)
      }
    })
    ro.observe(host)

    return () => {
      disposed = true
      offData?.()
      offExit?.()
      ro.disconnect()
      const id = sessionRef.current
      if (id) void window.sharker.killTerminal(id)
      term.dispose()
      termRef.current = null
    }
  }, [workspacePath])

  return <div className="embedded-terminal" ref={hostRef} />
}
