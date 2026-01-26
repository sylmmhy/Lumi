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
      // Permission-related methods (from PermissionsStep)
      isAndroid?: () => boolean;
      hasNotificationPermission?: () => boolean;
      hasMicrophonePermission?: () => boolean;
      hasCameraPermission?: () => boolean;
      requestNotificationPermission?: () => void;
      requestMicrophonePermission?: () => void;
      requestCameraPermission?: () => void;
      openAppSettings?: () => void;
      // Task-related methods
      onTaskCreated?: (taskJson: string) => void;
      cancelTaskReminder?: (taskId: string) => void;
      logMessage?: (message: string) => void;
      // Auth-related methods
      logout?: () => void;
      triggerGoogleSignIn?: () => void;
      isLoggedIn?: () => boolean;
      getUserInfo?: () => string;
      getIdToken?: () => string;
      // FCM Token 上传相关
      getFcmToken?: () => string;
      uploadFcmToken?: () => void;
      // Ringtone settings
      setRingtoneType?: (type: string) => void;
      getRingtoneType?: () => string;
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
        // Permission-related handlers (iOS WebView)
        requestNotificationPermission?: { postMessage: (message: unknown) => void };
        requestMicrophonePermission?: { postMessage: (message: unknown) => void };
        requestCameraPermission?: { postMessage: (message: unknown) => void };
        hasNotificationPermission?: { postMessage: (message: unknown) => void };
        hasMicrophonePermission?: { postMessage: (message: unknown) => void };
        hasCameraPermission?: { postMessage: (message: unknown) => void };
        openAppSettings?: { postMessage: (message: unknown) => void };
        openSleepFocusSettings?: { postMessage: (message: unknown) => void };
        // Onboarding-related handlers (iOS WebView)
        onboardingCompleted?: { postMessage: (message: Record<string, never>) => void };
        // Ringtone settings
        setRingtoneType?: { postMessage: (message: { type: string }) => void };
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
 * 判断错误是否是网络相关错误（而非 token 真正失效）
 * 网络错误时不应强制登出，应保留本地状态等待重试
 */
function isNetworkError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = (error.code || '').toLowerCase();

  // 网络相关错误关键词
  const networkErrorPatterns = [
    'network',
    'fetch',
    'timeout',
    'econnrefused',
    'enotfound',
    'connection',
    'offline',
    'internet',
    'dns',
    'socket',
    'abort',
    'etimedout',
    'econnreset',
  ];

  return networkErrorPatterns.some(pattern => msg.includes(pattern) || code.includes(pattern));
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
// DEV BACKDOOR: Test account user ID (q@q.com)
const DEV_TEST_USER_ID = '31d5da79-2cfc-445d-9543-eefc5b8d31d7';

async function validateSessionWithSupabase(): Promise<AuthState> {
  if (!supabase) {
    // 无 Supabase 客户端，直接返回 localStorage 状态（标记为已验证以避免阻塞）
    const state = readAuthFromStorage();
    return { ...state, isSessionValidated: true };
  }

  const stored = batchGetLocalStorage(AUTH_STORAGE_KEYS);
  const isNativeLogin = stored[NATIVE_LOGIN_FLAG_KEY] === 'true';
  const storedUserId = stored['user_id'];

  // DEV BACKDOOR: Skip validation for test account
  if (storedUserId === DEV_TEST_USER_ID) {
    console.log('🔓 Dev backdoor: skipping session validation for test account');
    return {
      isLoggedIn: true,
      userId: storedUserId,
      userEmail: stored['user_email'],
      userName: stored['user_name'] || 'Test User',
      userPicture: stored['user_picture'],
      isNewUser: false,
      sessionToken: null,
      refreshToken: null,
      isNativeLogin: false,
      isSessionValidated: true,
      hasCompletedHabitOnboarding: true,
    };
  }

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
      // 优先使用用户自己设置的名字（localStorage），再用 OAuth 的名字
      userName: stored['user_name'] || session.user.user_metadata?.full_name || null,
      // 优先使用用户自己设置的头像（localStorage），再用 OAuth 的头像
      userPicture: stored['user_picture'] || session.user.user_metadata?.avatar_url || null,
      isNewUser: stored['is_new_user'] === 'true',
      sessionToken: session.access_token,
      refreshToken: session.refresh_token || null,
      isNativeLogin: false,
      isSessionValidated: true,
      hasCompletedHabitOnboarding,
    };
  }

  // 3. Supabase 没有会话，但 localStorage 有 token -> 尝试恢复（带重试机制）
  const storedAccessToken = stored['session_token'];
  const storedRefreshToken = stored['refresh_token'];

  if (storedAccessToken && storedRefreshToken) {
    console.log('🔄 尝试用 localStorage token 恢复 Supabase session...');

    // P0 修复：添加重试机制，避免临时错误导致过早登出
    const MAX_RETRY_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 1000;

    for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const { data: restored, error: restoreError } = await supabase.auth.setSession({
          access_token: storedAccessToken,
          refresh_token: storedRefreshToken,
        });

        if (restoreError) {
          // 区分网络错误和 token 真正失效
          if (isNetworkError(restoreError)) {
            // 网络错误：保留本地状态，不强制登出
            // 用户可能只是暂时断网，等网络恢复后再验证
            console.warn(`⚠️ 网络错误 (尝试 ${attempt}/${MAX_RETRY_ATTEMPTS})，保留本地登录状态:`, restoreError.message);

            // 如果不是最后一次尝试，等待后重试
            if (attempt < MAX_RETRY_ATTEMPTS) {
              await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
              continue;
            }

            return {
              isLoggedIn: true,
              userId: stored['user_id'],
              userEmail: stored['user_email'],
              userName: stored['user_name'],
              userPicture: stored['user_picture'],
              isNewUser: stored['is_new_user'] === 'true',
              sessionToken: storedAccessToken,
              refreshToken: storedRefreshToken,
              isNativeLogin,
              isSessionValidated: false, // 标记为未验证，下次有网络时再验证
              hasCompletedHabitOnboarding: false,
            };
          }

          // 检查是否是可重试的临时错误（如服务器暂时不可用）
          const isRetryableError = restoreError.message?.toLowerCase().includes('temporarily') ||
            restoreError.message?.toLowerCase().includes('unavailable') ||
            restoreError.message?.toLowerCase().includes('500') ||
            restoreError.message?.toLowerCase().includes('502') ||
            restoreError.message?.toLowerCase().includes('503') ||
            restoreError.message?.toLowerCase().includes('504');

          if (isRetryableError && attempt < MAX_RETRY_ATTEMPTS) {
            console.warn(`⚠️ 临时错误 (尝试 ${attempt}/${MAX_RETRY_ATTEMPTS})，将重试:`, restoreError.message);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
            continue;
          }

          // Token 真正失效（如已被撤销、过期等）
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
            // 优先使用用户自己设置的名字（localStorage），再用 OAuth 的名字
            userName: stored['user_name'] || restored.session.user.user_metadata?.full_name || null,
            // 优先使用用户自己设置的头像（localStorage），再用 OAuth 的头像
            userPicture: stored['user_picture'] || restored.session.user.user_metadata?.avatar_url || null,
            isNewUser: stored['is_new_user'] === 'true',
            sessionToken: restored.session.access_token,
            refreshToken: restored.session.refresh_token || null,
            isNativeLogin: false,
            isSessionValidated: true,
            hasCompletedHabitOnboarding,
          };
        }
      } catch (err) {
        console.error(`❌ 恢复 session 时发生错误 (尝试 ${attempt}/${MAX_RETRY_ATTEMPTS}):`, err);
        // 检查是否是网络错误
        const errorObj = err as { message?: string; code?: string };
        if (isNetworkError(errorObj)) {
          console.warn('⚠️ 网络错误，保留本地登录状态');

          // 如果不是最后一次尝试，等待后重试
          if (attempt < MAX_RETRY_ATTEMPTS) {
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
            continue;
          }

          return {
            isLoggedIn: true,
            userId: stored['user_id'],
            userEmail: stored['user_email'],
            userName: stored['user_name'],
            userPicture: stored['user_picture'],
            isNewUser: stored['is_new_user'] === 'true',
            sessionToken: storedAccessToken,
            refreshToken: storedRefreshToken,
            isNativeLogin,
            isSessionValidated: false, // 标记为未验证，下次有网络时再验证
            hasCompletedHabitOnboarding: false,
          };
        }

        // 非网络错误，如果不是最后一次尝试，等待后重试
        if (attempt < MAX_RETRY_ATTEMPTS) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
          continue;
        }
      }
    }

    // 所有重试都失败且非网络错误，清除 localStorage
    console.warn('⚠️ 多次尝试后仍无法恢复 session，清除本地认证状态');
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
  // 用于追踪 onAuthStateChange 是否正在处理会话
  // 防止 restoreSession 覆盖 onAuthStateChange 正在处理的状态
  const isOnAuthStateChangeProcessingRef = useRef(false);
  // 用于防止 applyNativeLogin 被多次调用（Android 注入两次的问题）
  const isApplyingNativeLoginRef = useRef(false);
  /**
   * 标记是否已处理过原生登录事件或原生登录态。
   * 原理：用于补偿检查，避免事件丢失时重复触发 applyNativeLogin。
   */
  const hasHandledNativeLoginRef = useRef(false);
  /**
   * 记录最近一次原生登录开始时间（时间戳）。
   * 原理：restoreSession 可能在 Supabase 会话尚未同步时返回空登录态，
   * 通过短时间窗口保护避免覆盖原生登录刚写入的状态。
   */
  const lastNativeLoginStartedAtRef = useRef<number | null>(null);
  // 追踪 setSession 是否成功触发了 onAuthStateChange
  const setSessionTriggeredAuthChangeRef = useRef(false);

  useEffect(() => { loginPathRef.current = loginPath; }, [loginPath]);
  useEffect(() => { defaultRedirectRef.current = defaultRedirectPath; }, [defaultRedirectPath]);

  // ==========================================
  // 核心状态管理
  // ==========================================

  /**
   * 同步 localStorage 的登录态，并在需要时刷新习惯引导完成状态。
   *
   * 原理：
   * - OAuth/OTP 登录会先写入 localStorage，但不会立刻查询 has_completed_habit_onboarding。
   * - 这里检测到登录态后补一次 Supabase 查询，避免 hasCompletedHabitOnboarding 被错误置为 false。
   * - 查询完成后再把 isSessionValidated 置为 true，防止未确认前跳转到引导页。
   *
   * @returns {{ isLoggedIn: boolean; userId: string | null; sessionToken: string | null }} 本地缓存的基础登录态
   */
  const checkLoginState = useCallback(() => {
    const latest = readAuthFromStorage();
    setAuthState(prev => {
      const isSameUser = Boolean(prev.userId && latest.userId && prev.userId === latest.userId);
      const canRevalidate = Boolean(supabase && latest.isLoggedIn && latest.userId);
      const shouldRevalidate = canRevalidate && (!isSameUser || !prev.hasCompletedHabitOnboarding);

      return {
        ...latest,
        isSessionValidated: shouldRevalidate ? false : prev.isSessionValidated,
        hasCompletedHabitOnboarding: isSameUser ? prev.hasCompletedHabitOnboarding : false,
      };
    });

    if (supabase && latest.isLoggedIn && latest.userId) {
      void (async () => {
        let fetchedHasCompletedHabitOnboarding: boolean | null = null;
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('has_completed_habit_onboarding')
            .eq('id', latest.userId)
            .single();
          fetchedHasCompletedHabitOnboarding = userData?.has_completed_habit_onboarding ?? false;
        } catch (err) {
          console.warn('⚠️ 获取 habit onboarding 状态失败:', err);
        }

        setAuthState(prev => {
          if (prev.userId !== latest.userId) return prev;
          return {
            ...prev,
            hasCompletedHabitOnboarding: fetchedHasCompletedHabitOnboarding ?? prev.hasCompletedHabitOnboarding,
            isSessionValidated: true,
          };
        });
      })();
    }

    return {
      isLoggedIn: latest.isLoggedIn,
      userId: latest.userId,
      sessionToken: latest.sessionToken,
    };
  }, []);

  /**
   * 立即触发会话检查与修复。
   *
   * 原理：localStorage 有 token 但 Supabase SDK 无 session 时，立即 setSession 恢复会话。
   *
   * @param reason - 触发原因（用于日志定位）
   */
  const triggerSessionCheckNow = useCallback(async (reason?: string): Promise<void> => {
    const client = supabase;
    if (!client) return;

    const checkStartTime = Date.now();
    if (reason) {
      console.log(`🔄 会话检查触发来源: ${reason}`);
    }

    // 只在用户已登录时检查
    const storedAccessToken = localStorage.getItem('session_token');
    const storedRefreshToken = localStorage.getItem('refresh_token');
    const storedUserId = localStorage.getItem('user_id');

    if (!storedUserId || !storedAccessToken) {
      // 用户未登录，不需要检查
      if (reason) {
        console.log(`🔄 会话检查跳过: 未发现登录态 (${reason})`);
      }
      return;
    }

    try {
      // 检查 Supabase SDK 是否有活跃会话
      const getSessionStartTime = Date.now();
      const { data: { session } } = await client.auth.getSession();
      const getSessionDuration = Date.now() - getSessionStartTime;
      if (getSessionDuration > 3000) {
        console.warn(`⚠️ 会话检查: getSession 耗时过长 (${getSessionDuration}ms)`);
      }

      if (!session && storedRefreshToken) {
        // 发现问题：localStorage 有 token 但 Supabase SDK 没有会话
        // 这意味着 autoRefreshToken 不会工作，需要手动恢复
        console.warn('🔄 定期检查：检测到 Supabase 会话丢失，尝试恢复...');
        console.log('🔄 localStorage 有 token，但 Supabase SDK 没有会话');

        try {
          const setSessionStartTime = Date.now();
          const { data, error } = await client.auth.setSession({
            access_token: storedAccessToken,
            refresh_token: storedRefreshToken,
          });
          const setSessionDuration = Date.now() - setSessionStartTime;

          if (error) {
            console.error(`❌ 定期检查：会话恢复失败 (耗时 ${setSessionDuration}ms):`, error.message);
            // 如果是 token 真正失效（不是网络问题），可能需要登出
            if (!isNetworkError(error) &&
                (error.message?.includes('invalid') ||
                 error.message?.includes('expired') ||
                 error.message?.includes('Token'))) {
              console.error('❌ token 已失效，需要重新登录');
              // 不自动登出，让用户下次操作时发现并处理
            }
          } else if (data.session) {
            console.log(`✅ 定期检查：会话恢复成功 (耗时 ${setSessionDuration}ms)，autoRefreshToken 已重新激活`);
            // 更新 localStorage 中的 token
            localStorage.setItem('session_token', data.session.access_token);
            if (data.session.refresh_token) {
              localStorage.setItem('refresh_token', data.session.refresh_token);
            }
          }
        } catch (err) {
          console.error('❌ 定期检查：会话恢复异常:', err);
        }
      } else if (session) {
        // 会话正常，确保 localStorage 与 Supabase 同步
        if (session.access_token !== storedAccessToken) {
          console.log('🔄 定期检查：同步 Supabase session 到 localStorage');
          localStorage.setItem('session_token', session.access_token);
          if (session.refresh_token) {
            localStorage.setItem('refresh_token', session.refresh_token);
          }
        }
      }

      const totalDuration = Date.now() - checkStartTime;
      if (totalDuration > 5000) {
        console.warn(`⚠️ 会话检查总耗时过长: ${totalDuration}ms (来源: ${reason})`);
      }
    } catch (err) {
      const totalDuration = Date.now() - checkStartTime;
      console.warn(`⚠️ 定期检查：获取会话状态失败 (耗时 ${totalDuration}ms):`, err);
    }
  }, [supabase]);

  /**
   * 缓存最新的会话检查函数，避免回调闭包引用旧的 Supabase 实例。
   */
  const triggerSessionCheckNowRef = useRef<((reason?: string) => void) | null>(null);

  useEffect(() => {
    triggerSessionCheckNowRef.current = (reason?: string) => {
      void triggerSessionCheckNow(reason);
    };
    return () => {
      triggerSessionCheckNowRef.current = null;
    };
  }, [triggerSessionCheckNow]);

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
          triggerSessionCheckNowRef.current?.('oauth_pkce');
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
          triggerSessionCheckNowRef.current?.('oauth_implicit');
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
      triggerSessionCheckNowRef.current?.('password_login');

      // 获取用户资料：优先使用用户自己设置的名字，再用 OAuth 的名字
      // 先尝试从数据库同步用户资料到 localStorage
      await syncUserProfileToStorage(supabase, data.user.id);
      // 优先使用 localStorage（用户设置的），再用 OAuth 的
      const userName = localStorage.getItem('user_name') || data.user.user_metadata?.full_name || '';
      const userPicture = localStorage.getItem('user_picture') || data.user.user_metadata?.avatar_url || '';

      // 只有在 localStorage 为空时才保存（避免覆盖用户设置的名字）
      if (userName && !localStorage.getItem('user_name')) localStorage.setItem('user_name', userName);
      if (userPicture && !localStorage.getItem('user_picture')) localStorage.setItem('user_picture', userPicture);

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
      triggerSessionCheckNowRef.current?.('signup');

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
  // 邮箱验证码 (OTP) 登录
  // ==========================================

  const sendEmailOtp = useCallback(async (email: string): Promise<{ error: string | null }> => {
    // DEV BACKDOOR: Skip sending OTP for test account (q@q.com + 123456)
    // This is for internal testing purposes only and will be removed before production release
    if (email === 'q@q.com') {
      console.log('🔓 Dev backdoor: skipping OTP send');
      return { error: null };
    }

    if (!supabase) return { error: 'Supabase client not initialized' };

    try {
      // 构建 Magic Link 的回调 URL
      // 使用当前页面的 origin，确保用户点击链接后能正确回到应用
      const redirectTo = `${window.location.origin}${defaultRedirectRef.current || DEFAULT_APP_PATH}`;
      console.log('📧 Magic Link 回调 URL:', redirectTo);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
          // 设置 Magic Link 点击后的重定向 URL
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        console.error('❌ 发送验证码失败:', error);
        return { error: error.message };
      }

      console.log('✅ Magic Link 已发送到:', email);
      return { error: null };
    } catch (err) {
      console.error('❌ 发送验证码时出错:', err);
      return { error: String(err) };
    }
  }, []);

  const verifyEmailOtp = useCallback(async (
    email: string,
    otp: string
  ): Promise<{ error: string | null; isNewUser?: boolean }> => {
    // DEV BACKDOOR: Allow test account login with fixed OTP code
    // Credentials: q@q.com + 123456 - For internal testing only, remove before production
    // Uses real Supabase password login under the hood for full functionality
    if (email === 'q@q.com' && otp === '123456') {
      console.log('🔓 Dev backdoor: using password login for test account');
      if (!supabase) return { error: 'Supabase client not initialized' };

      try {
        // Use real password login (password set in DB: test123456)
        const { data, error: loginError } = await supabase.auth.signInWithPassword({
          email: 'q@q.com',
          password: 'test123456',
        });

        if (loginError) {
          console.error('❌ Dev backdoor login failed:', loginError);
          return { error: loginError.message };
        }

        if (data.session && data.user) {
          localStorage.setItem('session_token', data.session.access_token);
          if (data.session.refresh_token) localStorage.setItem('refresh_token', data.session.refresh_token);
          localStorage.setItem('user_id', data.user.id);
          localStorage.setItem('user_email', data.user.email || '');
          localStorage.setItem('is_new_user', 'false');
          localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
          triggerSessionCheckNowRef.current?.('otp_backdoor');

          console.log('✅ Dev backdoor: login successful');

          // 查询 habit onboarding 状态
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

          setAuthState(prev => ({
            ...prev,
            isLoggedIn: true,
            userId: data.user.id,
            userEmail: data.user.email || null,
            userName: data.user.user_metadata?.full_name || 'Test User',
            userPicture: data.user.user_metadata?.avatar_url || null,
            sessionToken: data.session.access_token,
            refreshToken: data.session.refresh_token || null,
            isNewUser: false,
            isNativeLogin: false,
            isSessionValidated: true,
            hasCompletedHabitOnboarding,
          }));

          return { error: null, isNewUser: false };
        }

        return { error: 'Login failed' };
      } catch (err) {
        console.error('❌ Dev backdoor error:', err);
        return { error: String(err) };
      }
    }

    if (!supabase) return { error: 'Supabase client not initialized' };

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });

      if (error) {
        console.error('❌ 验证码验证失败:', error);
        return { error: error.message };
      }

      const { session, user } = data;
      if (session && user) {
        localStorage.setItem('session_token', session.access_token);
        if (session.refresh_token) localStorage.setItem('refresh_token', session.refresh_token);
        localStorage.setItem('user_id', user.id);
        localStorage.setItem('user_email', user.email || '');
        localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
        triggerSessionCheckNowRef.current?.('otp_verify');

        // 检查是否是新用户（通过 created_at 和当前时间对比）
        const createdAt = new Date(user.created_at);
        const now = new Date();
        const isNewUser = (now.getTime() - createdAt.getTime()) < 60000; // 1分钟内创建的视为新用户
        localStorage.setItem('is_new_user', isNewUser ? 'true' : 'false');

        // 获取用户资料：优先使用用户自己设置的名字，再用 OAuth 的名字
        // 先尝试从数据库同步用户资料到 localStorage
        await syncUserProfileToStorage(supabase, user.id);
        // 优先使用 localStorage（用户设置的），再用 OAuth 的
        const userName = localStorage.getItem('user_name') || user.user_metadata?.full_name || '';
        const userPicture = localStorage.getItem('user_picture') || user.user_metadata?.avatar_url || '';

        // 只有在 localStorage 为空时才保存（避免覆盖用户设置的名字）
        if (userName && !localStorage.getItem('user_name')) localStorage.setItem('user_name', userName);
        if (userPicture && !localStorage.getItem('user_picture')) localStorage.setItem('user_picture', userPicture);

        console.log('✅ OTP 登录成功:', user.email);
        await bindAnalyticsUserSync(user.id, user.email);

        // 查询用户的 habit onboarding 状态
        let hasCompletedHabitOnboarding = false;
        try {
          const { data: userData } = await supabase
            .from('users')
            .select('has_completed_habit_onboarding')
            .eq('id', user.id)
            .single();
          hasCompletedHabitOnboarding = userData?.has_completed_habit_onboarding ?? false;
        } catch (err) {
          console.warn('⚠️ 获取 habit onboarding 状态失败:', err);
        }

        // 登录成功后，设置验证状态为 true（Supabase 已确认）
        setAuthState(prev => ({
          ...prev,
          isLoggedIn: true,
          userId: user.id,
          userEmail: user.email || null,
          userName: userName || null,
          userPicture: userPicture || null,
          sessionToken: session.access_token,
          refreshToken: session.refresh_token || null,
          isNewUser,
          isNativeLogin: false,
          isSessionValidated: true,
          hasCompletedHabitOnboarding,
        }));

        return { error: null, isNewUser };
      }

      return { error: 'Verification failed' };
    } catch (err) {
      console.error('❌ 验证码验证时出错:', err);
      return { error: String(err) };
    }
  }, []);

  // ==========================================
  // 登出
  // ==========================================

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem('session_token');

    if (supabase) {
      // 🔴 修复：同时清理 VoIP 和 FCM 设备，防止退出后仍收到提醒
      if (currentToken) {
        const deviceCleanupPromises = [
          // 清理 VoIP 设备 (iOS)
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user-devices`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentToken}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ action: 'remove_voip_device' }),
          }).then(res => {
            if (res.ok) console.log('✅ VoIP 设备记录已清理');
            else console.warn('⚠️ 清理 VoIP 设备记录失败（已忽略）');
          }).catch(err => {
            console.warn('⚠️ 清理 VoIP 设备记录时出错（已忽略）:', err);
          }),
          // 清理 FCM 设备 (Android)
          fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-user-devices`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${currentToken}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ action: 'remove_fcm_device' }),
          }).then(res => {
            if (res.ok) console.log('✅ FCM 设备记录已清理');
            else console.warn('⚠️ 清理 FCM 设备记录失败（已忽略）');
          }).catch(err => {
            console.warn('⚠️ 清理 FCM 设备记录时出错（已忽略）:', err);
          }),
        ];
        // 并行执行，不阻塞登出流程
        await Promise.allSettled(deviceCleanupPromises);
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
  // 删除账户
  // ==========================================

  const deleteAccount = useCallback(async (): Promise<{ error: string | null }> => {
    if (!supabase) return { error: 'Supabase client not initialized' };

    const userId = authState.userId;
    if (!userId) return { error: 'User not logged in' };

    try {
      console.log('🗑️ 开始删除账户:', userId);

      // 1. 删除用户相关的任务数据
      const { error: tasksError } = await supabase
        .from('tasks')
        .delete()
        .eq('user_id', userId);

      if (tasksError) {
        console.warn('⚠️ 删除任务数据失败（可能没有数据）:', tasksError.message);
      }

      // 2. 删除用户在 public.users 表中的数据
      const { error: userError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (userError) {
        console.error('❌ 删除用户数据失败:', userError);
        return { error: userError.message };
      }

      console.log('✅ 用户数据已删除');

      // 3. 登出并清理本地状态
      await logout();

      return { error: null };
    } catch (err) {
      console.error('❌ 删除账户时出错:', err);
      return { error: String(err) };
    }
  }, [authState.userId, logout]);

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

    // 标记已收到并处理原生登录
    hasHandledNativeLoginRef.current = true;

    // 防重入检查：防止 Android 多次注入导致的并发问题
    if (isApplyingNativeLoginRef.current) {
      console.log('🔐 applyNativeLogin: 已在处理中，跳过重复调用');
      return;
    }
    isApplyingNativeLoginRef.current = true;
    lastNativeLoginStartedAtRef.current = Date.now();
    console.log('🔐 applyNativeLogin: 开始处理, userId:', userId);

    if (!isValidSupabaseUuid(userId)) {
      console.warn('⚠️ mindboat:nativeLogin 提供的 userId 不是有效的 Supabase UUID');
    }

    // 标记正在处理认证，防止 restoreSession 覆盖状态
    isOnAuthStateChangeProcessingRef.current = true;
    // 重置 setSession 触发标记
    setSessionTriggeredAuthChangeRef.current = false;

    // 先设置 isSessionValidated: false，防止路由在查询完成前判断跳转
    setAuthState(prev => ({
      ...prev,
      isLoggedIn: true,
      userId,
      userEmail: email || null,
      userName: userName || null,
      userPicture: pictureUrl || null,
      isNewUser: false,
      sessionToken: accessToken || null,
      refreshToken: refreshToken || null,
      isNativeLogin: true,
      isSessionValidated: false, // 关键：先设为 false，等查询完成
      hasCompletedHabitOnboarding: prev.userId === userId ? prev.hasCompletedHabitOnboarding : false,
    }));

    localStorage.setItem('user_id', userId);
    if (email) localStorage.setItem('user_email', email);
    if (userName) localStorage.setItem('user_name', userName);
    if (pictureUrl) localStorage.setItem('user_picture', pictureUrl);
    localStorage.setItem('is_new_user', 'false');
    localStorage.setItem(NATIVE_LOGIN_FLAG_KEY, 'true');

    if (accessToken) localStorage.setItem('session_token', accessToken);
    if (refreshToken) localStorage.setItem('refresh_token', refreshToken);

    // 登录同时触发一次会话检查，避免等待定期检查
    triggerSessionCheckNowRef.current?.('native_login');

    // 追踪 setSession 是否成功（会触发 onAuthStateChange）
    let setSessionSucceeded = false;

    if (supabase && accessToken && refreshToken) {
      // 注意：只验证 accessToken 是否为 JWT 格式
      // Supabase 的 refreshToken 不是 JWT，而是一个短随机字符串（如 "frmsy6zx3efo"）
      // 这是 Supabase 的设计，不是错误
      if (!isValidJwt(accessToken)) {
        console.warn('⚠️ 原生登录提供的 accessToken 不是有效的 JWT，已跳过 Supabase 会话设置');
      } else {
        // 添加重试机制：确保 Supabase 会话成功建立，否则 autoRefreshToken 不会工作
        const MAX_SET_SESSION_RETRIES = 3;
        const SET_SESSION_RETRY_DELAY_MS = 1000;

        for (let attempt = 1; attempt <= MAX_SET_SESSION_RETRIES; attempt++) {
          try {
            console.log(`🔐 applyNativeLogin: 调用 setSession (尝试 ${attempt}/${MAX_SET_SESSION_RETRIES})...`);
            const { data, error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (error) {
              // 检查是否是可重试的错误（网络错误、临时服务器错误）
              const isRetryable = isNetworkError(error) ||
                error.message?.toLowerCase().includes('temporarily') ||
                error.message?.toLowerCase().includes('500') ||
                error.message?.toLowerCase().includes('502') ||
                error.message?.toLowerCase().includes('503') ||
                error.message?.toLowerCase().includes('504');

              if (isRetryable && attempt < MAX_SET_SESSION_RETRIES) {
                console.warn(`⚠️ setSession 临时失败 (尝试 ${attempt}/${MAX_SET_SESSION_RETRIES}):`, error.message);
                await new Promise(resolve => setTimeout(resolve, SET_SESSION_RETRY_DELAY_MS * attempt));
                continue;
              }

              console.error(`❌ setSession 最终失败 (尝试 ${attempt}/${MAX_SET_SESSION_RETRIES}):`, error.message);
              console.error('❌ Supabase 会话未建立，token 自动刷新将不可用！用户可能在 1 小时后被登出。');
              break;
            }

            if (data.session) {
              setSessionSucceeded = true;
              localStorage.setItem('session_token', data.session.access_token);
              if (data.session.refresh_token) localStorage.setItem('refresh_token', data.session.refresh_token);
              localStorage.setItem('user_email', data.session.user.email || email || '');
              console.log('✅ applyNativeLogin: setSession 成功，Supabase 会话已建立，autoRefreshToken 已激活');
              break;
            }
          } catch (err) {
            const errorObj = err as { message?: string; code?: string };
            if (attempt < MAX_SET_SESSION_RETRIES) {
              console.warn(`⚠️ setSession 异常 (尝试 ${attempt}/${MAX_SET_SESSION_RETRIES}):`, errorObj.message);
              await new Promise(resolve => setTimeout(resolve, SET_SESSION_RETRY_DELAY_MS * attempt));
              continue;
            }
            console.error(`❌ setSession 最终异常 (尝试 ${attempt}/${MAX_SET_SESSION_RETRIES}):`, errorObj.message);
          }
        }

        if (!setSessionSucceeded) {
          console.error('❌ 警告：经过多次重试后仍无法建立 Supabase 会话');
          console.error('❌ 这意味着 token 自动刷新不可用，用户将在 access_token 过期后被登出');
        }
      }
    } else if (accessToken && !refreshToken) {
      console.warn('⚠️ 原生登录未提供 refresh_token，Supabase 会话无法自动刷新');
    }

    // 补全用户资料：优先使用用户自己设置的名字（数据库/localStorage），再用原生端传来的（OAuth）
    // 总是先尝试从数据库同步，确保获取用户设置的名字
    if (supabase) {
      await syncUserProfileToStorage(supabase, userId);
    }
    // 优先使用 localStorage（用户设置的），再用原生端传来的（OAuth）
    const finalUserName = localStorage.getItem('user_name') || userName;
    const finalPictureUrl = localStorage.getItem('user_picture') || pictureUrl;

    // 如果 setSession 成功，onAuthStateChange 会触发并处理 hasCompletedHabitOnboarding 查询
    // 我们给它一点时间（短暂等待），如果 onAuthStateChange 已经在处理，就让它来设置最终状态
    if (setSessionSucceeded) {
      // 短暂等待，让 onAuthStateChange 有机会开始处理
      await new Promise(resolve => setTimeout(resolve, 100));

      // 检查 onAuthStateChange 是否已经完成处理
      // 如果 setSessionTriggeredAuthChangeRef 被 onAuthStateChange 设置为 true，说明它已经接管
      if (setSessionTriggeredAuthChangeRef.current) {
        console.log('🔐 applyNativeLogin: onAuthStateChange 已接管状态处理，跳过重复查询');
        isApplyingNativeLoginRef.current = false;
        // 不清除 isOnAuthStateChangeProcessingRef，让 onAuthStateChange 来清除
        notifyAuthConfirmed('session_set');
        return;
      }
    }

    // 如果 onAuthStateChange 没有接管，自己查询 hasCompletedHabitOnboarding
    let hasCompletedHabitOnboarding = false;
    if (supabase) {
      try {
        console.log('🔐 applyNativeLogin: 查询 hasCompletedHabitOnboarding...');
        const { data: userData } = await supabase
          .from('users')
          .select('has_completed_habit_onboarding')
          .eq('id', userId)
          .single();
        hasCompletedHabitOnboarding = userData?.has_completed_habit_onboarding ?? false;
        console.log('🔐 applyNativeLogin: hasCompletedHabitOnboarding =', hasCompletedHabitOnboarding);
      } catch (err) {
        console.warn('⚠️ applyNativeLogin: 获取 habit onboarding 状态失败:', err);
      }
    }

    await bindAnalyticsUserSync(userId, email);

    // 使用函数式更新，确保不覆盖 onAuthStateChange 可能设置的更新值
    setAuthState(prev => {
      // 如果 userId 变了（极端竞态），不更新
      // 但如果 prev.userId 为 null，强制设置（修复极端竞态场景）
      if (prev.userId && prev.userId !== userId) {
        console.log('🔐 applyNativeLogin: userId 已变化，跳过状态更新');
        return prev;
      }
      // 如果 onAuthStateChange 已经完成验证且 userId 匹配，优先使用它的结果
      if (prev.isSessionValidated && setSessionSucceeded && prev.userId === userId) {
        console.log('🔐 applyNativeLogin: onAuthStateChange 已完成验证，保留其结果');
        return prev;
      }
      return {
        ...prev,
        isLoggedIn: true,
        userId,
        userEmail: email || prev.userEmail || null,
        userName: finalUserName || prev.userName || null,
        userPicture: finalPictureUrl || prev.userPicture || null,
        isNewUser: false,
        sessionToken: accessToken || prev.sessionToken || null,
        refreshToken: refreshToken || prev.refreshToken || null,
        isNativeLogin: true,
        isSessionValidated: true,
        hasCompletedHabitOnboarding,
      };
    });

    // 清理标记
    isOnAuthStateChangeProcessingRef.current = false;
    isApplyingNativeLoginRef.current = false;

    notifyAuthConfirmed('session_set');
    console.log('🔐 applyNativeLogin: 完成, userId:', userId, 'hasCompletedHabitOnboarding:', hasCompletedHabitOnboarding);
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

    /**
     * 补偿检查：事件丢失时，若已注入 MindBoatNativeAuth 则主动处理。
     * 原理：iOS 注入脚本一定会设置 window.MindBoatNativeAuth，可用作兜底。
     */
    const scheduleNativeAuthFallback = (): number => {
      return window.setTimeout(() => {
        if (hasHandledNativeLoginRef.current || isApplyingNativeLoginRef.current) {
          return;
        }
        if (window.MindBoatNativeAuth) {
          console.log('🔐 Web: 补偿处理已注入的登录态');
          void applyNativeLogin(window.MindBoatNativeAuth);
        }
      }, 100);
    };

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

    window.addEventListener('mindboat:nativeLogin', handleNativeLogin as EventListener);
    window.addEventListener('mindboat:nativeLogout', handleNativeLogout);

    /** 补偿检查的定时器 ID，用于清理 */
    let nativeAuthFallbackTimeoutId: number | undefined;
    /**
     * DOMContentLoaded 处理器：初始化 bridge 并触发一次补偿检查。
     * 原理：确保监听器已注册后再初始化，避免事件丢失。
     */
    const handleDomContentLoaded = () => {
      initNativeAuthBridge();
      nativeAuthFallbackTimeoutId = scheduleNativeAuthFallback();
    };

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      handleDomContentLoaded();
    } else {
      document.addEventListener('DOMContentLoaded', handleDomContentLoaded);
    }

    return () => {
      window.removeEventListener('mindboat:nativeLogin', handleNativeLogin as EventListener);
      window.removeEventListener('mindboat:nativeLogout', handleNativeLogout);
      document.removeEventListener('DOMContentLoaded', handleDomContentLoaded);
      if (nativeAuthFallbackTimeoutId !== undefined) {
        window.clearTimeout(nativeAuthFallbackTimeoutId);
      }
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
     *
     * 重要：使用函数式更新避免覆盖 onAuthStateChange 正在处理的状态
     */
    const restoreSession = async () => {
      const NATIVE_LOGIN_GRACE_MS = 3000;

      // 0. 如果正在处理原生登录，跳过 restoreSession（防止覆盖 applyNativeLogin 的状态）
      if (isApplyingNativeLoginRef.current) {
        console.log('🔄 restoreSession: 正在处理原生登录，跳过');
        return;
      }

      /**
       * 启动阶段立即尝试恢复 Supabase session，避免依赖定期检查。
       * 原理：localStorage 已有 token，但 SDK 尚未建立 session 时主动 setSession。
       */
      const tryImmediateSessionRestore = async (): Promise<void> => {
        const storedAccessToken = localStorage.getItem('session_token');
        const storedRefreshToken = localStorage.getItem('refresh_token');
        if (!storedAccessToken || !storedRefreshToken) return;

        try {
          const { data: { session } } = await client.auth.getSession();
          if (session) return;

          console.log('🔐 restoreSession: 启动阶段检测到会话缺失，尝试立即恢复...');
          const { data, error } = await client.auth.setSession({
            access_token: storedAccessToken,
            refresh_token: storedRefreshToken,
          });

          if (error) {
            console.warn('⚠️ restoreSession: 立即恢复会话失败:', error.message);
            return;
          }

          if (data.session) {
            persistSessionToStorage(data.session);
            console.log('✅ restoreSession: 启动阶段会话恢复成功');
          }
        } catch (err) {
          console.warn('⚠️ restoreSession: 立即恢复会话异常:', err);
        }
      };

      await tryImmediateSessionRestore();

      // 1. 以 Supabase 为权威来源验证会话
      const validatedState = await validateSessionWithSupabase();

      // 2. 使用函数式更新，避免覆盖 onAuthStateChange 正在处理的状态
      let shouldSyncProfile = false;
      setAuthState(prev => {
        // 分支0: 原生登录仍在处理，避免在异步窗口内覆盖状态
        if (isApplyingNativeLoginRef.current) {
          console.log('🔄 restoreSession: 正在处理原生登录，跳过覆盖');
          return prev;
        }

        // 分支1: onAuthStateChange 已完成同一用户验证，保留其结果
        if (prev.isSessionValidated && prev.isLoggedIn && prev.userId === validatedState.userId) {
          console.log('🔄 restoreSession: onAuthStateChange 已完成验证，跳过覆盖');
          return prev;
        }

        // 分支2: onAuthStateChange 正在处理同一用户，避免并发写入
        if (isOnAuthStateChangeProcessingRef.current && prev.isLoggedIn && prev.userId === validatedState.userId) {
          console.log('🔄 restoreSession: onAuthStateChange 正在处理，跳过覆盖');
          return prev;
        }

        // 分支3: onAuthStateChange 已进入验证流程但 ref 已被清除（极端竞态）
        if (!prev.isSessionValidated && prev.isLoggedIn && prev.userId === validatedState.userId) {
          console.log('🔄 restoreSession: 检测到会话正在验证中，跳过覆盖');
          return prev;
        }

        // 分支4: 原生登录刚发生但 Supabase 还未同步（短窗口保护）
        if (prev.isLoggedIn && prev.userId && !validatedState.isLoggedIn) {
          const lastNativeLoginStartedAt = lastNativeLoginStartedAtRef.current;
          const isWithinNativeLoginGrace = Boolean(
            lastNativeLoginStartedAt
            && Date.now() - lastNativeLoginStartedAt < NATIVE_LOGIN_GRACE_MS
          );
          if (isWithinNativeLoginGrace) {
            console.log('🔄 restoreSession: 原生登录短窗口内，保留本地登录态');
            return prev;
          }
        }

        // 分支5: prev 正在验证中且 userId 不同，避免覆盖正在进行的登录流程
        if (!prev.isSessionValidated && prev.isLoggedIn && prev.userId && validatedState.userId !== prev.userId) {
          console.log('🔄 restoreSession: prev 正在验证中且 userId 不同，可能是登录流程竞态，跳过覆盖');
          return prev;
        }

        // 分支6: 正常同步（初次加载、用户不同等）
        shouldSyncProfile = validatedState.isLoggedIn && !!validatedState.userId;
        return validatedState;
      });

      // 3. 如果验证后有有效会话且未被跳过，同步用户资料并绑定分析
      if (shouldSyncProfile && validatedState.userId) {
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

    // 用于防抖：记录上次查询的用户 ID 和时间
    let lastQueryUserId: string | null = null;
    let lastQueryTime = 0;
    const DEBOUNCE_MS = 500; // 500ms 内同一用户的重复查询会被跳过

    // 监听 Supabase Auth 状态变化（这是权威来源）
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      console.log('🔄 Auth state changed:', event);
      if (session) {
        const now = Date.now();

        // 【防抖逻辑】USER_UPDATED 事件可能在短时间内多次触发（如 token 刷新）
        // 如果是同一用户且在防抖时间内，跳过重复处理
        if (event === 'USER_UPDATED' && lastQueryUserId === session.user.id && (now - lastQueryTime) < DEBOUNCE_MS) {
          console.log('🔄 onAuthStateChange: 跳过重复的 USER_UPDATED 事件（防抖）');
          return;
        }

        // 更新防抖记录
        lastQueryUserId = session.user.id;
        lastQueryTime = now;

        // 标记 onAuthStateChange 正在处理，防止 restoreSession 覆盖
        isOnAuthStateChangeProcessingRef.current = true;
        // 标记 setSession 已触发 onAuthStateChange（用于与 applyNativeLogin 协调）
        setSessionTriggeredAuthChangeRef.current = true;

        // 登录确认后立即触发一次会话检查，作为最终保险
        triggerSessionCheckNowRef.current?.('auth_state_change');

        // Supabase 通知有有效 session，同步到 localStorage 并更新状态
        persistSessionToStorage(session);
        bindAnalyticsUser(session.user.id, session.user.email);

        // 【原生 App 优化】检测是否在原生 WebView 中
        // 如果在原生 App 中，iOS/Android 端已经查询过 onboarding 状态并决定了 URL
        // 网页端不需要重复查询，直接使用当前 URL 暗示的状态
        const inNativeApp = isInNativeWebView();

        // 先更新基本状态，明确将 isSessionValidated 设置为 false
        // 这样可以防止路由守卫在 hasCompletedHabitOnboarding 查询完成之前就判断跳转
        // 关键：不能保留 prev.isSessionValidated，否则如果之前是 true 会导致过早跳转
        setAuthState(prev => ({
          ...prev,
          isLoggedIn: true,
          userId: session.user.id,
          userEmail: session.user.email || null,
          sessionToken: session.access_token,
          refreshToken: session.refresh_token || null,
          isNativeLogin: false,
          isSessionValidated: false, // 明确设为 false，等查询完成后再设为 true
        }));

        // 异步查询 hasCompletedHabitOnboarding 和同步用户资料，完成后再设置 isSessionValidated
        void (async () => {
          let hasCompletedHabitOnboarding = false;
          const queryStartTime = Date.now();

          // 【修复】同步用户资料到 localStorage，确保重新登录后用户名正确显示
          // 这一步会从数据库读取用户名（如果 localStorage 为空）
          await syncUserProfileToStorage(client, session.user.id);

          // 获取用户名和头像（优先 localStorage，其次 user_metadata）
          const userName = localStorage.getItem('user_name')
            || session.user.user_metadata?.full_name
            || session.user.user_metadata?.name
            || null;
          const userPicture = localStorage.getItem('user_picture')
            || session.user.user_metadata?.avatar_url
            || null;

          // 【原生 App 优化】在原生 App 中跳过数据库查询
          // iOS/Android 端已经在登录时查询过状态并决定加载哪个 URL
          // 根据当前 URL 推断状态：/habit-onboarding 表示未完成，其他表示已完成
          if (inNativeApp) {
            const isOnOnboardingPage = window.location.pathname.includes('habit-onboarding');
            hasCompletedHabitOnboarding = !isOnOnboardingPage;
            console.log('📱 onAuthStateChange: 原生 App 环境，跳过数据库查询，从 URL 推断 hasCompletedHabitOnboarding =', hasCompletedHabitOnboarding);
          } else {
            // 非原生环境：正常查询数据库
            try {
              console.log('🔄 onAuthStateChange: 开始查询 hasCompletedHabitOnboarding...');
              const { data: userData } = await client
                .from('users')
                .select('has_completed_habit_onboarding')
                .eq('id', session.user.id)
                .single();
              hasCompletedHabitOnboarding = userData?.has_completed_habit_onboarding ?? false;

              const queryDuration = Date.now() - queryStartTime;
              if (queryDuration > 5000) {
                console.warn(`⚠️ onAuthStateChange: 查询耗时过长 (${queryDuration}ms)，可能存在网络问题`);
              }
              console.log(`✅ onAuthStateChange: hasCompletedHabitOnboarding = ${hasCompletedHabitOnboarding} (耗时 ${queryDuration}ms)`);
            } catch (err) {
              const queryDuration = Date.now() - queryStartTime;
              console.warn(`⚠️ onAuthStateChange: 获取 habit onboarding 状态失败 (耗时 ${queryDuration}ms):`, err);
            }
          }

          // 查询完成后，同时设置 isSessionValidated、hasCompletedHabitOnboarding 和用户资料
          setAuthState(prev => {
            // 确保 userId 没有变化（防止竞态条件）
            // 但如果 prev.userId 为 null 而 session 有效，强制设置（修复极端竞态场景）
            if (prev.userId && prev.userId !== session.user.id) {
              console.log('🔄 onAuthStateChange: userId 已变化，跳过此次更新');
              return prev;
            }
            return {
              ...prev,
              isLoggedIn: true,
              userId: session.user.id, // 确保 userId 被设置
              userName, // 【修复】设置用户名
              userPicture, // 【修复】设置用户头像
              hasCompletedHabitOnboarding,
              isSessionValidated: true,
            };
          });

          // 标记 onAuthStateChange 处理完成
          isOnAuthStateChangeProcessingRef.current = false;
          console.log('✅ onAuthStateChange: 处理完成, hasCompletedHabitOnboarding =', hasCompletedHabitOnboarding);
        })();

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
  // 定期会话状态检查（兜底保护）
  // 防止 setSession 失败后 token 过期导致用户被登出
  // ==========================================
  useEffect(() => {
    if (!supabase) return;

    // 每 5 分钟检查一次会话状态
    const SESSION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

    // 启动定期检查
    const intervalId = setInterval(() => {
      void triggerSessionCheckNow('periodic_interval');
    }, SESSION_CHECK_INTERVAL_MS);

    // 首次延迟 3 秒后检查（进一步缩短首轮空窗期，仍保留登录流程缓冲）
    const initialCheckTimeoutId = setTimeout(() => {
      void triggerSessionCheckNow('initial_delay');
    }, 3 * 1000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(initialCheckTimeoutId);
    };
  }, [supabase, triggerSessionCheckNow]);

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
    sendEmailOtp,
    verifyEmailOtp,
    updateProfile,
    logout,
    fullReset,
    markOnboardingCompleted,
    markHabitOnboardingCompleted,
    deleteAccount,
  }), [
    authState,
    isOAuthProcessing,
    checkLoginState,
    navigateToLogin,
    loginWithEmail,
    signupWithEmail,
    authWithEmail,
    sendEmailOtp,
    verifyEmailOtp,
    updateProfile,
    logout,
    fullReset,
    markHabitOnboardingCompleted,
    markOnboardingCompleted,
    deleteAccount,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
