import { lazy, Suspense, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import './App.css'
import { DEFAULT_APP_PATH } from './constants/routes'
import { AppTabsPage } from './pages/AppTabsPage'
import { LoginPage } from './pages/LoginPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { HabitOnboardingPage } from './pages/onboarding/HabitOnboardingPage'
import { CampfireFocusPage } from './pages/CampfireFocusPage'
import { AuthProvider } from './context/AuthContext'
import { LanguageProvider } from './context/LanguageContext'
import { PermissionProvider } from './context/PermissionContext'
import { DevConsole } from './components/debug/DevConsole'
import { initAmplitude } from './lib/amplitude'
import { initPostHog } from './lib/posthog'

/**
 * 非核心页面懒加载：只在访问对应路由时才加载模块。
 * 在 Vite dev 模式下，减少初始 HTTP 请求数量，降低本地 WiFi + HTTPS 并发请求导致的网络故障概率。
 * CampfireFocusPage 保持静态导入，因为来电流程（CallKit）可能直接加载 /campfire 路由。
 */
const LandingPageWrapper = lazy(() => import('./pages/LandingPageWrapper').then(m => ({ default: m.LandingPageWrapper })))
const PrivacyPolicyPage = lazy(() => import('./pages/PrivacyPolicyPage').then(m => ({ default: m.PrivacyPolicyPage })))
const TermsOfUsePage = lazy(() => import('./pages/TermsOfUsePage').then(m => ({ default: m.TermsOfUsePage })))
const DevTestPage = lazy(() => import('./pages/DevTestPage').then(m => ({ default: m.DevTestPage })))

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
    await initAmplitude()

    scheduleIdle(async () => {
      // 2. PostHog
      await initPostHog()
    })
  })
}

/**
 * 根路径重定向组件：直接重定向到 Landing Page
 *
 * 【变更说明】
 * - 访问 meetlumi.org/ 时自动跳转到 /landing
 * - 不再等待会话验证，直接重定向
 *
 * @returns {JSX.Element} 重定向组件
 */
function RootRedirect() {
  return <Navigate to="/landing" replace />
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
        <PermissionProvider>
        {/* Suspense 包裹懒加载路由，fallback={null} 因为 iOS 端有自己的 loading overlay */}
        <Suspense fallback={null}>
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
          <Route path="/campfire" element={<CampfireFocusPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        {/* WebView 调试控制台 - 仅在原生 App 或开发模式下显示 */}
        <DevConsole />
        </PermissionProvider>
      </AuthProvider>
    </LanguageProvider>
  )
}

export default App
