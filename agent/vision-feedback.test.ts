/**
 * 官方 view_image 视觉回灌：栅格像素进多模态，不把 base64 写进提示句。
 * @see ./vision-feedback.ts
 */
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildViewImageContentParts } from './vision-feedback'

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

const dirs: string[] = []

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })))
})

describe('buildViewImageContentParts', () => {
  it('attaches raster pixels with official detail mapping', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'view-image-vision-'))
    dirs.push(dir)
    const file = path.join(dir, 'dot.png')
    await fs.writeFile(file, TINY_PNG)
    const low = await buildViewImageContentParts(file, null)
    expect(low[0]).toMatchObject({ type: 'text' })
    expect(low[0].type === 'text' && low[0].text).not.toMatch(/base64/)
    expect(low[1]).toMatchObject({
      type: 'image_url',
      image_url: { detail: 'low' }
    })
    expect(
      low[1].type === 'image_url' && low[1].image_url.url.startsWith('data:image/png;base64,')
    ).toBe(true)
    const high = await buildViewImageContentParts(file, 'original')
    expect(high[1]).toMatchObject({
      type: 'image_url',
      image_url: { detail: 'high' }
    })
  })

  it('does not attach SVG pixels', async () => {
    const parts = await buildViewImageContentParts('/tmp/icon.svg', null)
    expect(parts).toEqual([
      { type: 'text', text: '[系统] /tmp/icon.svg 不是可附像素的栅格图，未回灌视觉。' }
    ])
  })
})
