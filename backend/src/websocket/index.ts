import type { Server as HttpServer } from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import { logger } from '../config/logger.js'

let wss: WebSocketServer | undefined

export function initWebSocketServer(httpServer: HttpServer): WebSocketServer {
  wss = new WebSocketServer({ server: httpServer, path: '/ws' })

  wss.on('connection', (socket) => {
    logger.info('WebSocket client connected')
    socket.on('close', () => logger.info('WebSocket client disconnected'))
  })

  return wss
}

// Broadcasts an event to every connected client. Consumed by future phases
// (device status changes, recording events, live execution updates).
export function broadcast(event: string, payload: unknown): void {
  if (!wss) return
  const message = JSON.stringify({ event, payload })
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(message)
  }
}
