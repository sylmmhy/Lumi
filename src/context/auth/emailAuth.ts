/**
 * auth/emailAuth.ts - 邮箱认证操作
 *
 * 包含 Email/Password 登录、注册、OTP 发送/验证的核心逻辑。
 * 从 AuthContext 中拆分出来，保持 AuthContext 精简。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuthState } from '../AuthContextDefinition';
import { NATIVE_LOGIN_FLAG_KEY } from './storage';
import { syncAfterLogin } from './postLoginSync';
import { bindAnalyticsUser } from './analyticsSync';

/**
 * Email 认证操作的通用返回值
 */
export interface EmailAuthResult {
  /** 错误信息（null 表示成功） */
  error: string | null;
  /** 是否新用户 */
  isNewUser?: boolean;
  /** 状态更新数据（由调用方合并到 authState） */
  stateUpdate?: Partial<AuthState>;
  /** 原始 Supabase 响应数据（仅 signupWithEmail 使用） */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rawData?: any;
}

/**
 * 执行邮箱+密码登录。
 *
 * @param client - Supabase 客户端
 * @param email - 邮箱
 * @param password - 密码
 * @returns 登录结果（含状态更新数据）
 */
export async function performEmailLogin(
  client: SupabaseClient,
  email: string,
  password: string,
): Promise<EmailAuthResult> {
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  if (!data.session || !data.user) return { error: 'Login failed' };

  localStorage.setItem('is_new_user', 'false');
  localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);

  console.log('✅ Login successful:', data.user.email);
  const { userName, userPicture, hasCompletedHabitOnboarding } = await syncAfterLogin({
    client, session: data.session, userId: data.user.id, source: 'loginWithEmail',
  });

  return {
    error: null,
    stateUpdate: {
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
    },
  };
}

/**
 * 执行邮箱注册。
 *
 * @param client - Supabase 客户端
 * @param email - 邮箱
 * @param password - 密码
 * @param fullName - 用户全名（可选）
 * @returns 注册结果
 */
export async function performEmailSignup(
  client: SupabaseClient,
  email: string,
  password: string,
  fullName?: string,
): Promise<EmailAuthResult> {
  const { data, error } = await client.auth.signUp({
    email, password, options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };
  if (!data.session || !data.user) return { error: null, rawData: data };

  localStorage.setItem('session_token', data.session.access_token);
  if (data.session.refresh_token) localStorage.setItem('refresh_token', data.session.refresh_token);
  localStorage.setItem('user_id', data.user.id);
  localStorage.setItem('user_email', data.user.email || '');
  const nameToSave = fullName || data.user.user_metadata?.full_name || '';
  if (nameToSave) localStorage.setItem('user_name', nameToSave as string);
  localStorage.setItem('is_new_user', 'true');
  localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);

  bindAnalyticsUser(data.user.id, data.user.email);

  return {
    error: null,
    rawData: data,
    stateUpdate: {
      isLoggedIn: true,
      userId: data.user.id,
      userEmail: data.user.email || null,
      userName: fullName || (data.user.user_metadata?.full_name as string) || null,
      sessionToken: data.session.access_token,
      refreshToken: data.session.refresh_token || null,
      isNewUser: true,
      isNativeLogin: false,
      isSessionValidated: true,
      hasCompletedHabitOnboarding: false,
    },
  };
}

/**
 * 发送邮箱 OTP（Magic Link）。
 *
 * @param client - Supabase 客户端
 * @param email - 邮箱
 * @param redirectUrl - 回调 URL
 * @returns 发送结果
 */
export async function performSendEmailOtp(
  client: SupabaseClient,
  email: string,
  redirectUrl: string,
): Promise<{ error: string | null }> {
  try {
    console.log('📧 Magic Link 回调 URL:', redirectUrl);
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: redirectUrl },
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
}

/**
 * 验证邮箱 OTP。
 *
 * @param client - Supabase 客户端
 * @param email - 邮箱
 * @param otp - 验证码
 * @returns 验证结果
 */
export async function performVerifyEmailOtp(
  client: SupabaseClient,
  email: string,
  otp: string,
): Promise<EmailAuthResult> {
  // Dev backdoor: test account
  if (email === 'q@q.com' && otp === '123456') {
    console.log('🔓 Dev backdoor: using password login for test account');
    try {
      const { data, error: loginError } = await client.auth.signInWithPassword({
        email: 'q@q.com', password: 'test123456',
      });
      if (loginError) {
        console.error('❌ Dev backdoor login failed:', loginError);
        return { error: loginError.message };
      }
      if (!data.session || !data.user) return { error: 'Login failed' };

      localStorage.setItem('is_new_user', 'false');
      localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
      console.log('✅ Dev backdoor: login successful');

      const { userName, userPicture, hasCompletedHabitOnboarding } = await syncAfterLogin({
        client, session: data.session, userId: data.user.id, source: 'verifyEmailOtp(dev_backdoor)',
      });
      return {
        error: null, isNewUser: false,
        stateUpdate: {
          isLoggedIn: true, userId: data.user.id, userEmail: data.user.email || null,
          userName: userName || 'Test User', userPicture: userPicture || null,
          sessionToken: data.session.access_token,
          refreshToken: data.session.refresh_token || null,
          isNewUser: false, isNativeLogin: false, isSessionValidated: true,
          hasCompletedHabitOnboarding,
        },
      };
    } catch (err) {
      console.error('❌ Dev backdoor error:', err);
      return { error: String(err) };
    }
  }

  // Real OTP verification
  try {
    const { data, error } = await client.auth.verifyOtp({ email, token: otp, type: 'email' });
    if (error) {
      console.error('❌ 验证码验证失败:', error);
      return { error: error.message };
    }

    const { session, user } = data;
    if (!session || !user) return { error: 'Verification failed' };

    localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
    const createdAt = new Date(user.created_at);
    const isNewUser = (Date.now() - createdAt.getTime()) < 60000;
    localStorage.setItem('is_new_user', isNewUser ? 'true' : 'false');

    console.log('✅ OTP 登录成功:', user.email);
    const { userName, userPicture, hasCompletedHabitOnboarding } = await syncAfterLogin({
      client, session, userId: user.id, source: 'verifyEmailOtp',
    });

    return {
      error: null, isNewUser,
      stateUpdate: {
        isLoggedIn: true, userId: user.id, userEmail: user.email || null,
        userName: userName || null, userPicture: userPicture || null,
        sessionToken: session.access_token, refreshToken: session.refresh_token || null,
        isNewUser, isNativeLogin: false, isSessionValidated: true,
        hasCompletedHabitOnboarding,
      },
    };
  } catch (err) {
    console.error('❌ 验证码验证时出错:', err);
    return { error: String(err) };
  }
}
