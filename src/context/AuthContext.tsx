/**
 * AuthContext - 核心认证模块
 *
 * 重构后的精简版本，将各职责拆分到独立模块：
 * - analyticsSync.ts: 埋点工具同步
 * - oauthCallback.ts: OAuth 回调处理
 * - nativeAuthBridge.ts: Native App 桥接
 * - userProfile.ts: 用户资料管理
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue, type AuthState, type NativeAuthPayload } from './AuthContextDefinition';
import type { Session } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DEFAULT_APP_PATH } from '../constants/routes';
import { clearVisitorData, getVisitorId } from '../utils/onboardingVisitor';

// 拆分出的模块
import { bindAnalyticsUser, bindAnalyticsUserSync, resetAnalyticsUser } from './auth/analyticsSync';
import { getOAuthCallbackParams, hasOAuthCallbackParams, clearOAuthCallbackParams } from './auth/oauthCallback';
import {
  notifyNativeLogout,
  notifyAuthConfirmed,
  requestNativeAuth,
  parseNativeAuthPayload,
  isValidJwt,
  isValidSupabaseUuid,
} from './auth/nativeAuthBridge';
import { updateUserProfile, syncUserProfileToStorage } from './auth/userProfile';

// ==========================================
// 常量定义
// ==========================================

const DEFAULT_LOGIN_PATH = '/login/mobile';
const NATIVE_LOGIN_FLAG_KEY = 'native_login';

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

// ==========================================
// 全局类型声明
// ==========================================

declare global {
  interface Window {
    MindBoatNativeAuth?: NativeAuthPayload;
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
        userLogin?: { postMessage: (message: unknown) => void };
        userLogout?: { postMessage: (message: unknown) => void };
        authConfirmed?: { postMessage: (message: { success: boolean; reason: string }) => void };
        requestNativeAuth?: { postMessage: (message: Record<string, never>) => void };
      };
    };
  }

  interface DocumentEventMap {
    'mindboat:nativeLogin': CustomEvent<NativeAuthPayload>;
    'mindboat:nativeLogout': CustomEvent<void>;
    'mindboat:taskCreated': CustomEvent<{ task: unknown }>;
    'mindboat:taskDeleted': CustomEvent<{ taskId: string }>;
  }
}

// ==========================================
// 工具函数
// ==========================================

/**
 * 批量读取 localStorage，减少同步 I/O 次数
 * iOS WebView 中每次 localStorage.getItem 都是昂贵的同步操作
 */
function batchGetLocalStorage<T extends readonly string[]>(keys: T): Record<T[number], string | null> {
  const result = {} as Record<T[number], string | null>;
  for (const key of keys) {
    result[key as T[number]] = localStorage.getItem(key);
  }
  return result;
}

/**
 * 从 localStorage 读取认证状态
 */
function readAuthFromStorage(): AuthState {
  const stored = batchGetLocalStorage(AUTH_STORAGE_KEYS);

  const sessionToken = stored['session_token'];
  const userId = stored['user_id'];
  const isNativeLogin = stored[NATIVE_LOGIN_FLAG_KEY] === 'true';
  const isLoggedIn = (!!sessionToken && !!userId) || (isNativeLogin && !!userId);

  return {
    isLoggedIn,
    userId,
    userEmail: stored['user_email'],
    userName: stored['user_name'],
    userPicture: stored['user_picture'],
    isNewUser: stored['is_new_user'] === 'true',
    sessionToken,
    refreshToken: stored['refresh_token'],
    isNativeLogin,
  };
}

/**
 * 将 Supabase session 同步到本地存储
 */
function persistSessionToStorage(session: Session): void {
  localStorage.setItem('session_token', session.access_token);
  if (session.refresh_token) {
    localStorage.setItem('refresh_token', session.refresh_token);
  }
  localStorage.setItem('user_id', session.user.id);
  localStorage.setItem('user_email', session.user.email || '');
  localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
}

/**
 * 清理所有认证相关的 localStorage
 */
function clearAuthStorage(): void {
  localStorage.removeItem('session_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_email');
  localStorage.removeItem('user_name');
  localStorage.removeItem('user_picture');
  localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
}

// ==========================================
// AuthProvider 组件
// ==========================================

interface AuthProviderProps {
  children: ReactNode;
  loginPath?: string;
  defaultRedirectPath?: string;
}

export function AuthProvider({
  children,
  loginPath = DEFAULT_LOGIN_PATH,
  defaultRedirectPath = DEFAULT_APP_PATH,
}: AuthProviderProps) {
  const navigate = useNavigate();
  const [authState, setAuthState] = useState<AuthState>(() => readAuthFromStorage());
  const [isOAuthProcessing, setIsOAuthProcessing] = useState<boolean>(() => hasOAuthCallbackParams());
  const loginPathRef = useRef(loginPath);
  const defaultRedirectRef = useRef(defaultRedirectPath);
  const hasHandledOAuthRef = useRef(false);

  useEffect(() => { loginPathRef.current = loginPath; }, [loginPath]);
  useEffect(() => { defaultRedirectRef.current = defaultRedirectPath; }, [defaultRedirectPath]);

  // ==========================================
  // 核心状态管理
  // ==========================================

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

  // ==========================================
  // OAuth 回调处理
  // ==========================================

  const handleOAuthCallback = useCallback(async () => {
    const { code, accessToken, refreshToken, error, errorDescription } = getOAuthCallbackParams();
    const hasOAuthParams = Boolean(code || accessToken || error);

    if (!hasOAuthParams) {
      setIsOAuthProcessing(false);
      return;
    }

    if (hasHandledOAuthRef.current) return;
    hasHandledOAuthRef.current = true;
    setIsOAuthProcessing(true);
    console.log('🔐 检测到 OAuth 回调参数，开始处理...');

    if (!supabase) {
      console.error('❌ Supabase client not initialized, OAuth callback ignored');
      clearOAuthCallbackParams();
      setIsOAuthProcessing(false);
      return;
    }

    try {
      if (error) {
        console.error('❌ OAuth 回调错误:', error, errorDescription);
        return;
      }

      if (code) {
        console.log('🔐 PKCE flow: 使用 code 交换 session...');
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          console.error('❌ exchangeCodeForSession 失败:', exchangeError);
        } else if (data.session) {
          console.log('✅ OAuth 登录成功:', data.session.user.email);
          persistSessionToStorage(data.session);
          checkLoginState();
        }
        return;
      }

      if (accessToken && refreshToken) {
        console.log('🔐 Implicit flow: 使用 access_token 建立 session...');
        const { data, error: sessionError } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) {
          console.error('❌ setSession 失败:', sessionError);
        } else if (data.session) {
          console.log('✅ OAuth 登录成功:', data.session.user.email);
          persistSessionToStorage(data.session);
          checkLoginState();
        }
        return;
      }

      if (accessToken && !refreshToken) {
        console.warn('⚠️ OAuth 回调缺少 refresh_token，无法建立 Supabase session');
      }
    } catch (err) {
      console.error('❌ OAuth 回调处理失败:', err);
    } finally {
      clearOAuthCallbackParams();
      setIsOAuthProcessing(false);
    }
  }, [checkLoginState]);

  useEffect(() => { void handleOAuthCallback(); }, [handleOAuthCallback]);

  // ==========================================
  // 邮箱登录/注册
  // ==========================================

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'Supabase client not initialized' };

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };

    if (data.session && data.user) {
      localStorage.setItem('session_token', data.session.access_token);
      if (data.session.refresh_token) localStorage.setItem('refresh_token', data.session.refresh_token);
      localStorage.setItem('user_id', data.user.id);
      localStorage.setItem('user_email', data.user.email || '');
      localStorage.setItem('is_new_user', 'false');
      localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);

      // 获取用户资料
      let userName = data.user.user_metadata?.full_name || '';
      let userPicture = data.user.user_metadata?.avatar_url || '';

      if (!userName || !userPicture) {
        await syncUserProfileToStorage(supabase, data.user.id);
        userName = localStorage.getItem('user_name') || userName;
        userPicture = localStorage.getItem('user_picture') || userPicture;
      }

      if (userName) localStorage.setItem('user_name', userName);
      if (userPicture) localStorage.setItem('user_picture', userPicture);

      console.log('✅ Login successful:', data.user.email);
      await bindAnalyticsUserSync(data.user.id, data.user.email);
      checkLoginState();
      return { error: null };
    }

    return { error: 'Login failed' };
  }, [checkLoginState]);

  const signupWithEmail = useCallback(async (
    email: string,
    password: string,
    fullName?: string,
    visitorId?: string
  ) => {
    if (!supabase) return { error: 'Supabase client not initialized' };

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (error) return { error: error.message };

    if (data.session && data.user) {
      localStorage.setItem('session_token', data.session.access_token);
      if (data.session.refresh_token) localStorage.setItem('refresh_token', data.session.refresh_token);
      localStorage.setItem('user_id', data.user.id);
      localStorage.setItem('user_email', data.user.email || '');
      const nameToSave = fullName || data.user.user_metadata?.full_name || '';
      if (nameToSave) localStorage.setItem('user_name', nameToSave);
      localStorage.setItem('is_new_user', 'true');
      localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);

      // 绑定访客会话到用户账号
      const visitorIdToUse = visitorId || getVisitorId();
      if (visitorIdToUse) {
        await bindOnboardingToUser(visitorIdToUse, data.user.id);
        clearVisitorData();
      }

      bindAnalyticsUser(data.user.id, data.user.email);
      checkLoginState();
    }

    return { error: null, data };
  }, [checkLoginState]);

  const authWithEmail = useCallback(async (
    email: string,
    password: string
  ): Promise<{ error: string | null; isNewUser?: boolean }> => {
    if (!supabase) return { error: 'Supabase client not initialized' };

    const loginResult = await loginWithEmail(email, password);
    if (!loginResult.error) return { error: null, isNewUser: false };

    const errorLower = loginResult.error.toLowerCase();
    const isInvalidCredentials = errorLower.includes('invalid') ||
      errorLower.includes('credentials') ||
      errorLower.includes('not found') ||
      errorLower.includes('no user');

    if (isInvalidCredentials) {
      const signupResult = await signupWithEmail(email, password);
      if (!signupResult.error) return { error: null, isNewUser: true };

      const signupErrorLower = signupResult.error.toLowerCase();
      if (signupErrorLower.includes('already') || signupErrorLower.includes('exists')) {
        return { error: 'Incorrect password. Please try again.' };
      }
      return { error: signupResult.error };
    }

    return { error: loginResult.error };
  }, [loginWithEmail, signupWithEmail]);

  // ==========================================
  // 登出
  // ==========================================

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem('session_token');

    if (supabase) {
      // 清理 VoIP 设备
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
          if (response.ok) console.log('✅ VoIP 设备记录已清理');
          else console.warn('⚠️ 清理 VoIP 设备记录失败:', await response.text());
        } catch (error) {
          console.error('❌ 清理 VoIP 设备记录时出错:', error);
        }
      }
      await supabase.auth.signOut();
    }

    // 清理本地存储
    localStorage.removeItem('voip_token');
    clearAuthStorage();

    if (import.meta.env.DEV) console.log('🔓 已登出');

    notifyNativeLogout();
    resetAnalyticsUser();
    checkLoginState();
  }, [checkLoginState]);

  // ==========================================
  // 用户资料更新
  // ==========================================

  const updateProfile = useCallback(async (updates: { name?: string; pictureUrl?: string }) => {
    if (!supabase) return { error: 'Supabase client not initialized' };
    const result = await updateUserProfile(supabase, updates);
    if (!result.error) checkLoginState();
    return result;
  }, [checkLoginState]);

  // ==========================================
  // 辅助功能
  // ==========================================

  const bindOnboardingToUser = async (visitorId: string, userId: string) => {
    if (!supabase) return;
    try {
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
        const { error: updateError } = await supabase
          .from('onboarding_session')
          .update({ user_id: userId })
          .eq('id', sessions[0].id);

        if (updateError) console.error('Failed to bind onboarding session:', updateError);
        else console.log('✅ Onboarding session bound to user:', userId);
      }
    } catch (err) {
      console.error('Error binding onboarding to user:', err);
    }
  };

  const fullReset = useCallback(() => {
    localStorage.clear();
    if (import.meta.env.DEV) console.log('🗑️ 完全重置 - 所有 localStorage 已清除');
    checkLoginState();
  }, [checkLoginState]);

  const markOnboardingCompleted = useCallback((
    taskDescription: string,
    timeSpent: number,
    status: 'success' | 'failure'
  ) => {
    localStorage.setItem('has_completed_onboarding', 'true');
    localStorage.setItem('onboarding_completed_task', taskDescription);
    localStorage.setItem('onboarding_time_spent', String(timeSpent));
    localStorage.setItem('onboarding_status', status);
  }, []);

  // ==========================================
  // Native 登录处理
  // ==========================================

  const applyNativeLogin = useCallback(async (payload?: NativeAuthPayload) => {
    const parsed = parseNativeAuthPayload(payload);
    const { userId, email, accessToken, refreshToken, userName, pictureUrl } = parsed;

    if (!userId) {
      console.warn('mindboat:nativeLogin 缺少 userId，已忽略');
      return;
    }

    if (!isValidSupabaseUuid(userId)) {
      console.warn('⚠️ mindboat:nativeLogin 提供的 userId 不是有效的 Supabase UUID');
    }

    localStorage.setItem('user_id', userId);
    if (email) localStorage.setItem('user_email', email);
    if (userName) localStorage.setItem('user_name', userName);
    if (pictureUrl) localStorage.setItem('user_picture', pictureUrl);
    localStorage.setItem('is_new_user', 'false');
    localStorage.setItem(NATIVE_LOGIN_FLAG_KEY, 'true');

    if (accessToken) localStorage.setItem('session_token', accessToken);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);

    if (supabase && accessToken && refreshToken) {
      if (!isValidJwt(accessToken) || !isValidJwt(refreshToken)) {
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
            if (data.session.refresh_token) localStorage.setItem('refresh_token', data.session.refresh_token);
            localStorage.setItem('user_email', data.session.user.email || email || '');
          }
        } catch (err) {
          console.warn('⚠️ 设置 Supabase 会话失败', err);
        }
      }
    } else if (accessToken && !refreshToken) {
      console.warn('⚠️ 原生登录未提供 refresh_token，Supabase 会话无法自动刷新');
    }

    // 补全用户资料
    if (supabase && (!userName || !pictureUrl)) {
      await syncUserProfileToStorage(supabase, userId);
    }

    await bindAnalyticsUserSync(userId, email);
    checkLoginState();
    notifyAuthConfirmed('session_set');
    console.log('🔐 Web: 登录态设置成功, userId:', userId);
  }, [checkLoginState]);

  const applyNativeLogout = useCallback(() => {
    localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
    void logout();
  }, [logout]);

  // ==========================================
  // Native Auth Bridge 初始化
  // ==========================================

  useEffect(() => {
    const handleNativeLogin = (event: Event) => {
      const nativeEvent = event as CustomEvent<NativeAuthPayload>;
      void applyNativeLogin(nativeEvent.detail);
    };

    const handleNativeLogout = () => void applyNativeLogout();

    const initNativeAuthBridge = () => {
      window.__MindBoatAuthReady = true;
      console.log('🔐 Web: Native Auth Bridge 已初始化');

      if (window.MindBoatNativeAuth) {
        console.log('🔐 Web: 发现已设置的登录态，立即处理');
        void applyNativeLogin(window.MindBoatNativeAuth);
      } else {
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

  // ==========================================
  // Session 恢复
  // ==========================================

  useEffect(() => {
    checkLoginState();

    const client = supabase;
    if (!client) return;

    const restoreSession = async () => {
      const stored = batchGetLocalStorage(['session_token', 'refresh_token', 'user_id', NATIVE_LOGIN_FLAG_KEY] as const);
      const hasNativeAuth = stored[NATIVE_LOGIN_FLAG_KEY] === 'true' && !!stored['user_id'];
      const storedAccessToken = stored['session_token'];
      const storedRefreshToken = stored['refresh_token'];

      const { data: { session } } = await client.auth.getSession();

      if (session) {
        console.log('✅ Supabase session restored:', session.user.email);
        persistSessionToStorage(session);
        await syncUserProfileToStorage(client, session.user.id);
        bindAnalyticsUser(session.user.id, session.user.email);
        checkLoginState();
        notifyAuthConfirmed('existing_session');
        return;
      }

      console.log('⚠️ No Supabase session found');

      if (storedAccessToken && storedRefreshToken) {
        const { data: restoredSession, error } = await client.auth.setSession({
          access_token: storedAccessToken,
          refresh_token: storedRefreshToken,
        });

        if (error) {
          console.error('❌ Failed to restore Supabase session', error);
          clearAuthStorage();
          setAuthState(readAuthFromStorage());
          return;
        }

        if (restoredSession.session) {
          persistSessionToStorage(restoredSession.session);
          await syncUserProfileToStorage(client, restoredSession.session.user.id);
          bindAnalyticsUser(restoredSession.session.user.id, restoredSession.session.user.email);
          checkLoginState();
          notifyAuthConfirmed('restored_session');
        } else {
          console.warn('⚠️ Stored tokens invalid, clearing local auth state');
          clearAuthStorage();
          setAuthState(readAuthFromStorage());
        }
      } else {
        if (hasNativeAuth) {
          setAuthState(readAuthFromStorage());
        } else {
          clearAuthStorage();
          setAuthState(readAuthFromStorage());
        }
      }
    };

    const scheduleRestore = () => {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(() => void restoreSession(), { timeout: 2000 });
      } else {
        setTimeout(() => void restoreSession(), 0);
      }
    };

    scheduleRestore();

    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state changed:', event);
      if (session) {
        persistSessionToStorage(session);
        bindAnalyticsUser(session.user.id, session.user.email);
        checkLoginState();
      } else if (event === 'SIGNED_OUT') {
        clearAuthStorage();
        resetAnalyticsUser();
        checkLoginState();
      }
    });

    return () => { subscription.unsubscribe(); };
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

  // ==========================================
  // Context Value
  // ==========================================

  const contextValue = useMemo<AuthContextValue>(() => ({
    ...authState,
    isOAuthProcessing,
    checkLoginState,
    navigateToLogin,
    loginWithEmail,
    signupWithEmail,
    authWithEmail,
    updateProfile,
    logout,
    fullReset,
    markOnboardingCompleted,
  }), [
    authState,
    isOAuthProcessing,
    checkLoginState,
    navigateToLogin,
    loginWithEmail,
    signupWithEmail,
    authWithEmail,
    updateProfile,
    logout,
    fullReset,
    markOnboardingCompleted,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
