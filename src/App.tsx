import { useEffect, useRef, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import { DEFAULT_APP_PATH } from './constants/routes'
import { AppTabsPage } from './pages/AppTabsPage'
import { LoginPage } from './pages/LoginPage'
import { DevTestPage } from './pages/DevTestPage'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { TermsOfUsePage } from './pages/TermsOfUsePage'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import { useAuth } from './hooks/useAuth'
import { supabase } from './lib/supabase'

/**
 * 延迟初始化分析工具，不阻塞首屏渲染
 * 使用 requestIdleCallback 在浏览器空闲时执行，串行初始化避免同时抢占资源
 */
function initAnalyticsDeferred() {
  const IDLE_TIMEOUT = 4000 // 最多等 4 秒，确保最终会初始化

  const scheduleIdle = (callback: () => void) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(callback, { timeout: IDLE_TIMEOUT })
    } else {
      // iOS Safari 不支持 requestIdleCallback
      setTimeout(callback, 100)
    }
  }

  // 串行初始化：每个工具在前一个完成后、浏览器空闲时才启动
  scheduleIdle(async () => {
    // 1. Amplitude（最重要的分析工具，先初始化）
    const { initAmplitude } = await import('./lib/amplitude')
    await initAmplitude()

    scheduleIdle(async () => {
      // 2. Mixpanel
      const { initMixpanel } = await import('./lib/mixpanel')
      initMixpanel()

      scheduleIdle(async () => {
        // 3. PostHog（最后初始化）
        const { initPostHog } = await import('./lib/posthog')
        initPostHog()
      })
    })
  })
}

/**
 * 根路径重定向组件：根据当前登录态与访客体验资格，决定跳转到 App、Onboarding 或登录页。
 * 同时处理 OAuth 回调（如 Apple 登录）。
 *
 * @returns {null} 不渲染任何 UI，仅负责路由跳转。
 */
function RootRedirect() {
  const navigate = useNavigate()
  const { isLoggedIn, checkLoginState } = useAuth()
  const hasHandledRef = useRef(false)
  const [isProcessingOAuth, setIsProcessingOAuth] = useState(false)

  useEffect(() => {
    if (hasHandledRef.current) return
    hasHandledRef.current = true

    const handleRedirect = async () => {
      // 检查 URL 中是否有 OAuth 回调参数
      const urlParams = new URLSearchParams(window.location.search)
      const hashParams = new URLSearchParams(window.location.hash.substring(1))
      const code = urlParams.get('code')
      const accessToken = hashParams.get('access_token')
      const error = urlParams.get('error') || hashParams.get('error')

      // 如果有 OAuth 错误，记录并继续
      if (error) {
        console.error('❌ OAuth 回调错误:', error, urlParams.get('error_description'))
      }

      // 如果有 OAuth 回调参数（code 或 access_token），等待 Supabase 处理
      if ((code || accessToken) && supabase) {
        setIsProcessingOAuth(true)
        console.log('🔐 检测到 OAuth 回调参数，等待 Supabase 处理...')

        try {
          // 对于 PKCE flow，需要用 code 交换 session
          if (code) {
            console.log('🔐 PKCE flow: 使用 code 交换 session...')
            const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
            if (exchangeError) {
              console.error('❌ exchangeCodeForSession 失败:', exchangeError)
            } else if (data.session) {
              console.log('✅ OAuth 登录成功:', data.session.user.email)
              // 更新本地存储
              localStorage.setItem('session_token', data.session.access_token)
              if (data.session.refresh_token) {
                localStorage.setItem('refresh_token', data.session.refresh_token)
              }
              localStorage.setItem('user_id', data.session.user.id)
              localStorage.setItem('user_email', data.session.user.email || '')
              checkLoginState()
            }
          }

          // 清理 URL 中的 OAuth 参数
          window.history.replaceState({}, '', window.location.pathname)
        } catch (err) {
          console.error('❌ OAuth 回调处理失败:', err)
        } finally {
          setIsProcessingOAuth(false)
        }
      }

      const targetAppPath = DEFAULT_APP_PATH
      // 无论登录与否，都直接进入核心功能页（urgency）
      navigate(targetAppPath, { replace: true })
    }

    void handleRedirect()
  }, [isLoggedIn, navigate, checkLoginState])

  // 如果正在处理 OAuth，显示加载状态
  if (isProcessingOAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return null
}

/**
 * 应用入口组件：包裹全局 AuthProvider，并注册所有路由。
 *
 * @returns {JSX.Element} FireGo 前端的根组件。
 */
function App() {
  useEffect(() => {
    // 延迟初始化分析工具，不阻塞首屏渲染
    initAnalyticsDeferred()
  }, [])

  return (
    <LanguageProvider>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />
          {/* 开发测试页面 - 仅在 DEV 模式下可用 */}
          {import.meta.env.DEV && <Route path="/dev" element={<DevTestPage />} />}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/mobile" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfUsePage />} />
          <Route path="/app" element={<Navigate to={DEFAULT_APP_PATH} replace />} />
          <Route path="/app/:tab" element={<AppTabsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
