/**
 * 对话中的可点文件引用：默认打开右侧预览；设置 file_opener 后走官方 URI。
 * @see src/components/ARCH.md
 */
import type { ReactNode } from 'react'
import { dispatchOpenWorkspaceFile } from '../lib/open-workspace-file'
import './FileCiteLink.css'

/** 文件引用按钮 */
export function FileCiteLink({
  path,
  line,
  column,
  children
}: {
  path: string
  line?: number
  column?: number
  children: ReactNode
}) {
  const label = line ? `${path}:${line}` : path
  return (
    <button
      type="button"
      className="file-cite-link"
      title={label}
      onClick={() => dispatchOpenWorkspaceFile({ path, line, column })}
    >
      {children}
    </button>
  )
}
