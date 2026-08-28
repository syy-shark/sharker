/**
 * 外观：仅两套固定主题 —— 浅色苹果玻璃 / 深色金属。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
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
import {
  SettingsCard,
  SettingsChoiceGroup,
  SettingsRow,
  SettingsSection,
  SettingsToggle
} from './SettingsPrimitives'
import './AppearanceSettings.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 立刻写 DOM：主题切换即生效（材质由 CSS 固定）；字号写入 `--ui-font-scale` */
export function applyAppearanceDom(theme: 'light' | 'dark', fontScale = UI_FONT_SCALE_DEFAULT): void {
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
}

/** 外观设置 */
export function AppearanceSettings({ draft, setDraft, onSave }: Props) {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    draft.uiTheme === 'dark' ? 'dark' : 'light'
  )
  const themeRef = useRef(theme)
  const draftRef = useRef(draft)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  useEffect(() => {
    themeRef.current = theme
  }, [theme])

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  // 外部 draft 同步
  useEffect(() => {
    const t = draft.uiTheme === 'dark' ? 'dark' : 'light'
    setTheme(t)
    applyAppearanceDom(t, draft.uiFontScale)
  }, [draft.uiTheme, draft.uiFontScale])

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
    applyAppearanceDom(uiTheme, draftRef.current.uiFontScale)
    // 保留 uiGlass 字段兼容旧设置文件，但 UI 不再调节
    scheduleSave({
      ...draftRef.current,
      uiTheme,
      uiGlass: uiTheme === 'light' ? 0.82 : 0
    })
  }

  const onFontScale = (next: number) => {
    const uiFontScale = clampUiFontScale(next)
    applyAppearanceDom(themeRef.current, uiFontScale)
    scheduleSave({ ...draftRef.current, uiFontScale })
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
            last
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
          <SettingsRow
            title="用 ⌘Enter 发送"
            description="对标 Codex Require Cmd+Enter：Enter 换行，⌘/Ctrl+Enter 发送。"
            last
          >
            <SettingsToggle
              checked={draft.requireModEnter === true}
              onChange={(requireModEnter) => {
                scheduleSave({ ...draftRef.current, requireModEnter })
              }}
              label="用 ⌘Enter 发送"
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
    </>
  )
}
