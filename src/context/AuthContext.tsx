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
  isInNativeWebView,
  notifyNativeLoginSuccess,
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
      // FCM Token 上传相关
      getFcmToken?: () => string;
      uploadFcmToken?: () => void;
      onWebLoginSuccess?: (
        accessToken: string,
        refreshToken: string,
        userId: string,
        email: string,
        displayName: string
      ) => void;
    };
    webkit?: {
      messageHandlers?: {
        userLogin?: { postMessage: (message: unknown) => void };
        userLogout?: { postMessage: (message: unknown) => void };
        authConfirmed?: { postMessage: (message: { success: boolean; reason: string }) => void };
        requestNativeAuth?: { postMessage: (message: Record<string, never>) => void };
        taskChanged?: { postMessage: (message: unknown) => void };
        nativeApp?: { postMessage: (message: unknown) => void };
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
 * 从 localStorage 读取认证状态（仅作为缓存，需通过 Supabase 验证）
 * 注意：isSessionValidated 初始为 false，需通过 validateSessionWithSupabase 验证后才为 true
 */
function readAuthFromStorage(): AuthState {
  const stored = batchGetLocalStorage(AUTH_STORAGE_KEYS);

  const sessionToken = stored['session_token'];
  const userId = stored['user_id'];
  const isNativeLogin = stored[NATIVE_LOGIN_FLAG_KEY] === 'true';
  // 初始状态：根据 localStorage 判断，但标记为未验证
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
    isSessionValidated: false, // 初始未验证，需通过 Supabase 确认
    hasCompletedHabitOnboarding: false, // 从数据库查询后更新
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

/**
 * 以 Supabase Auth 为权威来源验证会话
 * 解决 localStorage 与 Supabase 状态不一致的问题
 *
 * 验证逻辑：
 * 1. 优先使用 Supabase getSession() 的结果
 * 2. 如果 Supabase 没有 session 但 localStorage 有 token，尝试恢复
 * 3. 恢复失败则清除 localStorage（以 Supabase 为准）
 * 4. Native 登录是特殊情况，允许没有 Supabase session
 */
async function validateSessionWithSupabase(): Promise<AuthState> {
  if (!supabase) {
    // 无 Supabase 客户端，直接返回 localStorage 状态（标记为已验证以避免阻塞）
    const state = readAuthFromStorage();
    return { ...state, isSessionValidated: true };
  }

  const stored = batchGetLocalStorage(AUTH_STORAGE_KEYS);
  const isNativeLogin = stored[NATIVE_LOGIN_FLAG_KEY] === 'true';
  const storedUserId = stored['user_id'];

  // 1. 获取 Supabase 当前会话状态（这是权威来源）
  const { data: { session }, error } = await supabase.auth.getSession();

  if (error) {
    console.warn('⚠️ 获取 Supabase session 失败:', error.message);
  }

  // 2. Supabase 有有效会话 -> 以 Supabase 为准，同步到 localStorage
  if (session) {
    console.log('✅ Supabase session 有效:', session.user.email);
    persistSessionToStorage(session);

    // 查询用户的 habit onboarding 状态
    let hasCompletedHabitOnboarding = false;
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('has_completed_habit_onboarding')
        .eq('id', session.user.id)
        .single();
      hasCompletedHabitOnboarding = userData?.has_completed_habit_onboarding ?? false;
    } catch (err) {
      console.warn('⚠️ 获取 habit onboarding 状态失败:', err);
    }

    return {
      isLoggedIn: true,
      userId: session.user.id,
      userEmail: session.user.email || null,
      userName: session.user.user_metadata?.full_name || stored['user_name'] || null,
      userPicture: session.user.user_metadata?.avatar_url || stored['user_picture'] || null,
      isNewUser: stored['is_new_user'] === 'true',
      sessionToken: session.access_token,
      refreshToken: session.refresh_token || null,
      isNativeLogin: false,
      isSessionValidated: true,
      hasCompletedHabitOnboarding,
    };
  }

  // 3. Supabase 没有会话，但 localStorage 有 token -> 尝试恢复
  const storedAccessToken = stored['session_token'];
  const storedRefreshToken = stored['refresh_token'];

  if (storedAccessToken && storedRefreshToken) {
    console.log('🔄 尝试用 localStorage token 恢复 Supabase session...');
    try {
      const { data: restored, error: restoreError } = await supabase.auth.setSession({
        access_token: storedAccessToken,
        refresh_token: storedRefreshToken,
      });

      if (restoreError) {
        console.warn('⚠️ localStorage token 无效:', restoreError.message);
        // Token 无效，清除 localStorage（以 Supabase 为准）
        clearAuthStorage();
        // 在 WebView 环境中通知 Native 端 session 失效
        if (isInNativeWebView()) {
          console.log('📱 Session 验证失败，通知 Native 端');
          notifyNativeLogout();
        }
        return {
          isLoggedIn: false,
          userId: null,
          userEmail: null,
          userName: null,
          userPicture: null,
          isNewUser: false,
          sessionToken: null,
          refreshToken: null,
          isNativeLogin: false,
          isSessionValidated: true,
          hasCompletedHabitOnboarding: false,
        };
      }

      if (restored.session) {
        console.log('✅ 成功用 localStorage token 恢复 session:', restored.session.user.email);
        persistSessionToStorage(restored.session);

        // 查询用户的 habit onboarding 状态
        let hasCompletedHabitOnboarding = false;
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('has_completed_habit_onboarding')
            .eq('id', restored.session.user.id)
            .single();
          hasCompletedHabitOnboarding = userData?.has_completed_habit_onboarding ?? false;
        } catch (err) {
          console.warn('⚠️ 获取 habit onboarding 状态失败:', err);
        }

        return {
          isLoggedIn: true,
          userId: restored.session.user.id,
          userEmail: restored.session.user.email || null,
          userName: restored.session.user.user_metadata?.full_name || stored['user_name'] || null,
          userPicture: restored.session.user.user_metadata?.avatar_url || stored['user_picture'] || null,
          isNewUser: stored['is_new_user'] === 'true',
          sessionToken: restored.session.access_token,
          refreshToken: restored.session.refresh_token || null,
          isNativeLogin: false,
          isSessionValidated: true,
          hasCompletedHabitOnboarding,
        };
      }
    } catch (err) {
      console.error('❌ 恢复 session 时发生错误:', err);
    }

    // 恢复失败，清除 localStorage
    console.warn('⚠️ 无法恢复 session，清除本地认证状态');
    clearAuthStorage();
    // 在 WebView 环境中通知 Native 端
    if (isInNativeWebView()) {
      console.log('📱 Session 恢复失败，通知 Native 端');
      notifyNativeLogout();
    }
  }

  // 4. Native 登录特殊处理：允许没有 Supabase session
  if (isNativeLogin && storedUserId) {
    console.log('📱 Native 登录模式，使用 localStorage 状态');

    // 查询用户的 habit onboarding 状态
    let hasCompletedHabitOnboarding = false;
    try {
      const { data: userData } = await supabase
        .from('users')
        .select('has_completed_habit_onboarding')
        .eq('id', storedUserId)
        .single();
      hasCompletedHabitOnboarding = userData?.has_completed_habit_onboarding ?? false;
    } catch (err) {
      console.warn('⚠️ 获取 habit onboarding 状态失败:', err);
    }

    return {
      isLoggedIn: true,
      userId: storedUserId,
      userEmail: stored['user_email'],
      userName: stored['user_name'],
      userPicture: stored['user_picture'],
      isNewUser: stored['is_new_user'] === 'true',
      sessionToken: stored['session_token'],
      refreshToken: stored['refresh_token'],
      isNativeLogin: true,
      isSessionValidated: true,
      hasCompletedHabitOnboarding,
    };
  }

  // 5. 没有任何有效会话
  // 注意：这里不通知 Native，因为可能是首次加载（localStorage 本来就没有数据）
  // 只有在 localStorage 有数据但验证失败时才需要通知
  return {
    isLoggedIn: false,
    userId: null,
    userEmail: null,
    userName: null,
    userPicture: null,
    isNewUser: false,
    sessionToken: null,
    refreshToken: null,
    isNativeLogin: false,
    isSessionValidated: true,
    hasCompletedHabitOnboarding: false,
  };
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
    // 保留当前的验证状态，避免覆盖已验证的状态
    setAuthState(prev => ({
      ...latest,
      isSessionValidated: prev.isSessionValidated,
    }));
    return {
      isLoggedIn: latest.isLoggedIn,
      userId: latest.userId,
      sessionToken: latest.sessionToken,
    };
  }, []);

  const navigateToLogin = useCallback((redirectPath?: string) => {
    // 在 WebView 环境中，通知 Native 端回到原生登录页
    if (isInNativeWebView()) {
      console.log('📱 WebView 环境，通知 Native 端跳转到原生登录页');
      notifyNativeLogout();
      return;
    }

    // 非 WebView 环境，使用网页端登录页
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

      // 查询用户的 habit onboarding 状态
      let hasCompletedHabitOnboarding = false;
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('has_completed_habit_onboarding')
          .eq('id', data.user.id)
          .single();
        hasCompletedHabitOnboarding = userData?.has_completed_habit_onboarding ?? false;
      } catch (err) {
        console.warn('⚠️ 获取 habit onboarding 状态失败:', err);
      }

      // 登录成功后，设置验证状态为 true（Supabase 已确认）
      setAuthState(prev => ({
        ...prev,
        isLoggedIn: true,
        userId: data.user.id,
        userEmail: data.user.email || null,
        userName: userName || null,
        userPicture: userPicture || null,
        sessionToken: data.session.access_token,
        refreshToken: data.session.refresh_token || null,
        isNewUser: false,
        isNativeLogin: false,
        isSessionValidated: true,
        hasCompletedHabitOnboarding,
      }));
      return { error: null };
    }

    return { error: 'Login failed' };
  }, []);

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

      // 提取变量以解决 TypeScript 类型推断问题
      const { user, session } = data;
      bindAnalyticsUser(user.id, user.email);
      // 注册成功后，设置验证状态为 true（Supabase 已确认）
      // 新用户默认未完成习惯引导
      setAuthState(prev => ({
        ...prev,
        isLoggedIn: true,
        userId: user.id,
        userEmail: user.email || null,
        userName: fullName || user.user_metadata?.full_name || null,
        sessionToken: session.access_token,
        refreshToken: session.refresh_token || null,
        isNewUser: true,
        isNativeLogin: false,
        isSessionValidated: true,
        hasCompletedHabitOnboarding: false,
      }));
    }

    return { error: null, data };
  }, []);

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
      // 清理 VoIP 设备（忽略失败，不阻塞登出流程）
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
          else console.warn('⚠️ 清理 VoIP 设备记录失败（已忽略）');
        } catch (error) {
          console.warn('⚠️ 清理 VoIP 设备记录时出错（已忽略）:', error);
        }
      }

      // 尝试调用 Supabase signOut，但不管成功与否都继续清理
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (error) {
        console.warn('⚠️ Supabase signOut 失败（已忽略），将强制清理本地状态:', error);
      }
    }

    // 强制清理所有本地存储（不管 signOut 是否成功）
    localStorage.removeItem('voip_token');
    clearAuthStorage();

    // 清理 Supabase SDK 自己存储的 session（以 sb- 开头的 key）
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.startsWith('supabase'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log(`🗑️ 已清理 Supabase 存储: ${key}`);
    });

    if (import.meta.env.DEV) console.log('🔓 已登出');

    notifyNativeLogout();
    resetAnalyticsUser();
    // 登出后，设置已验证的登出状态
    setAuthState({
      isLoggedIn: false,
      userId: null,
      userEmail: null,
      userName: null,
      userPicture: null,
      isNewUser: false,
      sessionToken: null,
      refreshToken: null,
      isNativeLogin: false,
      isSessionValidated: true,
      hasCompletedHabitOnboarding: false,
    });
  }, []);

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
    // 完全重置后，设置已验证的登出状态
    setAuthState({
      isLoggedIn: false,
      userId: null,
      userEmail: null,
      userName: null,
      userPicture: null,
      isNewUser: false,
      sessionToken: null,
      refreshToken: null,
      isNativeLogin: false,
      isSessionValidated: true,
      hasCompletedHabitOnboarding: false,
    });
  }, []);

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

  const markHabitOnboardingCompleted = useCallback(async (): Promise<{ error: string | null }> => {
    if (!supabase) return { error: 'Supabase client not initialized' };

    const userId = authState.userId;
    if (!userId) return { error: 'User not logged in' };

    try {
      const { error } = await supabase
        .from('users')
        .update({ has_completed_habit_onboarding: true })
        .eq('id', userId);

      if (error) {
        console.error('❌ 更新 habit onboarding 状态失败:', error);
        return { error: error.message };
      }

      console.log('✅ Habit onboarding 状态已更新');
      setAuthState(prev => ({
        ...prev,
        hasCompletedHabitOnboarding: true,
      }));
      return { error: null };
    } catch (err) {
      console.error('❌ 更新 habit onboarding 状态时出错:', err);
      return { error: String(err) };
    }
  }, [authState.userId]);

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
    let finalUserName = userName;
    let finalPictureUrl = pictureUrl;
    if (supabase && (!userName || !pictureUrl)) {
      await syncUserProfileToStorage(supabase, userId);
      finalUserName = localStorage.getItem('user_name') || userName;
      finalPictureUrl = localStorage.getItem('user_picture') || pictureUrl;
    }

    // 查询用户的 habit onboarding 状态
    let hasCompletedHabitOnboarding = false;
    if (supabase) {
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('has_completed_habit_onboarding')
          .eq('id', userId)
          .single();
        hasCompletedHabitOnboarding = userData?.has_completed_habit_onboarding ?? false;
      } catch (err) {
        console.warn('⚠️ 获取 habit onboarding 状态失败:', err);
      }
    }

    await bindAnalyticsUserSync(userId, email);
    // Native 登录成功后，设置验证状态为 true
    setAuthState({
      isLoggedIn: true,
      userId,
      userEmail: email || null,
      userName: finalUserName || null,
      userPicture: finalPictureUrl || null,
      isNewUser: false,
      sessionToken: accessToken || null,
      refreshToken: refreshToken || null,
      isNativeLogin: true,
      isSessionValidated: true,
      hasCompletedHabitOnboarding,
    });
    notifyAuthConfirmed('session_set');
    console.log('🔐 Web: 登录态设置成功, userId:', userId);
  }, []);

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
  // Session 恢复（以 Supabase 为权威来源）
  // ==========================================

  useEffect(() => {
    const client = supabase;
    if (!client) return;

    /**
     * 使用 validateSessionWithSupabase 验证并恢复会话
     * 解决了 localStorage 与 Supabase 状态不一致的问题
     */
    const restoreSession = async () => {
      // 1. 以 Supabase 为权威来源验证会话
      const validatedState = await validateSessionWithSupabase();
      setAuthState(validatedState);

      // 2. 如果验证后有有效会话，同步用户资料并绑定分析
      if (validatedState.isLoggedIn && validatedState.userId) {
        await syncUserProfileToStorage(client, validatedState.userId);
        bindAnalyticsUser(validatedState.userId, validatedState.userEmail);
        notifyAuthConfirmed(validatedState.isNativeLogin ? 'native_session' : 'validated_session');
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

    // 监听 Supabase Auth 状态变化（这是权威来源）
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state changed:', event);
      if (session) {
        // Supabase 通知有有效 session，同步到 localStorage 并更新状态
        persistSessionToStorage(session);
        bindAnalyticsUser(session.user.id, session.user.email);
        setAuthState(prev => ({
          ...prev,
          isLoggedIn: true,
          userId: session.user.id,
          userEmail: session.user.email || null,
          sessionToken: session.access_token,
          refreshToken: session.refresh_token || null,
          isNativeLogin: false,
          isSessionValidated: true, // Supabase 确认的会话
        }));

        // 通知原生端登录成功，以便上传 FCM Token
        const displayName = session.user.user_metadata?.full_name
          || session.user.user_metadata?.name
          || session.user.email
          || '';
        notifyNativeLoginSuccess(
          session.access_token,
          session.refresh_token || '',
          session.user.id,
          session.user.email || '',
          displayName
        );
      } else if (event === 'SIGNED_OUT') {
        // Supabase 通知已登出，清除 localStorage 并更新状态
        clearAuthStorage();
        resetAnalyticsUser();
        setAuthState({
          isLoggedIn: false,
          userId: null,
          userEmail: null,
          userName: null,
          userPicture: null,
          isNewUser: false,
          sessionToken: null,
          refreshToken: null,
          isNativeLogin: false,
          isSessionValidated: true, // 已验证：确定是登出状态
          hasCompletedHabitOnboarding: false,
        });
      }
    });

    return () => { subscription.unsubscribe(); };
  }, [checkLoginState]);

  // 监听其他标签页的登录状态变化
  useEffect(() => {
    const handleStorage = async (event: StorageEvent) => {
      if (!event.key || event.key === 'session_token' || event.key === 'user_id' || event.key === NATIVE_LOGIN_FLAG_KEY) {
        // 其他标签页可能修改了 localStorage，重新验证会话
        const validatedState = await validateSessionWithSupabase();
        setAuthState(validatedState);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

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
    markHabitOnboardingCompleted,
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
    markHabitOnboardingCompleted,
    markOnboardingCompleted,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
