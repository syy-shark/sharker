/**
 * 浏览器端 `node:crypto` 替身：直播 digest 只需要同步哈希。
 * @see src/ARCH.md
 */

type HashSink = {
  update(data: string | Uint8Array): HashSink
  digest(encoding?: string): string | Uint8Array
}

/** 同步 FNV-1a，够 UI digest 去重，不 pretends 成密码学哈希 */
function fnvHex(input: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(64, '0')
}

/** 兼容 `createHash('sha256').update().digest('hex')` */
export function createHash(_algorithm: string): HashSink {
  let buf = ''
  const sink: HashSink = {
    update(data) {
      buf += typeof data === 'string' ? data : new TextDecoder().decode(data)
      return sink
    },
    digest(encoding) {
      const hex = fnvHex(buf)
      if (encoding === 'hex' || encoding === undefined) return hex
      return new TextEncoder().encode(hex)
    }
  }
  return sink
}

export type Hash = HashSink
