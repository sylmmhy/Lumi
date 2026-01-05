import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { HabitOnboardingPage } from './onboarding/HabitOnboardingPage';
import { OnboardingAuthSheet } from '../components/onboarding/OnboardingAuthSheet';

/**
 * Onboarding 页面入口
 *
 * 新流程：Habit Onboarding
 * 1. 未登录用户 → 先显示登录，登录后进入 Habit Onboarding
 * 2. 已登录用户 → 直接进入 Habit Onboarding
 *
 * Habit Onboarding 完成后会创建一个 routine 任务并跳转到 App
 */
function OnboardingPage() {
  const { isLoggedIn, isSessionValidated } = useAuth({ requireLoginAfterOnboarding: false });
  const [showAuthSheet, setShowAuthSheet] = useState(false);

  // 等待 auth 状态验证完成
  if (!isSessionValidated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 未登录 → 显示登录提示
  if (!isLoggedIn) {
    return (
      <>
        {/* 欢迎背景 */}
        <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
          <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg">
            <span className="text-5xl">👋</span>
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            Welcome to Lumi
          </h1>

          <p className="text-lg text-gray-600 text-center mb-8">
            Sign in to start building your habits with AI coaching.
          </p>

          <button
            onClick={() => setShowAuthSheet(true)}
            className="w-full max-w-xs py-4 px-8 bg-blue-600 hover:bg-blue-700
                       text-white text-lg font-medium rounded-full
                       transition-colors shadow-md"
          >
            Get Started
          </button>
        </div>

        {/* 登录弹窗 */}
        <OnboardingAuthSheet
          isOpen={showAuthSheet}
          onClose={() => setShowAuthSheet(false)}
          onLoginSuccess={() => {
            setShowAuthSheet(false);
            // 登录成功后刷新页面状态，将显示 HabitOnboardingPage
          }}
        />
      </>
    );
  }

  // 已登录 → 显示 Habit Onboarding
  return <HabitOnboardingPage />;
}

export { OnboardingPage };
export default OnboardingPage;
