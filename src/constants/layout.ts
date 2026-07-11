/** Shared workbench dimensions. Keep JS drag bounds aligned with CSS layout tokens. */
export const WORKBENCH_BREAKPOINT = 1120

export const SIDEBAR_LAYOUT = {
  default: 248,
  min: 220,
  max: 320,
  collapsed: 52
} as const

export const RIGHT_PANEL_LAYOUT = {
  default: 400,
  min: 340,
  max: 520
} as const
