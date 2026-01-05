import { useEffect, useState, useRef, useContext } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { loadGoogleScript } from '../lib/google-script'
import { generateCSRFToken, googleLogin } from '../lib/google-login'
import { appleLogin } from '../lib/apple-login'
import { AppleSignInButton } from '../components/common/AppleSignInButton'
import { initAmplitude, trackEvent } from '../lib/amplitude'
import { DEFAULT_APP_PATH } from '../constants/routes'
import { AuthContext } from '../context/AuthContextDefinition'
import { getVisitorId } from '../utils/onboardingVisitor'
import { isGoogleLoginAvailable } from '../utils/webviewDetection'

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

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: GoogleIdConfiguration) => void
          renderButton: (parent: HTMLElement, options: GsiButtonConfiguration) => void
          prompt: () => void
        }
      }
    }
  }
}

interface GoogleCredentialResponse {
  credential: string;
  clientId?: string;
  select_by?: string;
}

/**
 * Login page component that reuses existing email auth flow and Google Identity button.
 * - Loads Google Identity Services via `loadGoogleScript` and `google.accounts.id`.
 * - Sends the returned ID token to `googleLogin` so the backend can issue a session and persist it.
 * - Calls `AuthContext.checkLoginState` after successful Google login to sync context before redirect.
 *
 * @returns Login page JSX
 */
export function LoginPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const auth = useContext(AuthContext)
  
  // Form states
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(true)
  
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isAppleLoading, setIsAppleLoading] = useState(false)
  const buttonRef = useRef<HTMLDivElement>(null)
  // Google 登录在 WebView 中不可用，需要检测并隐藏
  const canShowGoogleLogin = isGoogleLoginAvailable()

  useEffect(() => {
    void initAmplitude()
    trackEvent('login_page_opened')
  }, [])

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      let result;
      if (isSignUp) {
        // 获取 visitorId 用于绑定体验会话
        const visitorId = getVisitorId();
        result = await auth?.signupWithEmail(email, password, undefined, visitorId || undefined);
      } else {
        result = await auth?.loginWithEmail(email, password);
      }

      if (result?.error) {
        throw new Error(result.error);
      }

      // Success
      trackEvent(isSignUp ? 'signup_success' : 'login_success', { method: 'email' });

      const redirectPath = searchParams.get('redirect') || DEFAULT_APP_PATH;
      navigate(redirectPath, { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      setError(message);
      trackEvent('auth_failed', { method: 'email', error: message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // 如果在 WebView 中，不初始化 Google 登录
    if (!canShowGoogleLogin) return

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      console.warn('VITE_GOOGLE_CLIENT_ID is not set')
      return
    }

    const handleCredentialResponse = async (response: GoogleCredentialResponse) => {
      if (!response?.credential) return
      setIsLoading(true)
      setError(null)
      try {
        const csrf = generateCSRFToken()
        const res = await googleLogin(response.credential, csrf)
        auth?.checkLoginState()
        trackEvent('login_success', { is_new: res.is_new })

        const redirectPath = searchParams.get('redirect') || DEFAULT_APP_PATH
        navigate(redirectPath, { replace: true })
      } catch (e) {
        console.error('Login error:', e)
        const message = e instanceof Error ? e.message : 'Login failed'
        setError(message)
        trackEvent('login_failed', { message })
      } finally {
        setIsLoading(false)
      }
    }

    const setup = async () => {
      try {
        await loadGoogleScript()

        if (window.google?.accounts?.id) {
          window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: false,
            cancel_on_tap_outside: false,
          })

          if (buttonRef.current) {
            window.google.accounts.id.renderButton(buttonRef.current, {
              type: 'standard',
              theme: 'outline',
              size: 'large',
              text: 'continue_with',
              shape: 'rectangular',
              logo_alignment: 'left',
            })
          }
        }
      } catch (e) {
        console.error('Failed to initialize Google Sign-In', e)
        setError('Failed to load Google Sign-In')
      }
    }

    setup()
  }, [canShowGoogleLogin]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAppleLogin = async () => {
    setIsAppleLoading(true)
    setError(null)
    try {
      const redirectPath = searchParams.get('redirect') || DEFAULT_APP_PATH
      await appleLogin(`${window.location.origin}${redirectPath}`)
      // Note: appleLogin will redirect to Apple's OAuth page
      // The user will be redirected back after authentication
    } catch (e) {
      console.error('Apple login error:', e)
      const message = e instanceof Error ? e.message : 'Apple login failed'
      setError(message)
      trackEvent('login_failed', { method: 'apple', message })
      setIsAppleLoading(false)
    }
  }

  return (
    <main className="page flex items-center justify-center min-h-screen bg-gray-50 p-4">
      <div className="card w-full max-w-md bg-white rounded-xl shadow-lg p-8">
        <h1 className="text-2xl font-bold text-center mb-2">
          {isSignUp ? 'Create Account' : 'Welcome Back'}
        </h1>
        <p className="text-center text-gray-500 mb-6 text-sm">
          {isSignUp ? 'Sign up to get started' : 'Sign in to continue to Lumi'}
        </p>

        {/* Email Form */}
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
            {isLoading ? 'Processing...' : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="text-center text-sm text-gray-600 mb-6">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp);
              setError(null);
            }}
            className="text-blue-600 font-medium hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">Or continue with</span>
          </div>
        </div>

        {/* Social Login Buttons */}
        <div className="space-y-3">
          {/* Google Button Container - 在 WebView 中隐藏 */}
          {canShowGoogleLogin && (
            <div className="flex justify-center min-h-[40px]" ref={buttonRef}></div>
          )}

          {/* Apple Login Button - Following Apple HIG */}
          <AppleSignInButton
            onClick={handleAppleLogin}
            isLoading={isAppleLoading}
            disabled={isLoading}
            variant="black"
            title="continue"
          />
        </div>

        {/* Terms and Privacy */}
        <p className="text-center text-xs text-gray-500 mt-6">
          By continuing, you agree to our{' '}
          <Link to="/terms" className="text-blue-600 hover:underline">
            Terms of Use
          </Link>
          {' '}and{' '}
          <Link to="/privacy" className="text-blue-600 hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </main >
  )
}
