/**
 * 官方 Added / Edited / Deleted 过程文案。
 * @see shared/edit-activity.ts
 */
import { describe, expect, it } from 'vitest'
import { buildProcessSteps } from './process-steps'
import {
  formatEditActivity,
  formatEditFileActivity,
  formatEditedFilesHeader,
  isEditActivityToolName
} from './edit-activity'

describe('edit-activity', () => {
  it('uses official Edited / Deleted verbs and multi-file header', () => {
    expect(isEditActivityToolName('write_file')).toBe(true)
    expect(isEditActivityToolName('read_file')).toBe(false)
    expect(formatEditFileActivity('edit', 'src/a.ts')).toBe('Edited a.ts')
    expect(formatEditFileActivity('add', 'src/new.ts')).toBe('Added new.ts')
    expect(formatEditFileActivity('delete', 'src/gone.ts')).toBe('Deleted gone.ts')
    expect(formatEditedFilesHeader(1)).toBe('Edited 1 file')
    expect(formatEditedFilesHeader(3)).toBe('Edited 3 files')
    expect(formatEditActivity('write_file', { path: 'src/a.ts' })).toBe('Edited a.ts')
    expect(formatEditActivity('search_replace', { path: 'src/b.ts' })).toBe('Edited b.ts')
    expect(formatEditActivity('delete_path', { path: 'src/gone.ts' })).toBe('Deleted gone.ts')
    expect(
      formatEditActivity('move_path', { source: 'src/old.ts', destination: 'src/new.ts' })
    ).toBe('Edited old.ts → new.ts')
    expect(formatEditActivity('apply_patch', { path: 'src/a.ts' })).toBe('Edited a.ts')
    expect(formatEditActivity('apply_patch', {}, undefined, 'error')).toBe('Failed to apply patch')
    expect(formatEditActivity('apply_patch', { path: 'src/a.ts' }, undefined, 'done', 3)).toBe(
      'Edited 3 files'
    )
    expect(formatEditActivity('read_file', { path: 'a.ts' })).toBeNull()
    const replay = buildProcessSteps({
      activities: [
        { kind: 'tool', label: '写入文件 · src/a.ts' },
        { kind: 'tool', label: '删除路径 · src/gone.ts' }
      ]
    })
    expect(replay.map((s) => s.title)).toEqual(['Edited a.ts', 'Deleted gone.ts'])
  })
})
