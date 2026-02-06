/**
 * AuthContext - 核心认证模块
 *
 * 重构后的精简版本，将各职责拆分到独立模块：
 * - useAuthLifecycle: 认证生命周期（session 恢复、Native Bridge、OAuth、storage 同步）
 * - analyticsSync.ts: 埋点工具同步
 * - oauthCallback.ts: OAuth 回调处理
 * - nativeAuthBridge.ts: Native App 桥接
 * - userProfile.ts: 用户资料管理
 */

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContextDefinition';
import { useAuthLifecycle } from './auth/useAuthLifecycle';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { DEFAULT_APP_PATH } from '../constants/routes';
import { clearVisitorData, getVisitorId } from '../utils/onboardingVisitor';

import { bindAnalyticsUser, resetAnalyticsUser } from './auth/analyticsSync';
import { notifyNativeLogout } from './auth/nativeAuthBridge';
import { updateUserProfile } from './auth/userProfile';
import { NATIVE_LOGIN_FLAG_KEY, LOGGED_OUT_STATE, readAuthFromStorage, clearAuthStorage } from './auth/storage';
import { syncAfterLogin } from './auth/postLoginSync';

// ==========================================
// 常量
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

  // ==========================================
  // 登出（必须在 useAuthLifecycle 之前定义，因为 hook 接收它作为参数）
  // ==========================================

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem('session_token');

    if (supabase) {
      if (currentToken) {
        const deviceCleanupPromises = [
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
        await Promise.allSettled(deviceCleanupPromises);
      }

      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch (error) {
        console.warn('⚠️ Supabase signOut 失败（已忽略），将强制清理本地状态:', error);
      }
    }

    localStorage.removeItem('voip_token');
    clearAuthStorage();

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
    setAuthState({ ...LOGGED_OUT_STATE });
  }, []);

  // ==========================================
  // 认证生命周期 Hook
  // ==========================================

  const {
    triggerSessionCheckNowRef,
    checkLoginState,
    navigateToLogin,
    isOAuthProcessing,
    bindOnboardingToUser,
  } = useAuthLifecycle({ setAuthState, logout, navigate, loginPath, defaultRedirectPath });

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

      const visitorIdToUse = visitorId || getVisitorId();
      if (visitorIdToUse) {
        await bindOnboardingToUser(visitorIdToUse, data.user.id);
        clearVisitorData();
      }

      const { user, session } = data;
      bindAnalyticsUser(user.id, user.email);
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
    if (email === 'q@q.com') {
      console.log('🔓 Dev backdoor: skipping OTP send');
      return { error: null };
    }

    if (!supabase) return { error: 'Supabase client not initialized' };

    try {
      const redirectTo = `${window.location.origin}${defaultRedirectPath || DEFAULT_APP_PATH}`;
      console.log('📧 Magic Link 回调 URL:', redirectTo);

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true,
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
  }, [defaultRedirectPath]);

  const verifyEmailOtp = useCallback(async (
    email: string,
    otp: string
  ): Promise<{ error: string | null; isNewUser?: boolean }> => {
    if (email === 'q@q.com' && otp === '123456') {
      console.log('🔓 Dev backdoor: using password login for test account');
      if (!supabase) return { error: 'Supabase client not initialized' };

      try {
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

        const createdAt = new Date(user.created_at);
        const now = new Date();
        const isNewUser = (now.getTime() - createdAt.getTime()) < 60000;
        localStorage.setItem('is_new_user', isNewUser ? 'true' : 'false');

        console.log('✅ OTP 登录成功:', user.email);
        const { userName, userPicture, hasCompletedHabitOnboarding } = await syncAfterLogin({
          client: supabase,
          session,
          userId: user.id,
          source: 'verifyEmailOtp',
        });

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

  const fullReset = useCallback(() => {
    localStorage.clear();
    if (import.meta.env.DEV) console.log('🗑️ 完全重置 - 所有 localStorage 已清除');
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

      const { error: tasksError } = await supabase
        .from('tasks')
        .delete()
        .eq('user_id', userId);

      if (tasksError) {
        console.warn('⚠️ 删除任务数据失败（可能没有数据）:', tasksError.message);
      }

      const { error: userError } = await supabase
        .from('users')
        .delete()
        .eq('id', userId);

      if (userError) {
        console.error('❌ 删除用户数据失败:', userError);
        return { error: userError.message };
      }

      console.log('✅ 用户数据已删除');
      await logout();

      return { error: null };
    } catch (err) {
      console.error('❌ 删除账户时出错:', err);
      return { error: String(err) };
    }
  }, [authState.userId, logout]);

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
    markOnboardingCompleted,
    markHabitOnboardingCompleted,
    deleteAccount,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
