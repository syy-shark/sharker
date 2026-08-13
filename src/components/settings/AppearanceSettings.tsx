/**
 * 外观：仅两套固定主题 —— 浅色苹果玻璃 / 深色金属。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { AppSettings } from '../../../shared/types'
import { SettingsCard, SettingsSection } from './SettingsPrimitives'
import './AppearanceSettings.css'

interface Props {
  draft: AppSettings
  setDraft: React.Dispatch<React.SetStateAction<AppSettings>>
  onSave: (next: AppSettings) => Promise<void>
}

/** 立刻写 DOM：主题切换即生效（材质由 CSS 固定） */
export function applyAppearanceDom(theme: 'light' | 'dark'): void {
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
    applyAppearanceDom(t)
  }, [draft.uiTheme])

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
    applyAppearanceDom(uiTheme)
    // 保留 uiGlass 字段兼容旧设置文件，但 UI 不再调节
    scheduleSave({
      ...draftRef.current,
      uiTheme,
      uiGlass: uiTheme === 'light' ? 0.82 : 0
    })
  }

  return (
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
  )
}
