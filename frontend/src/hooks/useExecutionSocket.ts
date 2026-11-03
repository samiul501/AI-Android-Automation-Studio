import { useEffect, useRef } from 'react'
import type { ExecutionItem, ExecutionSession } from '../types/execution'

interface ExecutionSocketHandlers {
  onStarted?: (session: ExecutionSession) => void
  onItemUpdate?: (sessionId: string, index: number, item: ExecutionItem) => void
  onFinished?: (session: ExecutionSession) => void
}

// Connects once on mount to the backend's shared WebSocket channel and
// dispatches execution:* events. Uses a ref for the handlers so callers can
// pass fresh closures each render without tearing down the socket.
export function useExecutionSocket(handlers: ExecutionSocketHandlers): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`)

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data as string) as { event: string; payload: unknown }
        if (message.event === 'execution:started') {
          handlersRef.current.onStarted?.(message.payload as ExecutionSession)
        } else if (message.event === 'execution:item-update') {
          const { sessionId, index, item } = message.payload as {
            sessionId: string
            index: number
            item: ExecutionItem
          }
          handlersRef.current.onItemUpdate?.(sessionId, index, item)
        } else if (message.event === 'execution:finished') {
          handlersRef.current.onFinished?.(message.payload as ExecutionSession)
        }
      } catch {
        // Ignore malformed/unrelated messages.
      }
    })

    return () => socket.close()
  }, [])
}
