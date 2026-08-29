/**
 * 外观：仅两套固定主题 —— 浅色苹果玻璃 / 深色金属。
 * 界面字号、代码字号与代码字体立刻写 DOM（`--ui-font-scale` / `--code-font-scale` / `--mono`）。
 * 人格与个人说明在 `PersonalizationSettings`。
 * @see src/components/settings/ARCH.md
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { parseTurnNotifyMode, type TurnNotifyMode } from '../../../shared/turn-notify'
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

/** 立刻写 DOM：主题切换即生效（材质由 CSS 固定）；字号写入 `--ui-font-scale`；代码字号写入 `--code-font-scale`；代码字体写入 `--mono` */
export function applyAppearanceDom(
  theme: 'light' | 'dark',
  fontScale = UI_FONT_SCALE_DEFAULT,
  codeFont?: string,
  codeFontScale = UI_FONT_SCALE_DEFAULT
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
  root.style.setProperty('--code-font-scale', String(clampUiFontScale(codeFontScale)))
  root.style.setProperty('--mono', codeFontStack(codeFont))
}

function paintDraftAppearance(
  draft: Pick<AppSettings, 'uiTheme' | 'uiFontScale' | 'codeFont' | 'codeFontScale'>,
  theme?: 'light' | 'dark'
): void {
  applyAppearanceDom(
    theme ?? (draft.uiTheme === 'dark' ? 'dark' : 'light'),
    draft.uiFontScale,
    draft.codeFont,
    draft.codeFontScale
  )
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
    paintDraftAppearance(draft, t)
  }, [draft.uiTheme, draft.uiFontScale, draft.codeFont, draft.codeFontScale])

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
    paintDraftAppearance({ ...draftRef.current, uiTheme }, uiTheme)
    // 保留 uiGlass 字段兼容旧设置文件，但 UI 不再调节
    scheduleSave({
      ...draftRef.current,
      uiTheme,
      uiGlass: uiTheme === 'light' ? 0.82 : 0
    })
  }

  const onFontScale = (next: number) => {
    const uiFontScale = clampUiFontScale(next)
    paintDraftAppearance({ ...draftRef.current, uiFontScale }, themeRef.current)
    scheduleSave({ ...draftRef.current, uiFontScale })
  }

  const onCodeFontScale = (next: number) => {
    const codeFontScale = clampUiFontScale(next)
    paintDraftAppearance({ ...draftRef.current, codeFontScale }, themeRef.current)
    scheduleSave({ ...draftRef.current, codeFontScale })
  }

  const onCodeFont = (codeFont: CodeFontId) => {
    paintDraftAppearance({ ...draftRef.current, codeFont }, themeRef.current)
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
            title="代码字号"
            description="对标 Codex Code font size。审查、终端与对话代码共用，不跟 ⌘+ / ⌘- 界面字号走。"
          >
            <div className="appearance-font-stepper">
              <button
                type="button"
                className="appearance-font-btn"
                aria-label="缩小代码字号"
                disabled={clampUiFontScale(draft.codeFontScale) <= UI_FONT_SCALE_MIN}
                onClick={() =>
                  onCodeFontScale(stepUiFontScale(draft.codeFontScale ?? UI_FONT_SCALE_DEFAULT, -1))
                }
              >
                −
              </button>
              <span className="appearance-font-value">
                {formatUiFontScale(draft.codeFontScale ?? UI_FONT_SCALE_DEFAULT)}
              </span>
              <button
                type="button"
                className="appearance-font-btn"
                aria-label="放大代码字号"
                disabled={clampUiFontScale(draft.codeFontScale) >= UI_FONT_SCALE_MAX}
                onClick={() =>
                  onCodeFontScale(stepUiFontScale(draft.codeFontScale ?? UI_FONT_SCALE_DEFAULT, 1))
                }
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
    </>
  )
}
