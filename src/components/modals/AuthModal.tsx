import { useContext, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';
import { useTranslation } from '../../hooks/useTranslation';
import { appleLogin } from '../../lib/apple-login';

export interface AuthModalProps {
  /** 是否展示弹窗 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 登录成功回调（用于刷新父组件状态或继续操作） */
  onSuccess?: () => void;
}

/**
 * 登录/注册弹窗：复用现有邮箱与 Google 登录逻辑，但以模态形式呈现。
 *
 * @param {AuthModalProps} props - 控制弹窗开关与回调
 * @returns {JSX.Element | null} 覆盖式登录弹窗
 */
export function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const { t } = useTranslation();
  const auth = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAppleLoading, setIsAppleLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Auth not ready');
      return;
    }
    if (!email || !password) {
      setError(t('auth.enterEmailPassword'));
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      // 使用统一的登录/注册方法：自动判断用户是否存在
      const res = await auth.authWithEmail(email, password);
      if (res?.error) throw new Error(res.error);

      auth.checkLoginState();
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('auth.authFailed');
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleLogin = async () => {
    setIsAppleLoading(true);
    setError(null);
    try {
      await appleLogin(window.location.origin);
      // Note: appleLogin will redirect to Apple's OAuth page
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.authFailed');
      setError(message);
      setIsAppleLoading(false);
    }
  };

  if (!isOpen) return null;

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
          <h1 className="text-2xl font-bold text-center mb-2">{t('auth.welcome')}</h1>
          <p className="text-center text-gray-500 mb-6 text-sm">
            {t('auth.signInPrompt')}
          </p>

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
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
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('auth.password')}</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 placeholder:text-gray-500"
                placeholder="••••••••"
                required
                minLength={6}
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
              {isLoading ? t('common.processing') : t('auth.continue')}
            </button>
          </form>

          {/* Divider */}
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">{t('auth.orContinueWith') || 'Or continue with'}</span>
            </div>
          </div>

          {/* Apple Login Button */}
          <button
            type="button"
            onClick={handleAppleLogin}
            disabled={isAppleLoading || isLoading}
            className="w-full flex items-center justify-center gap-3 px-4 py-2.5 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
            </svg>
            <span className="text-sm font-medium text-gray-700">
              {isAppleLoading ? t('common.processing') : (t('auth.continueWithApple') || 'Continue with Apple')}
            </span>
          </button>

          <p className="text-center text-xs text-gray-400">
            {t('auth.termsAgree')}{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              {t('auth.termsOfUse')}
            </a>
            {' '}{t('auth.and')}{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
              {t('auth.privacyPolicy')}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
