import { useCallback, useRef, useState } from 'react';
import { DEFAULT_APP_PATH } from '../../constants/routes';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import {
  useGoogleIdentityButton,
  type GoogleCredentialResponse,
  type GoogleIdentityButtonOptions,
} from '../../hooks/useGoogleIdentityButton';
import { generateCSRFToken, googleLogin } from '../../lib/google-login';
import { appleLogin } from '../../lib/apple-login';
import { AppleSignInButton } from '../common/AppleSignInButton';
import { isGoogleLoginAvailable } from '../../utils/webviewDetection';

const GOOGLE_BUTTON_OPTIONS: GoogleIdentityButtonOptions = {
  type: 'standard',
  theme: 'outline',
  size: 'large',
  text: 'continue_with',
  shape: 'pill',
  logo_alignment: 'left',
  width: '340',
};

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
  const { t } = useTranslation();
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
        const message = err instanceof Error ? err.message : t('onboarding.loginFailed');
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [auth, onLoginSuccess, t],
  );

  const handleGoogleInitError = useCallback(
    (err: unknown) => {
      const message = err instanceof Error ? err.message : t('onboarding.googleInitFailed');
      setError(message);
    },
    [t],
  );

  useGoogleIdentityButton({
    enabled: isOpen && canShowGoogleLogin,
    buttonRef: googleButtonRef,
    onCredential: handleCredential,
    buttonOptions: GOOGLE_BUTTON_OPTIONS,
    onInitError: handleGoogleInitError,
  });

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
      const message = err instanceof Error ? err.message : t('onboarding.appleLoginFailed');
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
        aria-label="Close"
      />

      <div className="relative w-full max-w-md translate-y-0 rounded-t-3xl bg-white px-6 pt-6 pb-8 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Lumi Onboarding
            </p>
            <h3 className="text-2xl font-bold text-gray-900">{t('onboarding.signInTitle')}</h3>
            <p className="text-sm text-gray-600">{t('onboarding.signInDesc')}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
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
                <p className="mt-2 text-center text-xs text-gray-500">{t('onboarding.googleLoading')}</p>
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
                <p className="text-base font-semibold text-gray-900">{t('onboarding.emailLogin')}</p>
                <p className="text-xs text-gray-500">{t('onboarding.emailLoginHint')}</p>
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
          {t('onboarding.termsAgree')}{' '}
          <a
            href="/terms"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-gray-600 underline-offset-4 hover:underline"
          >
            {t('auth.termsOfUse')}
          </a>{' '}
          {t('auth.and')}{' '}
          <a
            href="/privacy"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-gray-600 underline-offset-4 hover:underline"
          >
            {t('auth.privacyPolicy')}
          </a>
          .
        </p>
      </div>
    </div>
  );
}
