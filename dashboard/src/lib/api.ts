const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const WS = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'

export function getTenantId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('tenantId')
}

export function setTenantId(id: string) {
  localStorage.setItem('tenantId', id)
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const tenantId = getTenantId()
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
  return res.json()
}

export function connectWebSocket(onEvent: (event: string, data: any) => void) {
  if (typeof window === 'undefined') return () => undefined
  const ws = new WebSocket(`${WS}/ws`)
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      onEvent(msg.event, msg.data)
    } catch {}
  }
  return () => ws.close()
}

export const API_URL = API
