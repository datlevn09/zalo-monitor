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
  // Auto inject boardUserId vào query string (nếu user đã chọn board cụ thể)
  // Backend dùng để filter groups/messages/analytics theo board owner.
  const boardUserId = typeof window !== 'undefined' ? localStorage.getItem('zm:boardUserId') : null
  let finalPath = path
  if (boardUserId === '__all__' && !path.includes('scope=')) {
    // 'Tất cả board của tôi (gộp)' — own + tất cả board được share cho user
    finalPath = path + (path.includes('?') ? '&' : '?') + 'scope=all_shared'
  } else if (boardUserId === '__tenant__' && !path.includes('scope=')) {
    // Manager 'Toàn tổ chức' — gộp toàn tenant (admin view)
    finalPath = path + (path.includes('?') ? '&' : '?') + 'scope=all'
  } else if (boardUserId && !boardUserId.startsWith('__') && !path.includes('boardUserId=')) {
    finalPath = path + (path.includes('?') ? '&' : '?') + `boardUserId=${encodeURIComponent(boardUserId)}`
  }
  // Fastify reject 400 khi Content-Type=application/json mà body rỗng.
  // Auto-fill body='{}' cho POST/PUT/PATCH nếu chưa có.
  const method = (init?.method ?? 'GET').toUpperCase()
  const finalInit: RequestInit = { ...init }
  if (['POST', 'PUT', 'PATCH'].includes(method) && !finalInit.body) {
    finalInit.body = '{}'
  }
  const res = await fetch(`${API}${finalPath}`, {
    ...finalInit,
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
  if (res.status === 403) {
    const body = await res.json().catch(() => ({}))
    if (body?.code === 'BOARD_ACCESS_REVOKED') {
      // Quyền xem board bị thu hồi → revert về board của mình
      if (typeof window !== 'undefined') {
        localStorage.removeItem('zm:boardUserId')
        alert('Quyền xem board này đã bị thu hồi. Quay lại board của bạn.')
        window.location.reload()
      }
      throw new Error('BOARD_ACCESS_REVOKED')
    }
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
