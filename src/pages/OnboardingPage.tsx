import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { OnboardingAuthSheet } from '../components/onboarding/OnboardingAuthSheet';
import { DEFAULT_APP_PATH } from '../constants/routes';

/**
 * Onboarding 页面入口
 *
 * 流程：
 * 1. 未登录用户 → 显示欢迎页面，引导登录
 * 2. 已登录用户 → 跳转到主应用（不判断 onboarding 状态，由端侧决定）
 */
function OnboardingPage() {
  const { isLoggedIn, isSessionValidated } = useAuth({ requireLoginAfterOnboarding: false });
  const [showAuthSheet, setShowAuthSheet] = useState(false);
  const navigate = useNavigate();

  // 【已移除】onboarding 状态判断
  // 网页端不再判断 hasCompletedHabitOnboarding，由端侧决定加载哪个 URL
  // 已登录用户直接跳转到主应用
  useEffect(() => {
    if (isSessionValidated && isLoggedIn) {
      navigate(DEFAULT_APP_PATH, { replace: true });
    }
  }, [isSessionValidated, isLoggedIn, navigate]);

  // 等待 auth 状态验证完成
  if (!isSessionValidated) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 已登录 → 显示加载状态（等待跳转）
  if (isLoggedIn) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // 未登录 → 显示欢迎页面
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

          {/* 次要选项：直接登录 */}
          <button
            onClick={() => setShowAuthSheet(true)}
            className="mt-4 text-gray-500 hover:text-gray-700 text-sm transition-colors"
          >
            Already have an account? <span className="font-medium underline">Sign in</span>
          </button>
        </div>

        {/* 登录弹窗 */}
        <OnboardingAuthSheet
          isOpen={showAuthSheet}
          onClose={() => setShowAuthSheet(false)}
          onLoginSuccess={() => {
            setShowAuthSheet(false);
            // 登录成功后 useEffect 会自动跳转到主应用
          }}
        />
      </>
    );
}

export { OnboardingPage };
export default OnboardingPage;
