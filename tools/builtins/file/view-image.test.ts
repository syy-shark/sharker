/**
 * 官方 view_image 执行：短结果、沙箱、别名共用。
 * @see ./view-image.ts
 */
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../../shared/types'
import { parseViewImageToolOutput } from '../../../shared/view-image'
import { getAllBuiltinTools } from '../../registry'
import { isToolAllowedInPlanMode } from '../../tool-groups'
import { executeViewImage } from './view-image'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

async function workspaceWithPng(name = 'dot.png') {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'view-image-'))
  dirs.push(dir)
  const file = path.join(dir, name)
  await fs.writeFile(file, TINY_PNG)
  const settings = {
    ...DEFAULT_SETTINGS,
    permissionMode: 'full' as const,
    workspacePath: dir,
    workspaces: [{ id: 'w', label: 't', path: dir }],
    activeWorkspaceId: 'w'
  }
  return { dir, file, settings }
}

describe('executeViewImage', () => {
  it('registers official view_image and allows it in plan mode', () => {
    expect(getAllBuiltinTools().some((tool) => tool.name === 'view_image')).toBe(true)
    expect(isToolAllowedInPlanMode('view_image')).toBe(true)
    expect(isToolAllowedInPlanMode('read_image')).toBe(true)
  })

  it('writes a short official-style result without base64', async () => {
    const { file, settings } = await workspaceWithPng()
    const result = await executeViewImage({ path: file }, { settings })
    expect(result.output).toContain('Viewed image:')
    expect(result.output).not.toMatch(/base64/)
    expect(parseViewImageToolOutput(result.output)).toEqual({
      path: file,
      detail: null
    })
  })

  it('keeps original detail and accepts a path with spaces', async () => {
    const { file, settings } = await workspaceWithPng('my shot.png')
    const result = await executeViewImage(
      { path: file, detail: 'original' },
      { settings }
    )
    expect(parseViewImageToolOutput(result.output)).toEqual({
      path: file,
      detail: 'original'
    })
  })

  it('rejects a non-image and a missing file', async () => {
    const { dir, settings } = await workspaceWithPng()
    const txt = path.join(dir, 'notes.txt')
    await fs.writeFile(txt, 'hi')
    await expect(executeViewImage({ path: txt }, { settings })).rejects.toThrow(/Not an image/)
    await expect(
      executeViewImage({ path: path.join(dir, 'gone.png') }, { settings })
    ).rejects.toThrow()
  })

  it('denies a path outside the sandbox workspace', async () => {
    const { file } = await workspaceWithPng()
    const other = await fs.mkdtemp(path.join(os.tmpdir(), 'view-image-sandbox-'))
    dirs.push(other)
    const settings = {
      ...DEFAULT_SETTINGS,
      permissionMode: 'sandbox' as const,
      workspacePath: other,
      workspaces: [{ id: 'w', label: 't', path: other }],
      activeWorkspaceId: 'w'
    }
    await expect(executeViewImage({ path: file }, { settings })).rejects.toThrow(
      /沙箱模式禁止访问工作区外的路径/
    )
  })
})
