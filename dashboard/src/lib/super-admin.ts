const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'

const TOKEN_KEY = 'zm:super-admin-token'

export function getSuperAdminToken(): string | null {
  if (typeof window === 'undefined') return null
  return sessionStorage.getItem(TOKEN_KEY)
}

export function setSuperAdminToken(token: string) {
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearSuperAdminToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

export async function saApi<T = any>(path: string, init?: RequestInit): Promise<T> {
  const token = getSuperAdminToken()
  if (!token) throw new Error('NO_TOKEN')
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'x-super-admin-token': token,
      ...(init?.headers ?? {}),
    },
  })
  if (res.status === 401) {
    clearSuperAdminToken()
    throw new Error('UNAUTHORIZED')
  }
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`)
  return res.json()
}
