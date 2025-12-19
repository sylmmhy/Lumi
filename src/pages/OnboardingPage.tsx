import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
// Onboarding page now delegates orchestration to useOnboardingFlow and renders step components.
import { BottomNavBar, AssistantLoadingModal } from '../components';
import { WelcomeStep } from './onboarding/steps/WelcomeStep';
import { RunningStep } from './onboarding/steps/RunningStep';
import { WorkingStep } from './onboarding/steps/WorkingStep';
import { CompletedStep } from './onboarding/steps/CompletedStep';
import { useOnboardingFlow } from '../hooks/useOnboardingFlow';
import { useAuth } from '../hooks/useAuth';
import { DEFAULT_APP_PATH } from '../constants/routes';
import { checkOnboardingAccessDirect } from '../utils/onboardingVisitor';
import { OnboardingAuthSheet } from '../components/onboarding/OnboardingAuthSheet';
import '../styles/onboarding.css';

/**
 * Onboarding 页面入口
 * 1. 复用 useAuth 判断是否已登录，已登录直接跳转 App 首页。
 * 2. 复用访客鉴权工具 checkOnboardingAccessDirect，如果体验资格已用过则跳转 App，避免重复进入引导。
 * 3. 仅在通过鉴权后才渲染 Onboarding 流程。
 *
 * @returns {JSX.Element | null} Onboarding 页面 JSX。
 */
function OnboardingPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth({ requireLoginAfterOnboarding: false });
  const [isVerifyingAccess, setIsVerifyingAccess] = useState(true);
  const [showAuthSheet, setShowAuthSheet] = useState(false);
  const [shouldStartAfterLogin, setShouldStartAfterLogin] = useState(false);

  useEffect(() => {
    let isActive = true;

    const redirectToApp = () => {
      if (!isActive) return;
      navigate(DEFAULT_APP_PATH, { replace: true });
    };

    const verifyAccess = async () => {
      // 已登录用户直接跳转到 App
      if (isLoggedIn) {
        redirectToApp();
        setIsVerifyingAccess(false);
        return;
      }

      try {
        const { canStart } = await checkOnboardingAccessDirect();
        if (!canStart) {
          redirectToApp();
          return;
        }
      } catch (error) {
        console.error('Failed to verify onboarding access:', error);
      } finally {
        if (isActive) {
          setIsVerifyingAccess(false);
        }
      }
    };

    void verifyAccess();

    return () => {
      isActive = false;
    };
  }, [isLoggedIn, navigate]);

  const {
    step,
    uiError,
    isConnecting,
    showBottomNav,
    canvasRef,
    dismissError,
    retryStart,
    views,
  } = useOnboardingFlow();

  /**
   * 在用户点击“Help me start”后才提示登录。
   * - 未登录：弹出半屏登录，不进入下一步。
   * - 已登录：直接继续原有启动逻辑。
   */
  const handleStartWithAuth = () => {
    if (!isLoggedIn) {
      setShouldStartAfterLogin(true);
      setShowAuthSheet(true);
      return;
    }
    views.welcome.onStartTask();
  };

  if (isVerifyingAccess) {
    return null;
  }

  return (
    <>
      {uiError && (
        <div className="fixed top-4 left-1/2 z-50 w-full max-w-xl -translate-x-1/2 px-4">
          <div className="flex items-start justify-between gap-3 rounded-2xl bg-red-500/80 px-4 py-3 text-white shadow-lg backdrop-blur">
            <div className="flex-1">
              <p className="text-sm font-semibold">连接出现问题</p>
              <p className="text-xs leading-relaxed">{uiError}</p>
            </div>
            <div className="flex items-center gap-2">
              {step === 'welcome' && !isConnecting && (
                <button
                  type="button"
                  onClick={retryStart}
                  className="rounded-md bg-white/20 px-2 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-white/30"
                >
                  重试
                </button>
              )}
              <button
                type="button"
                onClick={dismissError}
                className="rounded-md bg-white/20 px-2 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-white/30"
              >
                知道了
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`min-h-screen w-full relative overflow-y-auto ${showBottomNav ? 'pb-[140px]' : ''}`} style={{ backgroundColor: '#1e1e1e' }}>
        {/* 隐藏的视频处理 canvas */}
        <canvas ref={canvasRef} className="hidden" />

        {/* 主容器 */}
        <div className="relative w-full max-w-[403px] mx-auto px-[29px] py-[24px] flex flex-col items-center justify-center min-h-screen">
          {step === 'welcome' && (
            <WelcomeStep
              {...views.welcome}
              onStartTask={handleStartWithAuth}
            />
          )}

          {step === 'running' && <RunningStep {...views.running} />}

          {step === 'working' && <WorkingStep {...views.working} />}

          {step === 'completed' && <CompletedStep {...views.completed} />}
        </div>

        {showBottomNav && <BottomNavBar activeKey="home" variant="dark" />}
      </div>

      <OnboardingAuthSheet
        isOpen={showAuthSheet}
        onClose={() => {
          setShowAuthSheet(false);
          setShouldStartAfterLogin(false);
        }}
        onLoginSuccess={() => {
          setShowAuthSheet(false);
          if (shouldStartAfterLogin) {
            views.welcome.onStartTask();
            setShouldStartAfterLogin(false);
          }
        }}
      />

      <AssistantLoadingModal isOpen={isConnecting} />
    </>
  );
}

export { OnboardingPage };
export default OnboardingPage;
