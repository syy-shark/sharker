/**
 * Codex 桌面 Ask User：选项 + Other 自由作答，不发明选项备注或分页问卷。
 * @see src/components/ARCH.md
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, LoaderCircle, MessageCircleQuestion, Pencil } from 'lucide-react'
import type { UserInputAnswerPick, UserInputRequest } from '../../shared/types'
import {
  buildUserInputResponse,
  isUserInputReady,
  USER_INPUT_OTHER_LABEL
} from '../../shared/user-input'
import './InlineUserInput.css'

export interface InlineUserInputProps {
  request: UserInputRequest
  onRespond: (response: import('../../shared/types').UserInputResponse) => void | Promise<void>
  responding?: boolean
}

/** 对话内结构化提问：每题互斥选项 + 铅笔 Other 行。 */
export function InlineUserInput({ request, onRespond, responding = false }: InlineUserInputProps) {
  const rootRef = useRef<HTMLElement>(null)
  const submittedRequestRef = useRef<string | null>(null)
  const [picks, setPicks] = useState<Record<string, UserInputAnswerPick>>({})
  const [submitted, setSubmitted] = useState(false)
  const titleId = useId()
  const descriptionId = useId()

  const busy = responding || submitted
  const ready = useMemo(() => isUserInputReady(request.questions, picks), [request.questions, picks])

  useEffect(() => {
    submittedRequestRef.current = null
    setSubmitted(false)
    setPicks({})
    rootRef.current?.focus({ preventScroll: true })
  }, [request.id])

  const chooseOption = (questionId: string, label: string) => {
    if (busy) return
    setPicks((prev) => ({ ...prev, [questionId]: { kind: 'option', label } }))
  }

  const chooseOther = (questionId: string) => {
    if (busy) return
    setPicks((prev) => {
      const current = prev[questionId]
      return {
        ...prev,
        [questionId]: { kind: 'other', other: current?.kind === 'other' ? current.other : '' }
      }
    })
  }

  const typeOther = (questionId: string, other: string) => {
    if (busy) return
    setPicks((prev) => ({ ...prev, [questionId]: { kind: 'other', other } }))
  }

  const submit = () => {
    if (busy || !ready || submittedRequestRef.current === request.id) return
    submittedRequestRef.current = request.id
    setSubmitted(true)
    const response = buildUserInputResponse(request.questions, picks)
    const resetAfterFailure = () => {
      if (submittedRequestRef.current !== request.id) return
      submittedRequestRef.current = null
      setSubmitted(false)
    }
    try {
      void Promise.resolve(onRespond(response)).catch(resetAfterFailure)
    } catch {
      resetAfterFailure()
    }
  }

  return (
    <section
      ref={rootRef}
      className="inline-user-input"
      role="region"
      aria-live="polite"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={busy}
      tabIndex={-1}
    >
      <div className="inline-user-input__heading">
        <span className="inline-user-input__icon" aria-hidden="true">
          <MessageCircleQuestion size={17} strokeWidth={1.9} />
        </span>
        <div className="inline-user-input__title-wrap">
          <span className="inline-user-input__eyebrow">需要你的选择</span>
          <h3 id={titleId}>
            {request.questions.length === 1 ? request.questions[0]!.header : `${request.questions.length} 个问题`}
          </h3>
        </div>
      </div>
      <p id={descriptionId} className="inline-user-input__hint">
        请先回答问题后再继续。
      </p>

      <div className="inline-user-input__questions">
        {request.questions.map((question) => {
          const pick = picks[question.id]
          const otherSelected = pick?.kind === 'other'
          const otherValue = pick?.kind === 'other' ? pick.other : ''
          return (
            <fieldset key={question.id} className="inline-user-input__question" disabled={busy}>
              <legend>
                <span className="inline-user-input__header">{question.header}</span>
                <span className="inline-user-input__prompt">{question.question}</span>
              </legend>
              <div className="inline-user-input__options" role="radiogroup" aria-label={question.question}>
                {question.options.map((option) => {
                  const selected = pick?.kind === 'option' && pick.label === option.label
                  return (
                    <button
                      key={option.label}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      className={`inline-user-input__option${selected ? ' is-selected' : ''}`}
                      onClick={() => chooseOption(question.id, option.label)}
                    >
                      <span className="inline-user-input__radio" aria-hidden="true">
                        {selected ? <Check size={12} strokeWidth={2.4} /> : null}
                      </span>
                      <span className="inline-user-input__option-copy">
                        <span className="inline-user-input__option-label">{option.label}</span>
                        {option.description ? (
                          <span className="inline-user-input__option-desc">{option.description}</span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
                <button
                  type="button"
                  role="radio"
                  aria-checked={otherSelected}
                  className={`inline-user-input__option inline-user-input__option--other${
                    otherSelected ? ' is-selected' : ''
                  }`}
                  onClick={() => chooseOther(question.id)}
                >
                  <span className="inline-user-input__radio" aria-hidden="true">
                    <Pencil size={11} strokeWidth={2} />
                  </span>
                  <span className="inline-user-input__option-copy">
                    <span className="inline-user-input__option-label">{USER_INPUT_OTHER_LABEL}</span>
                    <span className="inline-user-input__option-desc">自由作答</span>
                  </span>
                </button>
                {otherSelected ? (
                  <label className="inline-user-input__other-field">
                    <input
                      type="text"
                      aria-label="其他答案"
                      value={otherValue}
                      placeholder="写下你的选择…"
                      onChange={(event) => typeOther(question.id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                          event.preventDefault()
                          submit()
                        }
                      }}
                    />
                  </label>
                ) : null}
              </div>
            </fieldset>
          )
        })}
      </div>

      <div className="inline-user-input__actions">
        <span className="inline-user-input__status" role="status" aria-live="polite">
          {busy ? (
            <>
              <LoaderCircle size={14} aria-hidden="true" />
              正在提交
            </>
          ) : null}
        </span>
        <button
          type="button"
          className="inline-user-input__submit"
          disabled={busy || !ready}
          onClick={submit}
        >
          提交
        </button>
      </div>
    </section>
  )
}
