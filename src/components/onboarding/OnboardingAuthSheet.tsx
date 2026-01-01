import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_APP_PATH } from '../../constants/routes';
import { useAuth } from '../../hooks/useAuth';
import { generateCSRFToken, googleLogin } from '../../lib/google-login';
import { loadGoogleScript } from '../../lib/google-script';
import { appleLogin } from '../../lib/apple-login';
import { AppleSignInButton } from '../common/AppleSignInButton';
import { isGoogleLoginAvailable } from '../../utils/webviewDetection';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfiguration) => void;
          renderButton: (parent: HTMLElement, options: GsiButtonConfiguration) => void;
          prompt: () => void;
        };
      };
    };
  }
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  auto_select?: boolean;
  cancel_on_tap_outside?: boolean;
}

interface GsiButtonConfiguration {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: string;
}

interface GoogleCredentialResponse {
  credential: string;
  clientId?: string;
  select_by?: string;
}

export interface OnboardingAuthSheetProps {
  /** 是否展示半屏登录弹窗 */
  isOpen: boolean;
  /** 关闭弹窗的回调 */
  onClose: () => void;
  /** 登录成功后的回调（用于隐藏弹窗或刷新状态） */
  onLoginSuccess?: () => void;
}

/**
 * Onboarding 阶段的登录半弹窗。
 * - 复用 Google Identity（loadGoogleScript + googleLogin）完成一键登录。
 * - 邮箱登录复用现有的 /login/mobile 路由，避免重复造轮子。
 * - 仅在 isOpen 时初始化 Google 脚本，减少不必要的加载。
 *
 * @param {OnboardingAuthSheetProps} props - 控制弹窗开关与回调。
 * @returns {JSX.Element | null} 半屏登录 UI。
 */
export function OnboardingAuthSheet({
  isOpen,
  onClose,
  onLoginSuccess,
}: OnboardingAuthSheetProps) {
  const auth = useAuth({
    requireLoginAfterOnboarding: false,
    redirectPath: DEFAULT_APP_PATH,
  });
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  // Google 登录在 WebView 中不可用，需要检测并隐藏
  const canShowGoogleLogin = isGoogleLoginAvailable();

  const handleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response?.credential) return;
      setIsLoading(true);
      setError(null);
      try {
        const csrf = generateCSRFToken();
        await googleLogin(response.credential, csrf);
        auth.checkLoginState();
        onLoginSuccess?.();
      } catch (err) {
        const message = err instanceof Error ? err.message : '登录失败，请稍后再试';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [auth, onLoginSuccess],
  );

  useEffect(() => {
    if (!isOpen) return;
    // 如果在 WebView 中，不初始化 Google 登录
    if (!canShowGoogleLogin) return;

    let cancelled = false;
    const setupGoogle = async () => {
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
      if (!clientId) {
        return;
      }

      try {
        await loadGoogleScript();
        if (cancelled) return;

        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredential,
            auto_select: false,
            cancel_on_tap_outside: true,
          });

          if (googleButtonRef.current) {
            googleButtonRef.current.innerHTML = '';
            window.google.accounts.id.renderButton(googleButtonRef.current, {
              type: 'standard',
              theme: 'outline',
              size: 'large',
              text: 'continue_with',
              shape: 'pill',
              logo_alignment: 'left',
              width: '340',
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Google 登录初始化失败';
        setError(message);
      }
    };

    void setupGoogle();

    return () => {
      cancelled = true;
    };
  }, [handleCredential, isOpen, canShowGoogleLogin]);

  const handleEmailLogin = () => {
    auth.navigateToLogin(DEFAULT_APP_PATH);
  };

  const handleAppleLogin = async () => {
    setIsAppleLoading(true);
    setError(null);
    try {
      await appleLogin(`${window.location.origin}${DEFAULT_APP_PATH}`);
      // Note: appleLogin will redirect to Apple's OAuth page
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Apple 登录失败，请稍后再试';
      setError(message);
      setIsAppleLoading(false);
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-label="关闭登录弹窗"
      />

      <div className="relative w-full max-w-md translate-y-0 rounded-t-3xl bg-white px-6 pt-6 pb-8 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              FireGo Onboarding
            </p>
            <h3 className="text-2xl font-bold text-gray-900">登录以同步进度</h3>
            <p className="text-sm text-gray-600">使用 Google 或邮箱登录，保存任务与奖励。</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭登录弹窗"
          >
            ×
          </button>
        </div>

        <div className="mt-6 space-y-4">
          {/* Google Login Button - 在 WebView 中隐藏 */}
          {canShowGoogleLogin && (
            <div className="w-full">
              <div className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2">
                <div ref={googleButtonRef} className="flex w-full justify-center" />
              </div>
              {isLoading && (
                <p className="mt-2 text-center text-xs text-gray-500">正在获取 Google 登录信息...</p>
              )}
            </div>
          )}

          {/* Apple Login Button - Following Apple HIG */}
          <AppleSignInButton
            onClick={handleAppleLogin}
            isLoading={isAppleLoading}
            disabled={isLoading}
            variant="black"
            title="signin"
          />

          <button
            type="button"
            onClick={handleEmailLogin}
            className="flex w-full items-center justify-between rounded-2xl border border-gray-200 px-4 py-3 transition hover:border-gray-300 hover:shadow-sm"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-lg">
                ✉️
              </span>
              <div className="text-left">
                <p className="text-base font-semibold text-gray-900">使用邮箱登录</p>
                <p className="text-xs text-gray-500">跳转后输入邮箱密码即可</p>
              </div>
            </div>
            <span className="text-lg text-gray-300">›</span>
          </button>
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-500" role="alert">
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-xs text-gray-400">
          登录即表示同意 FireGo 的{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-gray-600 underline-offset-4 hover:underline"
          >
            使用条款
          </a>{' '}
          和{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-gray-600 underline-offset-4 hover:underline"
          >
            隐私政策
          </a>
          。
        </p>
      </div>
    </div>
  );
}
