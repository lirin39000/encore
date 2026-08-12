import { useAuthStore } from '../store/auth'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) {
    // 带着 token 还被后端拒掉 = 登录已过期(session 30 天到期)。清掉本地登录态，
    // 页面会立刻从"加载中"回到"去登录"引导，并弹出登录框——否则前端一直以为自己
    // 登录着，请求一遍遍 401，页面永远卡在加载中(真实用户用满 30 天必踩)。
    // 没 token 时的 401 是正常的匿名请求，不处理
    const { token, logout, openLoginModal } = useAuthStore.getState()
    if (token) {
      logout()
      openLoginModal()
    }
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail || `请求失败: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() })
  return handle<T>(res)
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  return handle<T>(res)
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  return handle<T>(res)
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  return handle<T>(res)
}
