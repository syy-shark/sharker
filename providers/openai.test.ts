import { describe, expect, it } from 'vitest'
import { extractPartialWriteToolArgs } from './openai'

describe('extractPartialWriteToolArgs', () => {
  it('reads growing write / replace / patch JSON without inventing diff lines', () => {
    expect(extractPartialWriteToolArgs('write_file', '{"path": "src/a.ts"')).toEqual({
      path: 'src/a.ts'
    })
    expect(
      extractPartialWriteToolArgs('write_file', '{"path": "src/a.ts", "content": "one\\ntwo')
    ).toEqual({
      path: 'src/a.ts',
      content: 'one\ntwo'
    })
    expect(
      extractPartialWriteToolArgs(
        'search_replace',
        '{"path": "b.ts", "old_string": "aa", "new_string": "bb'
      )
    ).toEqual({
      path: 'b.ts',
      old_string: 'aa',
      new_string: 'bb'
    })
    expect(
      extractPartialWriteToolArgs(
        'apply_patch',
        '{"patch": "*** Update File: d.ts\\n@@\\n+hi'
      )
    ).toEqual({
      path: 'd.ts',
      patch: '*** Update File: d.ts\n@@\n+hi'
    })
    expect(extractPartialWriteToolArgs('read_file', '{"path": "x.ts"}')).toBeUndefined()
    expect(
      extractPartialWriteToolArgs(undefined, '{"path": "c.ts", "content": "hello')
    ).toEqual({
      path: 'c.ts',
      content: 'hello'
    })
  })
})
