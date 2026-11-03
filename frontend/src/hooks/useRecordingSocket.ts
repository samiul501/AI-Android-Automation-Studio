import { useEffect, useRef } from 'react'
import type { RecordedAction, RecordingSession } from '../types/recording'

interface RecordingSocketHandlers {
  onStarted?: (session: RecordingSession) => void
  onAction?: (sessionId: string, action: RecordedAction) => void
  onStopped?: (session: RecordingSession) => void
}

// Connects once on mount to the backend's shared WebSocket channel and
// dispatches recording:* events. Uses a ref for the handlers so callers can
// pass fresh closures each render without tearing down the socket.
export function useRecordingSocket(handlers: RecordingSocketHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`)

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as { event: string; payload: unknown }
        if (message.event === 'recording:started') {
          handlersRef.current.onStarted?.(message.payload as RecordingSession)
        } else if (message.event === 'recording:action') {
          const { sessionId, action } = message.payload as { sessionId: string; action: RecordedAction }
          handlersRef.current.onAction?.(sessionId, action)
        } else if (message.event === 'recording:stopped') {
          handlersRef.current.onStopped?.(message.payload as RecordingSession)
        }
      } catch {
        // Ignore malformed/unrelated messages.
      }
    })

    return () => socket.close()
  }, [])
}
