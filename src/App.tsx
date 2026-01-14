import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import './App.css'
import { DEFAULT_APP_PATH } from './constants/routes'
import { AppTabsPage } from './pages/AppTabsPage'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { HabitOnboardingPage } from './pages/onboarding/HabitOnboardingPage'
import { DevTestPage } from './pages/DevTestPage'
import { LandingPageWrapper } from './pages/LandingPageWrapper'
import { PrivacyPolicyPage } from './pages/PrivacyPolicyPage'
import { TermsOfUsePage } from './pages/TermsOfUsePage'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import { useAuth } from './hooks/useAuth'
import { DevConsole } from './components/debug/DevConsole'

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
      // 2. PostHog
      const { initPostHog } = await import('./lib/posthog')
      initPostHog()
    })
  })
}

/**
 * 根路径重定向组件：等待会话验证完成后跳转到默认页面。
 *
 * 【已移除】onboarding 跳转判断
 * - 网页端完全不判断 hasCompletedHabitOnboarding
 * - 由端侧（iOS/Android）决定加载哪个 URL
 * - 纯浏览器访问时也不强制跳转，用户可自由访问任何页面
 *
 * @returns {null} 不渲染任何 UI，仅负责路由跳转。
 */
function RootRedirect() {
  const navigate = useNavigate()
  const { isOAuthProcessing, isSessionValidated } = useAuth()
  const hasHandledRef = useRef(false)

  useEffect(() => {
    // 等待 OAuth 处理完成和会话验证完成
    if (hasHandledRef.current || isOAuthProcessing || !isSessionValidated) return
    hasHandledRef.current = true

    // 直接跳转到默认页面，不判断 onboarding 状态
    navigate(DEFAULT_APP_PATH, { replace: true })
  }, [isOAuthProcessing, isSessionValidated, navigate])

  // 如果正在处理 OAuth 或会话未验证完成，显示加载状态
  if (isOAuthProcessing || !isSessionValidated) {
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
          <Route path="/landing" element={<LandingPageWrapper />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/login/mobile" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/habit-onboarding" element={<HabitOnboardingPage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfUsePage />} />
          <Route path="/app" element={<Navigate to={DEFAULT_APP_PATH} replace />} />
          <Route path="/app/:tab" element={<AppTabsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {/* WebView 调试控制台 - 仅在原生 App 或开发模式下显示 */}
        <DevConsole />
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
