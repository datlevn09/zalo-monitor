// @ts-ignore
import type { WebSocket } from 'ws'

class WebSocketManager {
  private clients = new Set<WebSocket>()

  add(socket: WebSocket) {
    this.clients.add(socket)
  }

  remove(socket: WebSocket) {
    this.clients.delete(socket)
  }

  broadcast(event: string, data: unknown) {
    const payload = JSON.stringify({ event, data, ts: Date.now() })
    for (const client of this.clients) {
      if (client.readyState === 1) client.send(payload)
    }
  }
}

export const wsManager = new WebSocketManager()
