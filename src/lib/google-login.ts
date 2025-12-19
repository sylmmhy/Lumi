import { setUserId, setUserProperties } from './amplitude'
import { supabase } from './supabase'

export interface GoogleLoginResponse {
  session_token: string
  user_email: string
  user_name: string
  user_id: string
  is_new: boolean
  refresh_token?: string
  expires_in?: number
  expires_at?: number
}

/**
 * Generate a random CSRF token string for Google login requests.
 *
 * @returns CSRF token composed of four random 32-bit integers
 */
export function generateCSRFToken(): string {
  const arr = new Uint32Array(4)
  crypto.getRandomValues(arr)
  return Array.from(arr).join('')
}

/**
 * Exchange a Google ID token for a Supabase session via the Edge Function and persist it locally.
 *
 * @param idToken - JWT returned by Google Identity Services
 * @param csrfToken - CSRF token mirrored in cookie and headers
 * @returns Session payload with user info
 * @throws If Supabase config is missing or backend responds with non-2xx
 */
export async function googleLogin(idToken: string, csrfToken: string): Promise<GoogleLoginResponse> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  if (!supabaseUrl || !anonKey) throw new Error('Supabase config missing')

  document.cookie = `g_csrf_token=${csrfToken}; path=/; samesite=strict`

  const res = await fetch(`${supabaseUrl}/functions/v1/google-login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`,
      'X-CSRF-Token': csrfToken,
    },
    body: JSON.stringify({ id_token: idToken, g_csrf_token: csrfToken }),
  })

  if (!res.ok) {
    let message = 'Login failed'
    try {
      const body = await res.json()
      message = body?.error || message
    } catch (err) {
      console.error('Failed to parse login error response', err)
    }
    throw new Error(message)
  }

  const data: GoogleLoginResponse = await res.json()

  localStorage.setItem('session_token', data.session_token)
  localStorage.setItem('user_id', data.user_id)
  localStorage.setItem('user_email', data.user_email)
  localStorage.setItem('user_name', data.user_name)
  localStorage.setItem('is_new_user', String(data.is_new))
  if (data.refresh_token) {
    localStorage.setItem('refresh_token', data.refresh_token)
  }

  /**
   * 尝试把会话注入 Supabase Auth。
   * 1) 优先使用 Edge Function 返回的 refresh_token 设置会话
   * 2) 如果缺少 refresh_token，则使用 idToken 走官方 signInWithIdToken 作为兜底，拿到带刷新能力的会话
   */
  let sessionEstablished = false
  if (supabase && data.refresh_token) {
    try {
      const { data: sessionData, error } = await supabase.auth.setSession({
        access_token: data.session_token,
        refresh_token: data.refresh_token,
      })

      if (error) {
        console.warn('⚠️ 无法为 Supabase 设置 Google 登录会话', error)
      } else if (sessionData.session) {
        sessionEstablished = true
        localStorage.setItem('session_token', sessionData.session.access_token)
        if (sessionData.session.refresh_token) {
          localStorage.setItem('refresh_token', sessionData.session.refresh_token)
        }
      }
    } catch (e) {
      console.warn('⚠️ 设置 Supabase 会话时出错', e)
    }
  }

  if (supabase && !sessionEstablished) {
    try {
      const { data: idTokenSession, error: idTokenError } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      })

      if (idTokenError) {
        console.warn('⚠️ 使用 idToken 登录 Supabase 失败（兜底流程）', idTokenError)
      } else if (idTokenSession.session) {
        sessionEstablished = true
        const { session, user } = idTokenSession
        localStorage.setItem('session_token', session.access_token)
        if (session.refresh_token) {
          localStorage.setItem('refresh_token', session.refresh_token)
        }
        localStorage.setItem('user_id', session.user.id)
        localStorage.setItem('user_email', user?.email || data.user_email)
        if (user?.user_metadata?.full_name) {
          localStorage.setItem('user_name', user.user_metadata.full_name)
        }
        // 回填给返回值，方便调用方获取最新 refresh_token
        data.session_token = session.access_token
        data.refresh_token = session.refresh_token ?? data.refresh_token
      }
    } catch (e) {
      console.warn('⚠️ 使用 idToken 兜底登录 Supabase 时异常', e)
    }
  }

  await setUserId(data.user_id)
  await setUserProperties({
    email: data.user_email,
    name: data.user_name,
    is_new_user: data.is_new,
    signup_date: data.is_new ? new Date().toISOString() : undefined,
  })

  return data
}
