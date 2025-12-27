import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DEFAULT_APP_PATH } from '../constants/routes';
import { clearVisitorData, getVisitorId } from '../utils/onboardingVisitor';
import { setUserId, resetUser, setUserProperties } from '../lib/amplitude';
import { resetMixpanelUser } from '../lib/mixpanel';
import { resetPostHogUser } from '../lib/posthog';

const DEFAULT_LOGIN_PATH = '/login/mobile';
const NATIVE_LOGIN_FLAG_KEY = 'native_login';

interface NativeAuthPayload {
  userId?: string;
  email?: string;
  accessToken?: string;
  refreshToken?: string;
  sessionToken?: string;
  name?: string;
  pictureUrl?: string;
}

declare global {
  interface Window {
    MindBoatNativeAuth?: NativeAuthPayload;
    /** Native Auth Bridge 就绪标志：网页已准备好接收登录态 */
    __MindBoatAuthReady?: boolean;
    AndroidBridge?: {
      onTaskCreated: (taskJson: string) => void;
      cancelTaskReminder: (taskId: string) => void;
      logMessage?: (message: string) => void;
      logout?: () => void;
      triggerGoogleSignIn?: () => void;
      isLoggedIn?: () => boolean;
      getUserInfo?: () => string;
      getIdToken?: () => string;
    };
    webkit?: {
      messageHandlers?: {
        userLogin?: {
          postMessage: (message: any) => void;
        };
        userLogout?: {
          postMessage: (message: any) => void;
        };
        /** 通知 Native 端网页已收到登录态，停止重试 */
        authConfirmed?: {
          postMessage: (message: { success: boolean; reason: string }) => void;
        };
        /** 网页主动向 Native 请求登录态 */
        requestNativeAuth?: {
          postMessage: (message: Record<string, never>) => void;
        };
      };
    };
  }

  interface DocumentEventMap {
    'mindboat:nativeLogin': CustomEvent<NativeAuthPayload>;
    'mindboat:nativeLogout': CustomEvent<void>;
    'mindboat:taskCreated': CustomEvent<{ task: any }>;
    'mindboat:taskDeleted': CustomEvent<{ taskId: string }>;
  }
}

export interface AuthState {
  isLoggedIn: boolean;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  userPicture: string | null;
  isNewUser: boolean;
  sessionToken: string | null;
  refreshToken: string | null;
  isNativeLogin: boolean;
}

export interface AuthContextValue extends AuthState {
  /** 同步本地存储并返回最新登录态 */
  checkLoginState: () => { isLoggedIn: boolean; userId: string | null; sessionToken: string | null };
  /** 跳转到登录页，带 redirect 参数 */
  navigateToLogin: (redirectPath?: string) => void;
  /** 邮箱登录 */
  loginWithEmail: (email: string, password: string) => Promise<{ error: string | null }>;
  /** 邮箱注册 */
  signupWithEmail: (email: string, password: string, fullName?: string, visitorId?: string) => Promise<{ error: string | null; data?: any }>;
  /** 统一登录/注册：自动判断用户是否存在，已注册则登录，未注册则自动创建账户 */
  authWithEmail: (email: string, password: string) => Promise<{ error: string | null; isNewUser?: boolean }>;
  /** 更新用户信息 */
  updateProfile: (updates: { name?: string; pictureUrl?: string }) => Promise<{ error: string | null }>;
  /** 登出并刷新登录态 */
  logout: () => void;
  /** 清空所有本地存储 */
  fullReset: () => void;
  /** 标记引导完成 */
  markOnboardingCompleted: (taskDescription: string, timeSpent: number, status: 'success' | 'failure') => void;
}

// 需要读取的 localStorage keys
const AUTH_STORAGE_KEYS = [
  'session_token',
  'user_id',
  'user_email',
  'user_name',
  'user_picture',
  'is_new_user',
  'refresh_token',
  NATIVE_LOGIN_FLAG_KEY,
] as const;

/**
 * 批量读取 localStorage，减少同步 I/O 次数
 * iOS WebView 中每次 localStorage.getItem 都是昂贵的同步操作
 */
function batchGetLocalStorage<T extends readonly string[]>(keys: T): Record<T[number], string | null> {
  const result = {} as Record<T[number], string | null>;
  // 单次循环读取所有 keys，比多次单独调用更快
  for (const key of keys) {
    result[key as T[number]] = localStorage.getItem(key);
  }
  return result;
}

function readAuthFromStorage(): AuthState {
  // 一次性批量读取所有需要的值（减少 iOS WebView 的 I/O 开销）
  const stored = batchGetLocalStorage(AUTH_STORAGE_KEYS);

  const sessionToken = stored['session_token'];
  const userId = stored['user_id'];
  const userEmail = stored['user_email'];
  const userName = stored['user_name'];
  const userPicture = stored['user_picture'];
  const isNewUser = stored['is_new_user'] === 'true';
  const refreshToken = stored['refresh_token'];
  const isNativeLogin = stored[NATIVE_LOGIN_FLAG_KEY] === 'true';

  const isLoggedIn = (!!sessionToken && !!userId) || (isNativeLogin && !!userId);

  return {
    isLoggedIn,
    userId,
    userEmail,
    userName,
    userPicture,
    isNewUser,
    sessionToken,
    refreshToken,
    isNativeLogin,
  };
}

/**
 * 通知原生 App 用户已登出
 * iOS: 使用 WKScriptMessageHandler (window.webkit.messageHandlers.userLogout)
 * Android: 使用 AndroidBridge (window.AndroidBridge.onLogout)
 */
function notifyNativeLogout(): void {
  try {
    // iOS: 使用 WKScriptMessageHandler 通知原生端
    if (window.webkit?.messageHandlers?.userLogout) {
      window.webkit.messageHandlers.userLogout.postMessage({});
      if (import.meta.env.DEV) {
        console.log('📱 已通过 WKScriptMessageHandler 通知 iOS 原生端登出');
      }
    }

    // Android: 使用 AndroidBridge 通知原生端
    if (window.AndroidBridge?.logout) {
      window.AndroidBridge.logout();
      if (import.meta.env.DEV) {
        console.log('📱 已通过 AndroidBridge 通知 Android 原生端登出');
      }
    }

    // 如果不在 WebView 中，仅在开发模式下提示
    if (import.meta.env.DEV && !window.webkit?.messageHandlers?.userLogout && !window.AndroidBridge?.logout) {
      console.log('ℹ️ 非原生 WebView 环境，跳过原生登出通知');
    }
  } catch (error) {
    console.error('❌ 通知原生端登出失败:', error);
  }
}

/**
 * 通知 Native 端网页已确认收到登录态，Native 可以停止重试
 * @param reason - 确认原因（用于调试）
 */
function notifyAuthConfirmed(reason: string = 'confirmed'): void {
  try {
    if (window.webkit?.messageHandlers?.authConfirmed) {
      window.webkit.messageHandlers.authConfirmed.postMessage({
        success: true,
        reason,
      });
      console.log('🔐 Web: 已通知 Native 停止重试, reason:', reason);
    }
  } catch (error) {
    console.error('❌ 通知 Native authConfirmed 失败:', error);
  }
}

/**
 * 向 Native 端主动请求登录态
 * 当网页加载完成但没有发现 MindBoatNativeAuth 时调用
 */
function requestNativeAuth(): void {
  try {
    if (window.webkit?.messageHandlers?.requestNativeAuth) {
      window.webkit.messageHandlers.requestNativeAuth.postMessage({});
      console.log('🔐 Web: 已向 Native 请求登录态');
    }
  } catch (error) {
    console.error('❌ 向 Native 请求登录态失败:', error);
  }
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  /** 登录页路径，默认 /login/mobile */
  loginPath?: string;
  /** 登录后跳转默认路径，默认 DEFAULT_APP_PATH */
  defaultRedirectPath?: string;
}

/**
 * 全局认证提供者：负责 Supabase 会话恢复、登录/注册、登出以及本地存储同步。
 *
 * @param {AuthProviderProps} props - 配置项（登录路径、默认跳转路径）
 * @returns {JSX.Element} 包裹子节点的 AuthContext.Provider
 */
export function AuthProvider({
  children,
  loginPath = DEFAULT_LOGIN_PATH,
  defaultRedirectPath = DEFAULT_APP_PATH,
}: AuthProviderProps) {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>(() => readAuthFromStorage());
  const loginPathRef = useRef(loginPath);
  const defaultRedirectRef = useRef(defaultRedirectPath);

  useEffect(() => {
    loginPathRef.current = loginPath;
  }, [loginPath]);

  useEffect(() => {
    defaultRedirectRef.current = defaultRedirectPath;
  }, [defaultRedirectPath]);

  const checkLoginState = useCallback(() => {
    const latest = readAuthFromStorage();
    setAuthState(latest);
    return {
      isLoggedIn: latest.isLoggedIn,
      userId: latest.userId,
      sessionToken: latest.sessionToken,
    };
  }, []);

  const navigateToLogin = useCallback((redirectPath?: string) => {
    const target = redirectPath || defaultRedirectRef.current || DEFAULT_APP_PATH;
    const loginTarget = loginPathRef.current || DEFAULT_LOGIN_PATH;
    navigate(`${loginTarget}?redirect=${encodeURIComponent(target)}`, { replace: true });
  }, [navigate]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase client not initialized' };

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return { error: error.message };
    }

    if (data.session && data.user) {
      // 为了兼容现有逻辑，手动写入 localStorage
      localStorage.setItem('session_token', data.session.access_token);
      if (data.session.refresh_token) {
        localStorage.setItem('refresh_token', data.session.refresh_token);
      }
      localStorage.setItem('user_id', data.user.id);
      localStorage.setItem('user_email', data.user.email || '');
      localStorage.setItem('is_new_user', 'false');
      localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);

      // 先尝试从 user_metadata 获取用户信息
      let userName = data.user.user_metadata?.full_name || '';
      let userPicture = data.user.user_metadata?.avatar_url || '';

      // 如果 user_metadata 没有名字或头像，从 public.users 表获取
      if (!userName || !userPicture) {
        try {
          const { data: userProfile } = await supabase
            .from('users')
            .select('name, picture_url')
            .eq('id', data.user.id)
            .single();

          if (userProfile) {
            if (!userName && userProfile.name) {
              userName = userProfile.name;
            }
            if (!userPicture && userProfile.picture_url) {
              userPicture = userProfile.picture_url;
            }
          }
        } catch (err) {
          console.warn('⚠️ 获取用户资料失败:', err);
        }
      }

      if (userName) localStorage.setItem('user_name', userName);
      if (userPicture) localStorage.setItem('user_picture', userPicture);

      console.log('✅ Login successful, session saved:', data.user.email);
      // 必须先等待 User ID 设置完成，Amplitude 才能将后续属性关联到该用户
      await setUserId(data.user.id);
      if (data.user.email) {
        void setUserProperties({ email: data.user.email });
      }
      checkLoginState(); // 更新状态
      return { error: null };
    }

    return { error: 'Login failed' };
  }, [checkLoginState]);

  const signupWithEmail = useCallback(async (email: string, password: string, fullName?: string, visitorId?: string) => {
    if (!supabase) return { error: 'Supabase client not initialized' };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    });

    if (error) {
      return { error: error.message };
    }

    // 注意：如果是需要邮箱验证的 Supabase 设置，这里可能还没有 session
    if (data.session && data.user) {
      localStorage.setItem('session_token', data.session.access_token);
      if (data.session.refresh_token) {
        localStorage.setItem('refresh_token', data.session.refresh_token);
      }
      localStorage.setItem('user_id', data.user.id);
      localStorage.setItem('user_email', data.user.email || '');
      // 优先使用传入的名字，否则回退到 metadata，再没有就不存
      const nameToSave = fullName || data.user.user_metadata?.full_name || '';
      if (nameToSave) {
        localStorage.setItem('user_name', nameToSave);
      }
      localStorage.setItem('is_new_user', 'true');
      localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);

      // 绑定访客会话到用户账号
      const visitorIdToUse = visitorId || getVisitorId();
      if (visitorIdToUse) {
        await bindOnboardingToUser(visitorIdToUse, data.user.id);
        // 清除访客数据
        clearVisitorData();
      }

      setUserId(data.user.id);
      if (data.user.email) {
        void setUserProperties({ email: data.user.email });
      }
      checkLoginState();
    }

    return { error: null, data };
  }, [checkLoginState]);

  /**
   * 统一登录/注册流程：
   * 1. 先尝试登录
   * 2. 如果登录失败（用户不存在），自动注册新账户
   */
  const authWithEmail = useCallback(async (email: string, password: string): Promise<{ error: string | null; isNewUser?: boolean }> => {
    if (!supabase) return { error: 'Supabase client not initialized' };

    // 先尝试登录
    const loginResult = await loginWithEmail(email, password);

    if (!loginResult.error) {
      // 登录成功
      return { error: null, isNewUser: false };
    }

    // 检查是否是"用户不存在"或"密码错误"的情况
    const errorLower = loginResult.error.toLowerCase();
    const isInvalidCredentials = errorLower.includes('invalid') ||
                                  errorLower.includes('credentials') ||
                                  errorLower.includes('not found') ||
                                  errorLower.includes('no user');

    if (isInvalidCredentials) {
      // 尝试注册新用户
      const signupResult = await signupWithEmail(email, password);

      if (!signupResult.error) {
        return { error: null, isNewUser: true };
      }

      // 如果注册也失败，检查是否是因为用户已存在（密码错误的情况）
      const signupErrorLower = signupResult.error.toLowerCase();
      if (signupErrorLower.includes('already') || signupErrorLower.includes('exists')) {
        // 用户存在但密码错误
        return { error: 'Incorrect password. Please try again.' };
      }

      return { error: signupResult.error };
    }

    // 其他登录错误
    return { error: loginResult.error };
  }, [loginWithEmail, signupWithEmail]);

  const logout = useCallback(async () => {
    // 获取当前的 session token 用于调用 API
    const currentToken = localStorage.getItem('session_token');
    
    if (supabase) {
      // 如果有有效的 token，先清理服务器端的设备记录
      if (currentToken) {
        try {
          const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user-devices`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentToken}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ action: 'remove_voip_device' }),
          });
          
          if (response.ok) {
            console.log('✅ VoIP 设备记录已从服务器清理');
          } else {
            console.warn('⚠️ 清理 VoIP 设备记录失败:', await response.text());
          }
        } catch (error) {
          console.error('❌ 清理 VoIP 设备记录时出错:', error);
        }
      }
      
      await supabase.auth.signOut();
    }
    
    // 清理本地存储的 VoIP token
    localStorage.removeItem('voip_token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('session_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user_email');
    localStorage.removeItem('user_name');
    localStorage.removeItem('user_picture');
    localStorage.removeItem('is_new_user');
    localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);

    if (import.meta.env.DEV) {
      console.log('🔓 已登出');
    }

    // 🎉 主动通知原生 App 用户已登出
    notifyNativeLogout();

    // 重置所有埋点工具的用户身份
    resetUser(); // Amplitude
    resetMixpanelUser(); // Mixpanel
    resetPostHogUser(); // PostHog
    checkLoginState();
  }, [checkLoginState]);

  /**
   * 绑定访客的 Onboarding 会话到用户账号
   */
  const bindOnboardingToUser = async (visitorId: string, userId: string) => {
    if (!supabase) return;

    try {
      // 查找该访客最近完成的体验会话
      const { data: sessions, error } = await supabase
        .from('onboarding_session')
        .select('*')
        .eq('visitor_id', visitorId)
        .eq('status', 'task_completed')
        .order('task_ended_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Failed to fetch onboarding sessions:', error);
        return;
      }

      if (sessions && sessions.length > 0) {
        // 绑定到用户
        const { error: updateError } = await supabase
          .from('onboarding_session')
          .update({ user_id: userId })
          .eq('id', sessions[0].id);

        if (updateError) {
          console.error('Failed to bind onboarding session to user:', updateError);
        } else {
          console.log('✅ Onboarding session bound to user:', userId);
        }
      }
    } catch (err) {
      console.error('Error binding onboarding to user:', err);
    }
  };

  const updateProfile = useCallback(async (updates: { name?: string; pictureUrl?: string }) => {
    if (!supabase) return { error: 'Supabase client not initialized' };
    
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'No user logged in' };

    // 1. Update auth.users metadata
    const { error: authError } = await supabase.auth.updateUser({
      data: {
        ...(updates.name && { full_name: updates.name }),
        ...(updates.pictureUrl && { avatar_url: updates.pictureUrl }),
      }
    });

    if (authError) return { error: authError.message };

    // 2. Update public.users table
    const { error: dbError } = await supabase
      .from('users')
      .update({
        ...(updates.name && { name: updates.name }),
        ...(updates.pictureUrl && { picture_url: updates.pictureUrl }),
      })
      .eq('id', user.id);

    if (dbError) return { error: dbError.message };

    // 3. Update local storage
    if (updates.name) localStorage.setItem('user_name', updates.name);
    if (updates.pictureUrl) localStorage.setItem('user_picture', updates.pictureUrl);
    
    checkLoginState();
    return { error: null };
  }, [checkLoginState]);

  const fullReset = useCallback(() => {
    localStorage.clear();
    if (import.meta.env.DEV) {
      console.log('🗑️ 完全重置 - 所有 localStorage 已清除');
    }
    checkLoginState();
  }, [checkLoginState]);

  const markOnboardingCompleted = useCallback((taskDescription: string, timeSpent: number, status: 'success' | 'failure') => {
    localStorage.setItem('has_completed_onboarding', 'true');
    localStorage.setItem('onboarding_completed_task', taskDescription);
    localStorage.setItem('onboarding_time_spent', String(timeSpent));
    localStorage.setItem('onboarding_status', status);
  }, []);

  /**
   * 应用原生 WebView 注入的登录态：
   * 1. 将 userId/email 写入本地存储（便于页面态感知「已登录」）
   * 2. 若提供 accessToken/refreshToken，则尝试同步到 Supabase Auth
   * 3. 同步埋点用户标识
   *
   * @param {NativeAuthPayload | undefined} payload - 原生注入的登录数据
   */
  const applyNativeLogin = useCallback(async (payload?: NativeAuthPayload) => {
    const authPayload = payload || window.MindBoatNativeAuth;
    const userId = authPayload?.userId ?? (authPayload as any)?.user_id;
    const email = authPayload?.email ?? (authPayload as any)?.user_email;
    const accessToken = authPayload?.accessToken
      ?? authPayload?.sessionToken
      ?? (authPayload as any)?.access_token
      ?? (authPayload as any)?.session_token;
    const refreshToken = authPayload?.refreshToken ?? (authPayload as any)?.refresh_token;
    const userName = authPayload?.name ?? (authPayload as any)?.user_name ?? (authPayload as any)?.full_name;
    const pictureUrl = authPayload?.pictureUrl ?? (authPayload as any)?.picture_url ?? (authPayload as any)?.avatar_url;
    const isJwt = (token?: string | null) => Boolean(token && token.split('.').length === 3);
    const accessLooksJwt = isJwt(accessToken);
    const refreshLooksJwt = isJwt(refreshToken);

    if (!userId) {
      console.warn('mindboat:nativeLogin 缺少 userId，已忽略');
      return;
    }

    const uuidPattern = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/;
    if (!uuidPattern.test(userId)) {
      console.warn('⚠️ mindboat:nativeLogin 提供的 userId 不是有效的 Supabase UUID，Task/日程接口可能会返回 400');
    }

    localStorage.setItem('user_id', userId);
    if (email) localStorage.setItem('user_email', email);
    if (userName) localStorage.setItem('user_name', userName);
    if (pictureUrl) localStorage.setItem('user_picture', pictureUrl);
    localStorage.setItem('is_new_user', 'false');
    localStorage.setItem(NATIVE_LOGIN_FLAG_KEY, 'true');

    if (accessToken) {
      localStorage.setItem('session_token', accessToken);
    }
    if (refreshToken) {
      localStorage.setItem('refresh_token', refreshToken);
    }

    if (supabase && accessToken && refreshToken) {
      if (!accessLooksJwt || !refreshLooksJwt) {
        console.warn('⚠️ 原生登录提供的 token 不是有效的 JWT，已跳过 Supabase 会话设置');
      } else {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            console.warn('⚠️ 原生登录无法建立 Supabase 会话', error);
          } else if (data.session) {
            localStorage.setItem('session_token', data.session.access_token);
            if (data.session.refresh_token) {
              localStorage.setItem('refresh_token', data.session.refresh_token);
            }
            localStorage.setItem('user_email', data.session.user.email || email || '');
          }
        } catch (err) {
          console.warn('⚠️ 设置 Supabase 会话失败', err);
        }
      }
    } else if (accessToken && !refreshToken) {
      console.warn('⚠️ 原生登录未提供 refresh_token，Supabase 会话无法自动刷新');
    }

    // 如果原生端没有传递用户名或头像，从数据库获取
    if (supabase && (!userName || !pictureUrl)) {
      try {
        const { data: userProfile } = await supabase
          .from('users')
          .select('name, picture_url')
          .eq('id', userId)
          .single();

        if (userProfile) {
          if (!userName && userProfile.name) {
            localStorage.setItem('user_name', userProfile.name);
          }
          if (!pictureUrl && userProfile.picture_url) {
            localStorage.setItem('user_picture', userProfile.picture_url);
          }
        }
      } catch (err) {
        console.warn('⚠️ 获取用户资料失败:', err);
      }
    }

    await setUserId(userId);
    if (email) {
      void setUserProperties({ email });
    }
    checkLoginState();

    // 通知 Native 端网页已成功处理登录态，可以停止重试
    notifyAuthConfirmed('session_set');
    console.log('🔐 Web: 登录态设置成功, userId:', userId);
  }, [checkLoginState]);

  /**
   * 清理原生注入的登录态，保持与现有登出逻辑一致。
   */
  const applyNativeLogout = useCallback(() => {
    localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
    void logout();
  }, [logout]);

  useEffect(() => {
    const handleNativeLogin = (event: Event) => {
      const nativeEvent = event as CustomEvent<NativeAuthPayload>;
      void applyNativeLogin(nativeEvent.detail);
    };

    const handleNativeLogout = () => {
      void applyNativeLogout();
    };

    /**
     * 初始化 Native Auth Bridge：
     * 1. 设置 __MindBoatAuthReady 标志，告诉 Native 网页已准备好
     * 2. 检查是否已有 Native 设置的登录态（Native 可能先于网页设置）
     * 3. 如果没有登录态，主动向 Native 请求
     */
    const initNativeAuthBridge = () => {
      // 标记网页已准备好接收登录态
      window.__MindBoatAuthReady = true;
      console.log('🔐 Web: Native Auth Bridge 已初始化');

      // 检查是否已经有 Native 设置的登录态
      if (window.MindBoatNativeAuth) {
        console.log('🔐 Web: 发现已设置的登录态，立即处理');
        void applyNativeLogin(window.MindBoatNativeAuth);
      } else {
        // 没有登录态，主动向 Native 请求
        console.log('🔐 Web: 没有登录态，向 Native 请求...');
        requestNativeAuth();
      }
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      initNativeAuthBridge();
    } else {
      document.addEventListener('DOMContentLoaded', initNativeAuthBridge);
    }

    window.addEventListener('mindboat:nativeLogin', handleNativeLogin as EventListener);
    window.addEventListener('mindboat:nativeLogout', handleNativeLogout);

    return () => {
      window.removeEventListener('mindboat:nativeLogin', handleNativeLogin as EventListener);
      window.removeEventListener('mindboat:nativeLogout', handleNativeLogout);
      document.removeEventListener('DOMContentLoaded', initNativeAuthBridge);
    };
  }, [applyNativeLogin, applyNativeLogout]);

  // 初始化时同步一次并恢复 Supabase session
  useEffect(() => {
    // 立即从 localStorage 读取状态，让 UI 先渲染
    checkLoginState();

    const client = supabase;
    if (!client) return;

    const clearAuthStorage = () => {
      localStorage.removeItem('session_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_id');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_name');
      localStorage.removeItem('user_picture');
      localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
      setAuthState(readAuthFromStorage());
    };

    /**
     * 非阻塞地绑定分析工具用户身份
     * 不使用 await，让主流程继续执行
     */
    const bindAnalyticsUser = (userId: string, email?: string | null) => {
      // 使用 void 确保不阻塞，分析工具绑定失败不影响用户体验
      void setUserId(userId);
      if (email) {
        void setUserProperties({ email });
      }
    };

    const restoreSession = async () => {
      const stored = batchGetLocalStorage(['session_token', 'refresh_token', 'user_id', NATIVE_LOGIN_FLAG_KEY] as const);
      const hasNativeAuth = stored[NATIVE_LOGIN_FLAG_KEY] === 'true' && !!stored['user_id'];
      const storedAccessToken = stored['session_token'];
      const storedRefreshToken = stored['refresh_token'];

      // 1. 先尝试从 Supabase 获取现有会话（通常很快，因为是从内存/cookie读取）
      const { data: { session } } = await client.auth.getSession();

      if (session) {
        console.log('✅ Supabase session restored:', session.user.email);
        localStorage.setItem('session_token', session.access_token);
        if (session.refresh_token) {
          localStorage.setItem('refresh_token', session.refresh_token);
        }
        localStorage.setItem('user_id', session.user.id);
        localStorage.setItem('user_email', session.user.email || '');
        localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);

        // 如果 localStorage 中没有用户名或头像，从数据库获取
        const storedName = localStorage.getItem('user_name');
        const storedPicture = localStorage.getItem('user_picture');
        if (!storedName || !storedPicture) {
          try {
            const { data: userProfile } = await client
              .from('users')
              .select('name, picture_url')
              .eq('id', session.user.id)
              .single();

            if (userProfile) {
              if (!storedName && userProfile.name) {
                localStorage.setItem('user_name', userProfile.name);
              }
              if (!storedPicture && userProfile.picture_url) {
                localStorage.setItem('user_picture', userProfile.picture_url);
              }
            }
          } catch (err) {
            console.warn('⚠️ 获取用户资料失败:', err);
          }
        }

        // 非阻塞绑定分析工具
        bindAnalyticsUser(session.user.id, session.user.email);
        checkLoginState();
        // 通知 Native 端网页已有有效 session，可以停止重试
        notifyAuthConfirmed('existing_session');
        return;
      }

      console.log('⚠️ No Supabase session found');

      // 2. 尝试用本地存储的 token 恢复会话
      if (storedAccessToken && storedRefreshToken) {
        const { data: restoredSession, error } = await client.auth.setSession({
          access_token: storedAccessToken,
          refresh_token: storedRefreshToken,
        });

        if (error) {
          console.error('❌ Failed to restore Supabase session from local storage', error);
          clearAuthStorage();
          return;
        }

        if (restoredSession.session) {
          localStorage.setItem('session_token', restoredSession.session.access_token);
          if (restoredSession.session.refresh_token) {
            localStorage.setItem('refresh_token', restoredSession.session.refresh_token);
          }
          localStorage.setItem('user_id', restoredSession.session.user.id);
          localStorage.setItem('user_email', restoredSession.session.user.email || '');
          localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);

          // 如果 localStorage 中没有用户名或头像，从数据库获取
          const storedName = localStorage.getItem('user_name');
          const storedPicture = localStorage.getItem('user_picture');
          if (!storedName || !storedPicture) {
            try {
              const { data: userProfile } = await client
                .from('users')
                .select('name, picture_url')
                .eq('id', restoredSession.session.user.id)
                .single();

              if (userProfile) {
                if (!storedName && userProfile.name) {
                  localStorage.setItem('user_name', userProfile.name);
                }
                if (!storedPicture && userProfile.picture_url) {
                  localStorage.setItem('user_picture', userProfile.picture_url);
                }
              }
            } catch (err) {
              console.warn('⚠️ 获取用户资料失败:', err);
            }
          }

          // 非阻塞绑定分析工具
          bindAnalyticsUser(restoredSession.session.user.id, restoredSession.session.user.email);
          checkLoginState();
          // 通知 Native 端 session 已从本地存储恢复，可以停止重试
          notifyAuthConfirmed('restored_session');
        } else {
          console.warn('⚠️ Stored tokens invalid, clearing local auth state');
          clearAuthStorage();
        }
      } else {
        if (hasNativeAuth) {
          // 原生登录（无 Supabase token）场景：保留本地态由原生端接管
          setAuthState(readAuthFromStorage());
        } else {
          clearAuthStorage();
        }
      }
    };

    // 使用 requestIdleCallback 在浏览器空闲时执行会话恢复
    // 这样不会阻塞首屏渲染
    const scheduleRestore = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => void restoreSession(), { timeout: 2000 });
      } else {
        // iOS Safari 不支持 requestIdleCallback，使用 setTimeout 作为 fallback
        setTimeout(() => void restoreSession(), 0);
      }
    };

    scheduleRestore();

    // 监听 auth 状态变化
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state changed:', event);
      if (session) {
        // 同步 session 到 localStorage
        localStorage.setItem('session_token', session.access_token);
        if (session.refresh_token) {
          localStorage.setItem('refresh_token', session.refresh_token);
        }
        localStorage.setItem('user_id', session.user.id);
        localStorage.setItem('user_email', session.user.email || '');
        localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
        // 非阻塞绑定分析工具
        bindAnalyticsUser(session.user.id, session.user.email);
        checkLoginState();
      } else if (event === 'SIGNED_OUT') {
        // 清除 localStorage
        localStorage.removeItem('session_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_id');
        localStorage.removeItem('user_email');
        localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
        resetUser();
        checkLoginState();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [checkLoginState]);

  // 监听其他标签页的登录状态变化
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (!event.key || event.key === 'session_token' || event.key === 'user_id' || event.key === NATIVE_LOGIN_FLAG_KEY) {
        checkLoginState();
      }
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [checkLoginState]);

  const contextValue = useMemo<AuthContextValue>(() => ({
    ...authState,
    checkLoginState,
    navigateToLogin,
    loginWithEmail,
    signupWithEmail,
    authWithEmail,
    updateProfile,
    logout,
    fullReset,
    markOnboardingCompleted,
  }), [authState, checkLoginState, navigateToLogin, loginWithEmail, signupWithEmail, authWithEmail, updateProfile, logout, fullReset, markOnboardingCompleted]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
