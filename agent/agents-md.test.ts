import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { initAgentsMdFile, loadAgentsInstructions, readPersonalAgentsMd, writePersonalAgentsMd } from './agents-md'

describe('agents md io', () => {
  const temps: string[] = []
  afterEach(async () => {
    await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('loads global override then project AGENTS.md', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'sharker-agents-home-'))
    const repo = await mkdtemp(path.join(os.tmpdir(), 'sharker-agents-repo-'))
    temps.push(home, repo)
    await mkdir(path.join(home, '.sharker'), { recursive: true })
    await writeFile(path.join(home, '.sharker', 'AGENTS.md'), 'global-base')
    await writeFile(path.join(home, '.sharker', 'AGENTS.override.md'), 'global-over')
    await writeFile(path.join(repo, 'AGENTS.md'), 'project-rules')
    const text = await loadAgentsInstructions(repo, { home })
    expect(text).toContain('global-over')
    expect(text).not.toContain('global-base')
    expect(text).toContain('project-rules')
  })

  it('init writes scaffold once', async () => {
    const repo = await mkdtemp(path.join(os.tmpdir(), 'sharker-agents-init-'))
    temps.push(repo)
    const first = await initAgentsMdFile(repo)
    expect(first.ok && first.created).toBe(true)
    if (first.ok) {
      expect(await readFile(first.path, 'utf8')).toContain('## Code Review Rules')
    }
    const second = await initAgentsMdFile(repo)
    expect(second.ok && second.created).toBe(false)
    const nested = path.join(repo, 'services', 'api')
    await mkdir(nested, { recursive: true })
    const sub = await initAgentsMdFile(nested)
    expect(sub.ok && sub.created).toBe(true)
    if (sub.ok) expect(sub.path).toBe(path.join(nested, 'AGENTS.md'))
  })

  it('reads and writes personal AGENTS.md without touching override', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'sharker-personal-agents-'))
    temps.push(home)
    await mkdir(path.join(home, '.sharker'), { recursive: true })
    await writeFile(path.join(home, '.sharker', 'AGENTS.override.md'), 'keep-override')
    const saved = await writePersonalAgentsMd('prefer pnpm', home)
    expect(saved.ok).toBe(true)
    const loaded = await readPersonalAgentsMd(home)
    expect(loaded.content).toBe('prefer pnpm')
    expect(loaded.overrideActive).toBe(true)
    expect(loaded.path).toBe(path.join(home, '.sharker', 'AGENTS.md'))
    expect(await readFile(path.join(home, '.sharker', 'AGENTS.override.md'), 'utf8')).toBe(
      'keep-override'
    )
  })
})
