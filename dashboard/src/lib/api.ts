const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
const WS = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:3001'

const TOKEN_KEY = 'zm:token'
const TENANT_KEY = 'tenantId'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(TENANT_KEY)
}

export function getTenantId(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(TENANT_KEY)
}

export function setTenantId(id: string) {
  localStorage.setItem(TENANT_KEY, id)
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const tenantId = getTenantId()
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) {
    // Token hết hạn hoặc không hợp lệ → đẩy về login
    clearAuth()
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login'
    }
    throw new Error('Unauthorized')
  }
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
