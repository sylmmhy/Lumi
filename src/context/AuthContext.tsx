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
import { useAuthLifecycle } from './auth/useAuthLifecycle';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DEFAULT_APP_PATH } from '../constants/routes';
import { clearVisitorData, getVisitorId } from '../utils/onboardingVisitor';

// 拆分出的模块
import { bindAnalyticsUser, resetAnalyticsUser } from './auth/analyticsSync';
import { getOAuthCallbackParams, hasOAuthCallbackParams, clearOAuthCallbackParams } from './auth/oauthCallback';
import {
  notifyNativeLogout,
  requestNativeAuth,
  initNativeAuthBridge,
  isInNativeWebView,
} from './auth/nativeAuthBridge';
import { updateUserProfile } from './auth/userProfile';
import { fetchHabitOnboardingCompleted } from './auth/habitOnboarding';
import {
  NATIVE_LOGIN_FLAG_KEY,
  LOGGED_OUT_STATE,
  readAuthFromStorage,
  persistSessionToStorage,
  clearAuthStorage,
} from './auth/storage';
import { canExecuteSetSession, acquireSetSessionLock, releaseSetSessionLock } from './auth/sessionLock';
import { validateSessionWithSupabase } from './auth/sessionValidation';
import { syncAfterLogin } from './auth/postLoginSync';

// ==========================================
// 常量定义
// ==========================================

const DEFAULT_LOGIN_PATH = '/login/mobile';


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
      const userId = latest.userId;
      void (async () => {
        const fetchedHasCompletedHabitOnboarding = await fetchHabitOnboardingCompleted(
          supabase,
          userId,
          'checkLoginState',
          null
        );

        setAuthState(prev => {
          if (prev.userId !== userId) return prev;
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

	  const navigateToLogin = useCallback((redirectPath?: string) => {
	    // 在 WebView 环境中，通知 Native 端回到原生登录页
	    if (isInNativeWebView()) {
	      const deadline = nativeAuthBootstrapDeadlineRef.current;
	      const isBootstrapPending = Boolean(
	        deadline
	        && Date.now() < deadline
	        && !hasHandledNativeLoginRef.current
	        && !isApplyingNativeLoginRef.current
	      );
	      if (isBootstrapPending) {
	        console.log('📱 WebView 环境：Native 登录态仍在注入窗口内，先请求 Native 注入（避免误触发原生登出）');
	        requestNativeAuth();
	        return;
	      }
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
        // 【修复】使用全局互斥锁，防止与其他 setSession 并发
        if (!canExecuteSetSession('oauth_implicit')) {
          console.log('🔐 OAuth implicit: 跳过 setSession，已有其他调用正在执行');
          return;
        }
        acquireSetSessionLock('oauth_implicit');
        try {
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
        } finally {
          releaseSetSessionLock('oauth_implicit');
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
      localStorage.setItem('is_new_user', 'false');
      localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
      triggerSessionCheckNowRef.current?.('password_login');

      console.log('✅ Login successful:', data.user.email);
      const { userName, userPicture, hasCompletedHabitOnboarding } = await syncAfterLogin({
        client: supabase,
        session: data.session,
        userId: data.user.id,
        source: 'loginWithEmail',
      });

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
          localStorage.setItem('is_new_user', 'false');
          localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
          triggerSessionCheckNowRef.current?.('otp_backdoor');

	          console.log('✅ Dev backdoor: login successful');
          const { userName, userPicture, hasCompletedHabitOnboarding } = await syncAfterLogin({
            client: supabase,
            session: data.session,
            userId: data.user.id,
            source: 'verifyEmailOtp(dev_backdoor)',
          });

	          setAuthState(prev => ({
	            ...prev,
	            isLoggedIn: true,
            userId: data.user.id,
            userEmail: data.user.email || null,
            userName: userName || 'Test User',
            userPicture: userPicture || null,
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
        localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
        triggerSessionCheckNowRef.current?.('otp_verify');

        // 检查是否是新用户（通过 created_at 和当前时间对比）
        const createdAt = new Date(user.created_at);
        const now = new Date();
        const isNewUser = (now.getTime() - createdAt.getTime()) < 60000; // 1分钟内创建的视为新用户
        localStorage.setItem('is_new_user', isNewUser ? 'true' : 'false');

        console.log('✅ OTP 登录成功:', user.email);
        const { userName, userPicture, hasCompletedHabitOnboarding } = await syncAfterLogin({
          client: supabase,
          session,
          userId: user.id,
          source: 'verifyEmailOtp',
        });

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
    setAuthState({ ...LOGGED_OUT_STATE });
  }, []);

  // ==========================================
  // 认证生命周期 Hook
  // ==========================================

  const {
    triggerSessionCheckNow,
    applyNativeLogin,
    applyNativeLogout,
    hasHandledNativeLoginRef,
    isApplyingNativeLoginRef,
    lastNativeLoginStartedAtRef,
    nativeAuthBootstrapDeadlineRef,
    isOnAuthStateChangeProcessingRef,
    setSessionTriggeredAuthChangeRef,
  } = useAuthLifecycle({ setAuthState, checkLoginState, logout });

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
    setAuthState({ ...LOGGED_OUT_STATE });
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
  // Native Auth Bridge 初始化
  // ==========================================

	  useEffect(() => {
	    const handleNativeLogin = (event: Event) => {
	      const nativeEvent = event as CustomEvent<NativeAuthPayload>;
	      void applyNativeLogin(nativeEvent.detail);
	    };

	    const handleNativeLogout = () => void applyNativeLogout();

	    // 提前标记网页已就绪，避免 Native 端等待超时后才注入（减少时序竞争窗口）
	    window.__MindBoatAuthReady = true;

	    const NATIVE_AUTH_BOOTSTRAP_MAX_WAIT_MS = 8_000;
	    const NATIVE_AUTH_FALLBACK_POLL_INTERVAL_MS = 100;
	    const NATIVE_AUTH_FALLBACK_MAX_WAIT_MS = 8_000;

	    /**
	     * 开启/延长 Native 注入等待窗口（避免“尚未注入→误判未登录→触发原生硬登出”）。
	     *
	     * @param reason - 触发原因（用于日志定位）
	     */
	    const armNativeAuthBootstrapWindow = (reason: string): void => {
	      if (!isInNativeWebView()) return;
	      const now = Date.now();
	      const nextDeadline = now + NATIVE_AUTH_BOOTSTRAP_MAX_WAIT_MS;
	      nativeAuthBootstrapDeadlineRef.current = Math.max(nativeAuthBootstrapDeadlineRef.current ?? 0, nextDeadline);
	      if (import.meta.env.DEV) {
	        console.log('🔐 NativeAuth bootstrap window armed:', reason, 'deadline=', nativeAuthBootstrapDeadlineRef.current);
	      }
	    };

	    // ===== 兜底轮询：解决 CustomEvent 丢失 / 注入晚到 =====
	    let fallbackIntervalId: number | undefined;
	    let fallbackStopTimeoutId: number | undefined;

	    const stopFallbackPolling = (): void => {
	      if (fallbackIntervalId !== undefined) {
	        window.clearInterval(fallbackIntervalId);
	        fallbackIntervalId = undefined;
	      }
	      if (fallbackStopTimeoutId !== undefined) {
	        window.clearTimeout(fallbackStopTimeoutId);
	        fallbackStopTimeoutId = undefined;
	      }
	    };

	    const pollNativeAuthOnce = (): void => {
	      if (hasHandledNativeLoginRef.current || isApplyingNativeLoginRef.current) {
	        stopFallbackPolling();
	        return;
	      }
	      if (window.MindBoatNativeAuth) {
	        console.log('🔐 Web: 兜底轮询发现已注入的登录态，开始处理');
	        void applyNativeLogin(window.MindBoatNativeAuth);
	        stopFallbackPolling();
	      }
	    };

	    const startFallbackPolling = (): void => {
	      stopFallbackPolling();
	      fallbackIntervalId = window.setInterval(pollNativeAuthOnce, NATIVE_AUTH_FALLBACK_POLL_INTERVAL_MS);
	      fallbackStopTimeoutId = window.setTimeout(stopFallbackPolling, NATIVE_AUTH_FALLBACK_MAX_WAIT_MS);
	      pollNativeAuthOnce();
	    };

	    /**
	     * 初始化 Native Auth Bridge，并启动兜底轮询。
	     *
	     * 原理：
	     * - 先注册事件监听，再 initBridge，避免丢事件
	     * - 轮询 window.MindBoatNativeAuth，兜底处理“事件已触发但监听器错过”的情况
	     */
	    const startNativeAuthBridge = (): void => {
	      armNativeAuthBootstrapWindow('startNativeAuthBridge');
	      initNativeAuthBridge((payload) => {
	        armNativeAuthBootstrapWindow('native_payload_found');
	        void applyNativeLogin(payload);
	      });
	      startFallbackPolling();
	    };

	    window.addEventListener('mindboat:nativeLogin', handleNativeLogin as EventListener);
	    window.addEventListener('mindboat:nativeLogout', handleNativeLogout);

	    /**
	     * DOMContentLoaded 处理器：初始化 bridge 并启动兜底轮询。
	     * 原理：确保监听器已注册后再初始化，避免事件丢失；并覆盖注入晚到的情况。
	     */
	    const handleDomContentLoaded = () => {
	      startNativeAuthBridge();
	    };

	    if (document.readyState === 'complete' || document.readyState === 'interactive') {
	      handleDomContentLoaded();
	    } else {
	      document.addEventListener('DOMContentLoaded', handleDomContentLoaded);
	    }

	    /**
	     * WebView 被挂起后恢复时，可能错过注入事件；在可见时触发一次兜底检查。
	     * 仅在“尚未处理过 Native 登录”的情况下执行，避免重复 setSession 造成 refresh token 竞态。
	     */
	    const handleVisibilityChange = () => {
	      if (document.visibilityState !== 'visible') return;
	      if (hasHandledNativeLoginRef.current || isApplyingNativeLoginRef.current) return;
	      startNativeAuthBridge();
	    };
	    document.addEventListener('visibilitychange', handleVisibilityChange);

	    return () => {
	      window.removeEventListener('mindboat:nativeLogin', handleNativeLogin as EventListener);
	      window.removeEventListener('mindboat:nativeLogout', handleNativeLogout);
	      document.removeEventListener('DOMContentLoaded', handleDomContentLoaded);
	      document.removeEventListener('visibilitychange', handleVisibilityChange);
	      stopFallbackPolling();
	    };
	  }, [applyNativeLogin, applyNativeLogout]);

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
