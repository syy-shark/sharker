/**
 * 桌面小宠物（Codex 风格简化版）：可拖动、可关闭；portal 到 body 避免被遮挡。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import sharkLogo from '../assets/logo-shark.png'
import './PetWidget.css'

interface Props {
  enabled: boolean
}

const POS_KEY = 'sharker-pet-pos'
const PET_SIZE = 52
const SAFE_X = 10
const SAFE_TOP = 52
const SAFE_BOTTOM = 132

function clampPos(p: { x: number; y: number }): { x: number; y: number } {
  return {
    x: Math.max(SAFE_X, Math.min(window.innerWidth - PET_SIZE - SAFE_X, p.x)),
    y: Math.max(SAFE_TOP, Math.min(window.innerHeight - PET_SIZE - SAFE_BOTTOM, p.y))
  }
}

/** 默认位置：右下角，避开输入框 */
function defaultPos(): { x: number; y: number } {
  return {
    x: Math.max(SAFE_X, window.innerWidth - PET_SIZE - SAFE_X),
    y: Math.max(SAFE_TOP, window.innerHeight - PET_SIZE - SAFE_BOTTOM)
  }
}

/** 读取持久化位置 */
function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (raw) {
      const p = JSON.parse(raw) as { x: number; y: number }
      return clampPos(p)
    }
  } catch {
    /* ignore */
  }
  return defaultPos()
}

/** 右下角浮动宠物 */
export function PetWidget({ enabled }: Props) {
  const [bounce, setBounce] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [pos, setPos] = useState(loadPos)
  const posRef = useRef(pos)
  posRef.current = pos
  const dragRef = useRef<{ active: boolean; moved: boolean; ox: number; oy: number; px: number; py: number }>({
    active: false,
    moved: false,
    ox: 0,
    oy: 0,
    px: 0,
    py: 0
  })

  useEffect(() => {
    if (!enabled) return
    setDismissed(false)
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    const onResize = () => setPos((current) => clampPos(current))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [enabled])

  const onPointerMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current
    if (!d.active) return
    const dx = e.clientX - d.ox
    const dy = e.clientY - d.oy
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true
    const next = clampPos({ x: d.px + dx, y: d.py + dy })
    setPos(next)
  }, [])

  const onPointerUp = useCallback(() => {
    const d = dragRef.current
    if (!d.active) return
    d.active = false
    if (d.moved) {
      const snapped = clampPos({
        x: posRef.current.x + PET_SIZE / 2 < window.innerWidth / 2
          ? SAFE_X
          : window.innerWidth - PET_SIZE - SAFE_X,
        y: posRef.current.y
      })
      setPos(snapped)
      localStorage.setItem(POS_KEY, JSON.stringify(snapped))
    }
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }, [onPointerMove])

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.pet-widget-close')) return
    dragRef.current = {
      active: true,
      moved: false,
      ox: e.clientX,
      oy: e.clientY,
      px: pos.x,
      py: pos.y
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  if (!enabled || dismissed) return null

  return createPortal(
    <div
      className={`pet-widget ${bounce ? 'pet-widget--bounce' : ''}`}
      style={{ left: pos.x, top: pos.y }}
      onPointerDown={onPointerDown}
    >
      <button
        type="button"
        className="pet-widget-close"
        aria-label="关闭小宠物"
        title="关闭（可在设置中重新开启）"
        onClick={(e) => {
          e.stopPropagation()
          setDismissed(true)
        }}
      >
        <X size={12} aria-hidden />
      </button>
      <button
        type="button"
        className="pet-widget-body"
        aria-label="小宠物"
        onClick={() => {
          if (dragRef.current.moved) return
          setBounce(true)
          window.setTimeout(() => setBounce(false), 220)
        }}
      >
        <img className="pet-logo" src={sharkLogo} alt="" draggable={false} />
        <span className="pet-status" aria-hidden />
      </button>
    </div>,
    document.body
  )
}
