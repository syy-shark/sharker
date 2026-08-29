/**
 * 官方 Read / List / Search 过程文案。
 * @see shared/explore-activity.ts
 */
import { describe, expect, it } from 'vitest'
import {
  exploreNameFromPath,
  formatExploreActivity,
  formatExploreSearch,
  isExploreActivityToolName
} from './explore-activity'

describe('explore-activity', () => {
  it('uses official Read / List / Search with basename targets', () => {
    expect(isExploreActivityToolName('read_file')).toBe(true)
    expect(isExploreActivityToolName('write_file')).toBe(false)
    expect(exploreNameFromPath('src/components/TurnFlow.tsx')).toBe('TurnFlow.tsx')
    expect(formatExploreActivity('read_file', { path: 'package.json' })).toBe('Read package.json')
    expect(formatExploreActivity('list_dir', { path: 'src/components' })).toBe('List components')
    expect(formatExploreActivity('grep', { pattern: 'LiveHead', path: 'src' })).toBe(
      'Search LiveHead in src'
    )
    expect(formatExploreActivity('glob_file_search', { pattern: '*.ts' })).toBe('Search *.ts')
    expect(formatExploreSearch('foo', 'lib')).toBe('Search foo in lib')
    expect(formatExploreActivity('run_terminal_cmd', { command: 'ls' })).toBeNull()
    expect(formatExploreActivity('read_file', {})).toBe('Read')
  })
})
