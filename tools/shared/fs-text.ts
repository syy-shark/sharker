/**
 * 文本文件读写辅助。
 * @see tools/README.md
 */
import fs from 'fs/promises'

/** 读文本文件；不存在返回 null */
export async function readTextFileOrNull(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, 'utf8')
  } catch (e) {
    const err = e as NodeJS.ErrnoException
    if (err.code === 'ENOENT') return null
    throw e
  }
}
