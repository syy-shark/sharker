/**
 * 外观：仅两套固定主题 —— 浅色苹果玻璃 / 深色金属。
 * 界面字号与代码字体立刻写 DOM（`--ui-font-scale` / `--mono`）。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import {
  parseComposerEnterBehavior,
  type ComposerEnterBehavior
} from '../../../shared/composer-submit'
import { parseTurnNotifyMode, type TurnNotifyMode } from '../../../shared/turn-notify'
import type { AgentPersonality } from '../../../shared/personality'
import { PERSONALITY_OPTIONS, parsePersonality } from '../../../shared/personality'
import {
  clampUiFontScale,
  formatUiFontScale,
  stepUiFontScale,
  UI_FONT_SCALE_DEFAULT,
  UI_FONT_SCALE_MAX,
  UI_FONT_SCALE_MIN
} from '../../../shared/ui-font-scale'
import { CODE_FONT_OPTIONS, codeFontStack, parseCodeFont, type CodeFontId } from '../../../shared/code-font'
import {
  SettingsCard,
  SettingsChoiceGroup,
  SettingsRow,
  SettingsSection,
  SettingsToggle
} from './SettingsPrimitives'
import { SettingsSelect } from './SettingsSelect'
import './AppearanceSettings.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 立刻写 DOM：主题切换即生效（材质由 CSS 固定）；字号写入 `--ui-font-scale`；代码字体写入 `--mono` */
export function applyAppearanceDom(
  theme: 'light' | 'dark',
  fontScale = UI_FONT_SCALE_DEFAULT,
  codeFont?: string
): void {
  const root = document.documentElement
  root.dataset.theme = theme
  root.classList.toggle('theme-dark', theme === 'dark')
  root.classList.toggle('theme-light', theme === 'light')
  // 固定材质：浅色始终玻璃，深色始终金属；不再暴露透明度滑杆
  root.classList.toggle('ui-glass', theme === 'light')
  root.classList.toggle('ui-solid', theme === 'dark')
  root.classList.remove('ui-full-glass')
  root.style.setProperty('--ui-glass', theme === 'light' ? '0.82' : '0')
  root.style.setProperty('--ui-opacity', theme === 'light' ? '0.11' : '1')
  root.style.setProperty('--ui-opacity-strong', theme === 'light' ? '0.18' : '1')
  root.style.setProperty('--ui-opacity-soft', theme === 'light' ? '0.08' : '1')
  root.style.setProperty('--ui-font-scale', String(clampUiFontScale(fontScale)))
  root.style.setProperty('--mono', codeFontStack(codeFont))
}

/** 外观设置 */
export function AppearanceSettings({ draft, setDraft, onSave }: Props) {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    draft.uiTheme === 'dark' ? 'dark' : 'light'
  )
  const [instructions, setInstructions] = useState('')
  const [instructionsPath, setInstructionsPath] = useState('')
  const [overrideActive, setOverrideActive] = useState(false)
  const themeRef = useRef(theme)
  const draftRef = useRef(draft)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const instructionsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (instructionsTimer.current) clearTimeout(instructionsTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!window.sharker.getPersonalAgentsMd) return
    void window.sharker.getPersonalAgentsMd().then((doc) => {
      setInstructions(doc.content)
      setInstructionsPath(doc.path)
      setOverrideActive(doc.overrideActive)
    })
  }, [])

  // 外部 draft 同步
  useEffect(() => {
    const t = draft.uiTheme === 'dark' ? 'dark' : 'light'
    setTheme(t)
    applyAppearanceDom(t, draft.uiFontScale, draft.codeFont)
  }, [draft.uiTheme, draft.uiFontScale, draft.codeFont])

  const scheduleSave = useCallback(
    (next: AppSettings) => {
      setDraft(next)
      draftRef.current = next
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        void onSave(next)
      }, 180)
    },
    [onSave, setDraft]
  )

  const onTheme = (uiTheme: 'light' | 'dark') => {
    setTheme(uiTheme)
    themeRef.current = uiTheme
    applyAppearanceDom(uiTheme, draftRef.current.uiFontScale, draftRef.current.codeFont)
    // 保留 uiGlass 字段兼容旧设置文件，但 UI 不再调节
    scheduleSave({
      ...draftRef.current,
      uiTheme,
      uiGlass: uiTheme === 'light' ? 0.82 : 0
    })
  }

  const onFontScale = (next: number) => {
    const uiFontScale = clampUiFontScale(next)
    applyAppearanceDom(themeRef.current, uiFontScale, draftRef.current.codeFont)
    scheduleSave({ ...draftRef.current, uiFontScale })
  }

  const onCodeFont = (codeFont: CodeFontId) => {
    applyAppearanceDom(themeRef.current, draftRef.current.uiFontScale, codeFont)
    scheduleSave({ ...draftRef.current, codeFont })
  }

  return (
    <>
    <SettingsSection title="主题">
      <SettingsCard>
        <div className="appearance-theme-grid" role="radiogroup" aria-label="主题">
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'light'}
            className={`appearance-theme-card ${theme === 'light' ? 'is-selected' : ''}`}
            onClick={() => onTheme('light')}
          >
            <span className="appearance-theme-swatch appearance-theme-swatch--light" />
            <span className="appearance-theme-meta">
              <strong>浅色</strong>
              <span>苹果玻璃透明感</span>
            </span>
            <span className="appearance-theme-check" aria-hidden />
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={theme === 'dark'}
            className={`appearance-theme-card ${theme === 'dark' ? 'is-selected' : ''}`}
            onClick={() => onTheme('dark')}
          >
            <span className="appearance-theme-swatch appearance-theme-swatch--dark" />
            <span className="appearance-theme-meta">
              <strong>深色</strong>
              <span>深金属质感</span>
            </span>
            <span className="appearance-theme-check" aria-hidden />
          </button>
        </div>
      </SettingsCard>
    </SettingsSection>
      <SettingsSection title="字号">
        <SettingsCard>
          <SettingsRow
            title="界面字号"
            description="对标 Codex ⌘+ / ⌘-；⌘0 重置。写入外观设置，重启后仍有效。"
          >
            <div className="appearance-font-stepper">
              <button
                type="button"
                className="appearance-font-btn"
                aria-label="缩小字号"
                disabled={clampUiFontScale(draft.uiFontScale) <= UI_FONT_SCALE_MIN}
                onClick={() => onFontScale(stepUiFontScale(draft.uiFontScale ?? UI_FONT_SCALE_DEFAULT, -1))}
              >
                −
              </button>
              <span className="appearance-font-value">{formatUiFontScale(draft.uiFontScale ?? UI_FONT_SCALE_DEFAULT)}</span>
              <button
                type="button"
                className="appearance-font-btn"
                aria-label="放大字号"
                disabled={clampUiFontScale(draft.uiFontScale) >= UI_FONT_SCALE_MAX}
                onClick={() => onFontScale(stepUiFontScale(draft.uiFontScale ?? UI_FONT_SCALE_DEFAULT, 1))}
              >
                +
              </button>
            </div>
          </SettingsRow>
          <SettingsRow
            title="代码字体"
            description="对标 Codex Code font。审查、终端与对话代码共用这一栈。"
            last
          >
            <SettingsSelect
              id="appearance-code-font"
              value={parseCodeFont(draft.codeFont)}
              options={CODE_FONT_OPTIONS.map((item) => ({ value: item.id, label: item.label }))}
              onChange={(value) => onCodeFont(parseCodeFont(value))}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="输入">
        <SettingsCard>
          <SettingsChoiceGroup
            value={draft.followUpBehavior === 'steer' ? 'steer' : 'queue'}
            onChange={(followUpBehavior: 'queue' | 'steer') => {
              scheduleSave({ ...draftRef.current, followUpBehavior })
            }}
            options={[
              {
                value: 'queue',
                title: '排队',
                description: '忙时 Enter 等到当前回合结束。⌘⇧Enter 改为注入。',
                icon: <span aria-hidden>排</span>
              },
              {
                value: 'steer',
                title: '注入',
                description: '忙时 Enter 插入当前回合。⌘⇧Enter 改为排队。',
                icon: <span aria-hidden>注</span>
              }
            ]}
          />
          <SettingsChoiceGroup
            value={parseComposerEnterBehavior(draft.composerEnterBehavior, draft.requireModEnter)}
            onChange={(composerEnterBehavior: ComposerEnterBehavior) => {
              scheduleSave({
                ...draftRef.current,
                composerEnterBehavior,
                requireModEnter: composerEnterBehavior === 'cmdAlways'
              })
            }}
            options={[
              {
                value: 'enter',
                title: '回车发送',
                description: 'Enter 始终发送。Shift+Enter 换行。',
                icon: <span aria-hidden>回</span>
              },
              {
                value: 'cmdIfMultiline',
                title: '多行需 ⌘Enter',
                description: '单行 Enter 发送；草稿有换行后要 ⌘/Ctrl+Enter。',
                icon: <span aria-hidden>多</span>
              },
              {
                value: 'cmdAlways',
                title: '始终 ⌘Enter',
                description: 'Enter 换行，⌘/Ctrl+Enter 发送。',
                icon: <span aria-hidden>⌘</span>
              }
            ]}
          />
          <SettingsRow
            title="建议提示"
            description="对标 Codex Suggested prompts：空对话显示审查、目标或继续最近对话。"
            last
          >
            <SettingsToggle
              checked={draft.suggestedPrompts !== false}
              onChange={(suggestedPrompts) => {
                scheduleSave({ ...draftRef.current, suggestedPrompts })
              }}
              label="建议提示"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="通知">
        <SettingsCard>
          <SettingsChoiceGroup
            value={parseTurnNotifyMode(draft.turnNotifyMode)}
            onChange={(turnNotifyMode: TurnNotifyMode) => {
              scheduleSave({ ...draftRef.current, turnNotifyMode })
            }}
            options={[
              {
                value: 'never',
                title: '从不',
                description: '回合完成不弹系统通知。',
                icon: <span aria-hidden>静</span>
              },
              {
                value: 'background',
                title: '后台',
                description: '正在看且窗口在前台时不打扰。',
                icon: <span aria-hidden>后</span>
              },
              {
                value: 'always',
                title: '始终',
                description: '每次回合完成都通知。',
                icon: <span aria-hidden>通</span>
              }
            ]}
          />
          <SettingsRow
            title="批准通知"
            description="对标 Codex permission notifications：后台或失焦时高危操作需要批准会弹系统通知。"
          >
            <SettingsToggle
              checked={draft.approvalNotify !== false}
              onChange={(approvalNotify) => {
                scheduleSave({ ...draftRef.current, approvalNotify })
              }}
              label="批准通知"
            />
          </SettingsRow>
          <SettingsRow
            title="系统通知权限"
            description="对标 Codex：向 macOS 申请通知权限。会发一条测试通知。"
            last
          >
            <button
              type="button"
              className="appearance-font-btn appearance-permission-btn"
              onClick={() => {
                void window.sharker.requestNotifyPermission?.()
              }}
            >
              请求权限
            </button>
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="窗口">
        <SettingsCard>
          <SettingsRow
            title="运行时防止休眠"
            description="对标 Codex Prevent sleep while running：有回合在跑时阻止系统休眠。"
          >
            <SettingsToggle
              checked={draft.preventSleepWhileRunning === true}
              onChange={(preventSleepWhileRunning) => {
                scheduleSave({ ...draftRef.current, preventSleepWhileRunning })
              }}
              label="运行时防止休眠"
            />
          </SettingsRow>
          <SettingsRow
            title="新弹出对话置顶"
            description="对标 Codex Always on top：新弹出的对话窗默认浮在其它应用之上。"
            last
          >
            <SettingsToggle
              checked={draft.popoutAlwaysOnTop === true}
              onChange={(popoutAlwaysOnTop) => {
                scheduleSave({ ...draftRef.current, popoutAlwaysOnTop })
              }}
              label="新弹出对话置顶"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="记忆">
        <SettingsCard>
          <SettingsRow
            title="注入记忆"
            description="对标 Codex Settings → Personalization：把检索到的长期记忆写入本轮 system。"
          >
            <SettingsToggle
              checked={draft.memoryInjection !== false}
              onChange={(memoryInjection) => {
                scheduleSave({ ...draftRef.current, memoryInjection })
              }}
              label="注入记忆"
            />
          </SettingsRow>
          <SettingsRow
            title="写入记忆"
            description="回合结束后提炼偏好与事实。关闭后仍记录会话事件。"
            last
          >
            <SettingsToggle
              checked={draft.memoryGeneration !== false}
              onChange={(memoryGeneration) => {
                scheduleSave({ ...draftRef.current, memoryGeneration })
              }}
              label="写入记忆"
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="人格">
        <SettingsCard>
          <SettingsChoiceGroup
            value={parsePersonality(draft.personality)}
            onChange={(personality: AgentPersonality) => {
              const next = { ...draftRef.current, personality }
              scheduleSave(next)
            }}
            options={PERSONALITY_OPTIONS.map((o) => ({
              value: o.id,
              title: o.title,
              description: o.description,
              icon: <span aria-hidden>{o.title.slice(0, 1)}</span>
            }))}
          />
        </SettingsCard>
      </SettingsSection>
      <SettingsSection title="自定义说明">
        <SettingsCard>
          <SettingsRow
            title="个人 AGENTS.md"
            description={
              overrideActive
                ? `写入 ${instructionsPath || '~/.sharker/AGENTS.md'}。当前有 AGENTS.override.md，注入会优先用 override。`
                : `对标 Codex Settings → Personalization：写入 ${instructionsPath || '~/.sharker/AGENTS.md'}，所有项目都会注入。`
            }
            last
          >
            <span className="appearance-instructions-hint">~/.sharker</span>
          </SettingsRow>
          <textarea
            className="appearance-instructions"
            value={instructions}
            spellCheck={false}
            placeholder="跨项目都要遵守的约定，例如：改 JS 后跑 npm test；优先 pnpm。"
            aria-label="个人自定义说明"
            onChange={(e) => {
              const content = e.target.value
              setInstructions(content)
              if (!window.sharker.savePersonalAgentsMd) return
              if (instructionsTimer.current) clearTimeout(instructionsTimer.current)
              instructionsTimer.current = setTimeout(() => {
                void window.sharker.savePersonalAgentsMd(content)
              }, 320)
            }}
          />
        </SettingsCard>
      </SettingsSection>
    </>
  )
}
