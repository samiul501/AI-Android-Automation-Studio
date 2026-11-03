import type { LocatorSuggestion } from '../locator/types.js'

export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

// Deliberately permissive: we consume raw JSON straight from `mobilecli dump ui`,
// whose exact field names aren't contractually guaranteed to us (see uiTree.ts).
export type RawUiNode = Record<string, unknown>

export interface ElementInfo {
  resourceId?: string
  text?: string
  contentDescription?: string
  className?: string
  bounds?: Bounds
  clickable?: boolean
  isFocused?: boolean
  raw?: RawUiNode
}

export type RecordedActionType =
  | 'app_launch'
  | 'tap'
  | 'long_press'
  | 'double_tap'
  | 'text_input'
  | 'clear_input'
  | 'swipe'
  | 'scroll'
  | 'back'
  | 'unknown_gesture'

export interface ScreenState {
  timestamp: string
  foregroundApp?: string
  elementCount?: number
  /** Deduplicated visible text on screen at this moment - used for smart assertion generation. */
  visibleTexts?: string[]
}

export interface RecordedAction {
  id: string
  timestamp: string
  type: RecordedActionType
  x?: number
  y?: number
  endX?: number
  endY?: number
  direction?: 'up' | 'down' | 'left' | 'right'
  durationMs?: number
  text?: string
  element?: ElementInfo
  locator?: LocatorSuggestion
  screenBefore?: ScreenState
  screenAfter?: ScreenState
}

export interface RecordingSession {
  id: string
  deviceSerial: string
  startedAt: string
  stoppedAt?: string
  status: 'recording' | 'stopped'
  actions: RecordedAction[]
}
