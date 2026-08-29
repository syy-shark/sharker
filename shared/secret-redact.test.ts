import { describe, expect, it } from 'vitest'
import { redactKnownSecrets } from './secret-redact'

describe('secret redact', () => {
  it('replaces known token shapes and leaves ordinary paths', () => {
    const src = [
      'key sk-abcdefghijklmnopqrstuvwxyz012345',
      'proj sk-proj-abcdefghijklmnopqrstuvwx',
      'gh github_pat_abcdefghijklmnopqrstuv',
      'gho gho_abcdefghijklmnopqrstuvwx',
      'slack xoxb-1234567890-abcdefghij',
      'aws AKIAIOSFODNN7EXAMPLE',
      'google AIzaSyA-abcdefghijklmnopqrstuvwxyz01234',
      'hdr Bearer abcdefghijklmnopqrstuvwxyz0123',
      'env API_KEY=supersecretvalue',
      'pem -----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
      'path src/app.ts:12'
    ].join('\n')
    const { text, redactedCount } = redactKnownSecrets(src)
    expect(redactedCount).toBeGreaterThanOrEqual(9)
    expect(text).toContain('[REDACTED:API_KEY]')
    expect(text).toContain('[REDACTED:GITHUB_TOKEN]')
    expect(text).toContain('[REDACTED:SLACK_TOKEN]')
    expect(text).toContain('[REDACTED:AWS_KEY]')
    expect(text).toContain('[REDACTED:GOOGLE_KEY]')
    expect(text).toContain('[REDACTED:BEARER]')
    expect(text).toContain('[REDACTED:SECRET]')
    expect(text).toContain('[REDACTED:PRIVATE_KEY]')
    expect(text).toContain('src/app.ts:12')
    expect(text).not.toContain('sk-abcdefghijklmnopqrstuvwxyz012345')
    expect(text).not.toContain('github_pat_abcdefghijklmnopqrstuv')
  })
})
