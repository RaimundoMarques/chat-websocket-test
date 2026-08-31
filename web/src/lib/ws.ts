import type { ServerMessage } from '../types'

const DEFAULT_DEV_WS_URL = 'ws://localhost:8765'

export function getWsUrl(): string {
  const fromEnv = import.meta.env.VITE_WS_URL
  if (fromEnv) return fromEnv
  if (import.meta.env.DEV) return DEFAULT_DEV_WS_URL
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

type Handlers = {
  onMessage: (msg: ServerMessage) => void
  onOpen?: () => void
  onClose?: (event: CloseEvent) => void
  onError?: () => void
}

export class ChatSocket {
  private ws: WebSocket | null = null
  private handlers: Handlers

  constructor(handlers: Handlers) {
    this.handlers = handlers
  }

  connect(url = getWsUrl()) {
    this.close()
    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => this.handlers.onOpen?.()
    ws.onclose = (ev) => this.handlers.onClose?.(ev)
    ws.onerror = () => this.handlers.onError?.()
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(String(event.data)) as ServerMessage
        this.handlers.onMessage(data)
      } catch {
        // ignore non-json
      }
    }
  }

  send(payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    this.ws.send(JSON.stringify(payload))
  }

  close() {
    if (this.ws) {
      this.ws.onopen = null
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN
  }
}
