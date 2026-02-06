/**
 * AuthContext - 核心认证模块
 *
 * 重构后的精简版本，将各职责拆分到独立模块：
 * - useAuthLifecycle: 认证生命周期（session 恢复、Native Bridge、OAuth、storage 同步）
 * - logout.ts: 登出清理逻辑
 * - emailAuth.ts: 邮箱登录/注册/OTP 操作
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

import { resetAnalyticsUser } from './auth/analyticsSync';
import { notifyNativeLogout } from './auth/nativeAuthBridge';
import { updateUserProfile } from './auth/userProfile';
import { LOGGED_OUT_STATE, readAuthFromStorage } from './auth/storage';
import { performLogout } from './auth/logout';
import {
  performEmailLogin,
  performEmailSignup,
  performSendEmailOtp,
  performVerifyEmailOtp,
} from './auth/emailAuth';

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
    await performLogout(supabase);
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
    const result = await performEmailLogin(supabase, email, password);
    if (result.stateUpdate) {
      triggerSessionCheckNowRef.current?.('password_login');
      setAuthState(prev => ({ ...prev, ...result.stateUpdate! }));
    }
    return { error: result.error };
  }, []);

  const signupWithEmail = useCallback(async (
    email: string, password: string, fullName?: string, visitorId?: string,
  ) => {
    if (!supabase) return { error: 'Supabase client not initialized' };
    const result = await performEmailSignup(supabase, email, password, fullName);
    if (result.stateUpdate) {
      triggerSessionCheckNowRef.current?.('signup');
      const vid = visitorId || getVisitorId();
      if (vid && result.stateUpdate.userId) {
        await bindOnboardingToUser(vid, result.stateUpdate.userId);
        clearVisitorData();
      }
      setAuthState(prev => ({ ...prev, ...result.stateUpdate! }));
    }
    return { error: result.error, data: result.rawData };
  }, []);

  const authWithEmail = useCallback(async (
    email: string, password: string,
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
  // 邮箱验证码 (OTP)
  // ==========================================

  const sendEmailOtp = useCallback(async (email: string): Promise<{ error: string | null }> => {
    if (email === 'q@q.com') {
      console.log('🔓 Dev backdoor: skipping OTP send');
      return { error: null };
    }
    if (!supabase) return { error: 'Supabase client not initialized' };
    const redirectUrl = `${window.location.origin}${defaultRedirectPath || DEFAULT_APP_PATH}`;
    return performSendEmailOtp(supabase, email, redirectUrl);
  }, [defaultRedirectPath]);

  const verifyEmailOtp = useCallback(async (
    email: string, otp: string,
  ): Promise<{ error: string | null; isNewUser?: boolean }> => {
    if (!supabase) return { error: 'Supabase client not initialized' };
    const result = await performVerifyEmailOtp(supabase, email, otp);
    if (result.stateUpdate) {
      triggerSessionCheckNowRef.current?.(email === 'q@q.com' ? 'otp_backdoor' : 'otp_verify');
      setAuthState(prev => ({ ...prev, ...result.stateUpdate! }));
    }
    return { error: result.error, isNewUser: result.isNewUser };
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
    taskDescription: string, timeSpent: number, status: 'success' | 'failure',
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
      setAuthState(prev => ({ ...prev, hasCompletedHabitOnboarding: true }));
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
      const { error: tasksError } = await supabase.from('tasks').delete().eq('user_id', userId);
      if (tasksError) console.warn('⚠️ 删除任务数据失败（可能没有数据）:', tasksError.message);
      const { error: userError } = await supabase.from('users').delete().eq('id', userId);
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
    authState, isOAuthProcessing, checkLoginState, navigateToLogin,
    loginWithEmail, signupWithEmail, authWithEmail, sendEmailOtp,
    verifyEmailOtp, updateProfile, logout, fullReset,
    markOnboardingCompleted, markHabitOnboardingCompleted, deleteAccount,
  ]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}
