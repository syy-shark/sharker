import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildUserInputResponse,
  isClientOtherLabel,
  isUserInputReady,
  parseRequestUserInput,
  raceWithAbort,
  serializeUserInputResponse,
  summarizeUserInputRequest,
  ANSWER_THE_QUESTIONS_TO_CONTINUE,
  USER_INPUT_QUESTION_REQUESTED
} from './user-input'

describe('request_user_input contract', () => {
  it('parses official questions, strips model Other, and serializes answers', async () => {
    const parsed = parseRequestUserInput({
      questions: [
        {
          id: 'api_style',
          header: 'API style',
          question: 'How should the public API look?',
          options: [
            { label: 'REST (Recommended)', description: 'Familiar HTTP resources.' },
            { label: 'gRPC', description: 'Typed streaming.' },
            { label: 'Other', description: 'Should be stripped.' }
          ]
        },
        {
          id: 'Too Long Header Name',
          header: 'This header is way too long',
          question: 'Keep the header short.',
          options: [
            { label: 'Yes', description: 'Clip it.' },
            { label: 'No', description: 'Keep verbose.' }
          ]
        }
      ]
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.questions).toHaveLength(2)
    expect(parsed.questions[0]!.options.map((o) => o.label)).toEqual([
      'REST (Recommended)',
      'gRPC'
    ])
    expect(parsed.questions[1]!.id).toBe('too_long_header_name')
    expect(parsed.questions[1]!.header.length).toBeLessThanOrEqual(12)
    expect(isClientOtherLabel('None of the above')).toBe(true)
    expect(isUserInputReady(parsed.questions, {})).toBe(false)

    const picks = {
      api_style: { kind: 'option' as const, label: 'REST (Recommended)' },
      too_long_header_name: { kind: 'other' as const, other: '  GraphQL  ' }
    }
    expect(isUserInputReady(parsed.questions, picks)).toBe(true)
    const response = buildUserInputResponse(parsed.questions, picks)
    expect(response).toEqual({
      answers: {
        api_style: { answers: ['REST (Recommended)'] },
        too_long_header_name: { answers: ['GraphQL'] }
      }
    })
    expect(serializeUserInputResponse(response)).toContain('"GraphQL"')
    expect(summarizeUserInputRequest(parsed.questions)).toBe('2 questions requested')
    expect(summarizeUserInputRequest(parsed.questions.slice(0, 1))).toBe('API style')
    expect(summarizeUserInputRequest([])).toBe(USER_INPUT_QUESTION_REQUESTED)
    expect(USER_INPUT_QUESTION_REQUESTED).toBe('Question requested')
    expect(ANSWER_THE_QUESTIONS_TO_CONTINUE).toBe('Answer the questions to continue.')
    const askSrc = readFileSync(
      new URL('../src/components/InlineUserInput.tsx', import.meta.url),
      'utf8'
    )
    expect(askSrc).toContain('USER_INPUT_OTHER_LABEL')
    expect(askSrc).not.toContain('              正在提交')
    expect(askSrc).not.toContain('写下你的选择')

    const empty = parseRequestUserInput({ questions: [] })
    expect(empty.ok).toBe(false)
    const missingOptions = parseRequestUserInput({
      questions: [{ id: 'q', header: 'H', question: 'Why?', options: [] }]
    })
    expect(missingOptions.ok).toBe(false)

    const tooMany = parseRequestUserInput({
      questions: [
        {
          id: 'a',
          header: 'A',
          question: 'One?',
          options: [
            { label: '1', description: 'a' },
            { label: '2', description: 'b' }
          ]
        },
        {
          id: 'b',
          header: 'B',
          question: 'Two?',
          options: [
            { label: '1', description: 'a' },
            { label: '2', description: 'b' }
          ]
        },
        {
          id: 'c',
          header: 'C',
          question: 'Three?',
          options: [
            { label: '1', description: 'a' },
            { label: '2', description: 'b' }
          ]
        },
        {
          id: 'd',
          header: 'D',
          question: 'Four?',
          options: [
            { label: '1', description: 'a' },
            { label: '2', description: 'b' }
          ]
        }
      ]
    })
    expect(tooMany.ok).toBe(true)
    if (tooMany.ok) expect(tooMany.questions).toHaveLength(3)

    const ctrl = new AbortController()
    const pending = raceWithAbort(new Promise<string>(() => {}), ctrl.signal)
    ctrl.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})
