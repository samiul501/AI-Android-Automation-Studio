export interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export interface ElementInfo {
  resourceId?: string
  text?: string
  contentDescription?: string
  className?: string
  bounds?: Bounds
  clickable?: boolean
  isFocused?: boolean
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

export type LocatorStrategy =
  'testId' | 'label' | 'role' | 'text' | 'placeholder' | 'attribute' | 'xpath' | 'coordinates'

export interface LocatorCandidate {
  strategy: LocatorStrategy
  expression: string
  confidence: number
  unique: boolean
  matchCount: number
  reason: string
}

export interface LocatorSuggestion {
  best: LocatorCandidate
  alternatives: LocatorCandidate[]
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
}

export interface RecordingSession {
  id: string
  deviceSerial: string
  startedAt: string
  stoppedAt?: string
  status: 'recording' | 'stopped'
  actions: RecordedAction[]
}
