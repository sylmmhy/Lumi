import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContextDefinition';
import { DEFAULT_APP_PATH } from '../../constants/routes';
import { useTranslation } from '../../hooks/useTranslation';
import {
  useGoogleIdentityButton,
  type GoogleCredentialResponse,
  type GoogleIdentityButtonOptions,
} from '../../hooks/useGoogleIdentityButton';
import { appleLogin } from '../../lib/apple-login';
import { generateCSRFToken, googleLogin } from '../../lib/google-login';
import { AppleSignInButton } from '../common/AppleSignInButton';
import { isGoogleLoginAvailable } from '../../utils/webviewDetection';

export interface AuthModalProps {
  /** 是否展示弹窗 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 登录成功回调（用于刷新父组件状态或继续操作） */
  onSuccess?: () => void;
  /** 嵌入模式：不显示弹窗背景和关闭按钮，作为独立页面内容 */
  embedded?: boolean;
  /** 嵌入模式下登录成功后的重定向路径 */
  redirectPath?: string;
}

/** 邮箱登录步骤 */
type EmailStep = 'email' | 'otp';

const GOOGLE_BUTTON_OPTIONS: GoogleIdentityButtonOptions = {
  type: 'standard',
  theme: 'outline',
  size: 'large',
  text: 'continue_with',
  shape: 'rectangular',
  logo_alignment: 'left',
  width: container => String(container.offsetWidth || 400),
};

/**
 * 登录/注册弹窗：复用现有邮箱与 Google 登录逻辑，但以模态形式呈现。
 * 邮箱登录使用验证码 (OTP) 方式，无需密码。
 *
 * @param {AuthModalProps} props - 控制弹窗开关与回调
 * @returns {JSX.Element | null} 覆盖式登录弹窗
 */
export function AuthModal({ isOpen, onClose, onSuccess, embedded = false, redirectPath }: AuthModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const auth = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailStep, setEmailStep] = useState<EmailStep>('email');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const otpInputRef = useRef<HTMLInputElement>(null);
  const hasGoogleClientId = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
  // Google 登录在 WebView 中不可用，需要检测并隐藏
  const canShowGoogleLogin = hasGoogleClientId && isGoogleLoginAvailable();

  // 登录成功后的处理
  // 【已移除】onboarding 跳转判断，网页端不再判断，由端侧决定
  const handleSuccess = useCallback(() => {
    if (embedded) {
      // 直接跳转到目标页面，不判断 onboarding 状态
      navigate(redirectPath || DEFAULT_APP_PATH, { replace: true });
    } else {
      onSuccess?.();
      onClose();
    }
  }, [embedded, redirectPath, navigate, onSuccess, onClose]);

  const handleGoogleCredential = useCallback(
    async (response: GoogleCredentialResponse) => {
      if (!response?.credential) return;
      setIsGoogleLoading(true);
      setError(null);
      try {
        const csrf = generateCSRFToken();
        await googleLogin(response.credential, csrf);
        auth?.checkLoginState();
        handleSuccess();
      } catch (e) {
        const message = e instanceof Error ? e.message : t('auth.authFailed');
        setError(message);
      } finally {
        setIsGoogleLoading(false);
      }
    },
    [auth, handleSuccess, t],
  );

  const handleGoogleInitError = useCallback((err: unknown) => {
    console.error('Google Sign-In initialization failed:', err);
  }, []);

  useGoogleIdentityButton({
    enabled: isOpen && canShowGoogleLogin,
    buttonRef: googleButtonRef,
    onCredential: handleGoogleCredential,
    buttonOptions: GOOGLE_BUTTON_OPTIONS,
    onInitError: handleGoogleInitError,
  });

  // 重置状态当弹窗关闭时
  useEffect(() => {
    if (!isOpen) {
      setEmailStep('email');
      setOtpCode('');
      setError(null);
      setCountdown(0);
    }
  }, [isOpen]);

  // 倒计时逻辑
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // 自动聚焦到验证码输入框
  useEffect(() => {
    if (emailStep === 'otp' && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [emailStep]);

  /** 发送验证码 */
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Auth not ready');
      return;
    }
    if (!email) {
      setError(t('auth.enterEmail'));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await auth.sendEmailOtp(email);
      if (res?.error) throw new Error(res.error);

      // 发送成功，切换到验证码输入步骤
      setEmailStep('otp');
      setCountdown(60); // 60秒倒计时
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth.authFailed');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /** 验证验证码 */
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Auth not ready');
      return;
    }
    if (!otpCode) {
      setError(t('auth.enterOtp'));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await auth.verifyEmailOtp(email, otpCode);
      if (res?.error) throw new Error(res.error);

      auth.checkLoginState();
      handleSuccess();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth.authFailed');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /** 重新发送验证码 */
  const handleResendOtp = async () => {
    if (countdown > 0 || !auth) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await auth.sendEmailOtp(email);
      if (res?.error) throw new Error(res.error);
      setCountdown(60);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth.authFailed');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  /** 返回邮箱输入步骤 */
  const handleBackToEmail = () => {
    setEmailStep('email');
    setOtpCode('');
    setError(null);
  };

  const handleAppleLogin = async () => {
    setIsAppleLoading(true);
    setError(null);
    try {
      // Apple 登录会重定向，使用传入的 redirectPath 或默认路径
      const appleRedirectUrl = `${window.location.origin}${redirectPath || DEFAULT_APP_PATH}`;
      await appleLogin(appleRedirectUrl);
      // Note: appleLogin will redirect to Apple's OAuth page
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.authFailed');
      setError(message);
      setIsAppleLoading(false);
    }
  };

  if (!isOpen) return null;

  // 表单内容（共享给 modal 和 embedded 模式）
  const formContent = (
    <>
      <h1 className="text-2xl font-bold text-center mb-2">{t('auth.welcome')}</h1>
      <p className="text-center text-gray-500 mb-6 text-sm">
        {emailStep === 'email' ? t('auth.signInPrompt') : t('auth.otpSentTo').replace('{{email}}', email)}
      </p>

      {emailStep === 'email' ? (
        // 步骤1：输入邮箱
        <form onSubmit={handleSendOtp} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder:text-gray-500"
              placeholder="you@example.com"
              required
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm bg-red-50 p-2 rounded border border-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || isAppleLoading}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('common.processing') : t('auth.sendOtp')}
          </button>
        </form>
      ) : (
        // 步骤2：输入验证码
        <form onSubmit={handleVerifyOtp} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.otp')}</label>
            <input
              ref={otpInputRef}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder:text-gray-500 text-center text-2xl tracking-widest"
              placeholder="000000"
              maxLength={6}
              required
            />
          </div>

          {error && (
            <div className="text-red-500 text-sm bg-red-50 p-2 rounded border border-red-100">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || otpCode.length < 6}
            className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('common.processing') : t('auth.verifyOtp')}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={handleBackToEmail}
              className="text-gray-500 hover:text-gray-700"
            >
              {t('auth.changeEmail')}
            </button>
            <button
              type="button"
              onClick={handleResendOtp}
              disabled={countdown > 0 || isLoading}
              className="text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
            >
              {countdown > 0 ? t('auth.resendIn').replace('{{seconds}}', String(countdown)) : t('auth.resendOtp')}
            </button>
          </div>
        </form>
      )}

      {/* Divider */}
      <div className="relative mb-4">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200"></div>
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-2 bg-white text-gray-500">{t('auth.orContinueWith') || 'Or continue with'}</span>
        </div>
      </div>

      {/* Social Login Buttons */}
      <div className="space-y-3">
        {/* Google Login Button - 在 WebView 中隐藏 */}
        {canShowGoogleLogin && (
          <div className="w-full">
            <div ref={googleButtonRef} className="w-full" />
            {isGoogleLoading && (
              <p className="mt-2 text-center text-xs text-gray-500">{t('common.processing') || 'Processing...'}</p>
            )}
          </div>
        )}

        {/* Apple Login Button - Following Apple HIG */}
        <AppleSignInButton
          onClick={handleAppleLogin}
          isLoading={isAppleLoading}
          disabled={isLoading || isGoogleLoading}
          variant="black"
          title="continue"
        />
      </div>

      <p className="text-center text-xs text-gray-400 mt-6">
        {t('auth.termsAgree')}{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          {t('auth.termsOfUse')}
        </a>
        {' '}{t('auth.and')}{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
          {t('auth.privacyPolicy')}
        </a>
      </p>
    </>
  );

  // 嵌入模式：作为独立页面内容，无背景遮罩
  if (embedded) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8">
          {formContent}
        </div>
      </main>
    );
  }

  // 弹窗模式：带背景遮罩和关闭按钮
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <button
          type="button"
          className="absolute right-3 top-3 rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
          onClick={onClose}
          aria-label="关闭登录弹窗"
        >
          ×
        </button>

        <div className="p-8">
          {formContent}
        </div>
      </div>
    </div>
  );
}
