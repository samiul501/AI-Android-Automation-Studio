import type { RecordedAction } from '../types/recording'

export function describeAction(action: RecordedAction): string {
  const target = action.element?.text || action.element?.contentDescription || action.element?.resourceId

  switch (action.type) {
    case 'tap':
      return target ? `Tap "${target}"` : `Tap (${action.x}, ${action.y})`
    case 'long_press':
      return target ? `Long press "${target}"` : `Long press (${action.x}, ${action.y})`
    case 'double_tap':
      return target ? `Double tap "${target}"` : `Double tap (${action.x}, ${action.y})`
    case 'text_input':
      return target ? `Enter text into "${target}"` : 'Enter text'
    case 'clear_input':
      return target ? `Clear "${target}"` : 'Clear field'
    case 'swipe':
      return `Swipe ${action.direction ?? ''}`.trim()
    case 'scroll':
      return `Scroll ${action.direction ?? ''}`.trim()
    case 'back':
      return 'Back'
    case 'app_launch':
      return 'Launch app'
    default:
      return 'Gesture'
  }
}
