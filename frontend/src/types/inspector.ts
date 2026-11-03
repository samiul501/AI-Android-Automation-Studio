export interface InspectorBounds {
  x: number
  y: number
  width: number
  height: number
}

export type InspectorLocatorKind = 'testId' | 'role' | 'label' | 'text'

export interface InspectorLocator {
  kind: InspectorLocatorKind
  value: string
  name?: string
}

export interface InspectorElement {
  index: number
  type: string
  label: string | null
  text: string | null
  bounds: InspectorBounds
  isVisible: boolean
  identifier: string | null
  resourceId: string | null
  placeholder: string | null
  value: string | null
  isEnabled: boolean
  isSelected: boolean | null
  isFocused: boolean | null
  isChecked: boolean | null
  locator: InspectorLocator | null
  locators: InspectorLocator[]
}

export interface InspectSnapshot {
  screenshot: string
  screen: { width: number; height: number }
  elements: InspectorElement[]
}
