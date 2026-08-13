import { describe, expect, it } from 'vitest'
import {
  checkPathAccess,
  isHighRiskCommand,
  isInsideWorkspace,
  needsPathApproval,
  resolveCommandCwd
} from './permissions'

describe('permissions / high-risk gates', () => {
  const workspace = '/Users/shark/项目/sharker'

  it('detects high-risk shell commands deterministically', () => {
    expect(isHighRiskCommand('rm -rf /tmp/x')).toBe(true)
    expect(isHighRiskCommand('sudo rm -rf /')).toBe(true)
    expect(isHighRiskCommand('ls -la')).toBe(false)
  })

  it('sandbox blocks workspace-outside paths', () => {
    expect(isInsideWorkspace('/tmp/x', workspace)).toBe(false)
    const check = checkPathAccess('/tmp/x', workspace, 'sandbox')
    expect(check.allowed).toBe(false)
    expect(check.reason || '').toMatch(/工作区外|沙箱/)
  })

  it('needsPathApproval flags outside file paths under sandbox', () => {
    const reason = needsPathApproval(
      'read_file',
      { path: '/etc/passwd' },
      workspace,
      'sandbox'
    )
    expect(reason || '').toMatch(/工作区外|沙箱|禁止/)
  })

  it('sandbox cwd outside workspace falls back to workspace root', () => {
    expect(resolveCommandCwd('/tmp', workspace, 'sandbox')).toBe(
      require('path').normalize(require('path').resolve(workspace))
    )
  })

  it('full mode allows outside paths', () => {
    expect(checkPathAccess('/tmp/x', workspace, 'full').allowed).toBe(true)
    expect(needsPathApproval('read_file', { path: '/tmp/x' }, workspace, 'full')).toBeNull()
  })
})
