import { useContext, useState } from 'react';
import { AuthContext } from '../../context/AuthContext';

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
  const auth = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth) {
      setError('Auth not ready');
      return;
    }
    if (!email || !password) {
      setError('Please enter email and password');
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
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
    } finally {
      setIsLoading(false);
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
          <h1 className="text-2xl font-bold text-center mb-2">Welcome</h1>
          <p className="text-center text-gray-500 mb-6 text-sm">
            Sign in or create an account to continue
          </p>

          <form onSubmit={handleEmailAuth} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
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
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Processing...' : 'Continue'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-400">
            By continuing you agree to FireGo Terms and Privacy.
          </p>
        </div>
      </div>
    </div>
  );
}
