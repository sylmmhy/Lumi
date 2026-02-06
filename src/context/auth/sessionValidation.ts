/**
 * auth/sessionValidation.ts - Supabase 会话验证
 *
 * 以 Supabase Auth 为权威来源验证会话，解决 localStorage 与 Supabase
 * 状态不一致的问题。包含重试机制和网络错误容错。
 */

import type { AuthState } from '../AuthContextDefinition';
import { supabase } from '../../lib/supabase';
import {
  AUTH_STORAGE_KEYS,
  NATIVE_LOGIN_FLAG_KEY,
  LOGGED_OUT_STATE,
  batchGetLocalStorage,
  readAuthFromStorage,
  persistSessionToStorage,
  clearAuthStorage,
} from './storage';
import {
  canExecuteSetSession,
  acquireSetSessionLock,
  releaseSetSessionLock,
  isNetworkError,
} from './sessionLock';
import { fetchHabitOnboardingCompleted } from './habitOnboarding';
import { isInNativeWebView, requestNativeAuth } from './nativeAuthBridge';

// ==========================================
// 常量
// ==========================================

/**
 * DEV ONLY：测试账号免验证开关
 *
 * 风险说明：
 * - 若在生产环境可触发，会导致认证状态被绕过（高风险）。
 *
 * 保护措施：
 * - 仅在 `import.meta.env.DEV === true` 时生效；生产构建永远不会进入该分支。
 */
export const DEV_TEST_USER_ID = import.meta.env.DEV
  ? '31d5da79-2cfc-445d-9543-eefc5b8d31d7'
  : null;

// ==========================================
// 函数
// ==========================================

/**
 * 以 Supabase Auth 为权威来源验证会话。
 *
 * 验证逻辑：
 * 1. 优先使用 Supabase getSession() 的结果
 * 2. 如果 Supabase 没有 session 但 localStorage 有 token，尝试恢复
 * 3. 恢复失败则清除 localStorage（以 Supabase 为准）
 * 4. Native 登录是特殊情况，允许没有 Supabase session
 *
 * @returns 经过验证的认证状态
 */
export async function validateSessionWithSupabase(): Promise<AuthState> {
  if (!supabase) {
    // 无 Supabase 客户端，直接返回 localStorage 状态（标记为已验证以避免阻塞）
    const state = readAuthFromStorage();
    return { ...state, isSessionValidated: true };
  }

  const stored = batchGetLocalStorage(AUTH_STORAGE_KEYS);
  const isNativeLogin = stored[NATIVE_LOGIN_FLAG_KEY] === 'true';
  const storedUserId = stored['user_id'];

  // DEV ONLY：跳过测试账号的会话验证（生产环境不会触发）
  if (import.meta.env.DEV && DEV_TEST_USER_ID && storedUserId === DEV_TEST_USER_ID) {
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

	    const hasCompletedHabitOnboarding = (await fetchHabitOnboardingCompleted(
	      supabase,
	      session.user.id,
	      'validateSessionWithSupabase(session)'
	    )) ?? false;

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

    // 【修复】使用全局互斥锁，防止与其他 setSession 并发
    if (!canExecuteSetSession('initializeAuthState')) {
      console.log('🔐 initializeAuthState: 跳过 setSession，已有其他调用正在执行');
      // 返回当前 localStorage 状态，让后续的 setSession 处理
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
        isSessionValidated: false,
        hasCompletedHabitOnboarding: false,
      };
    }

    acquireSetSessionLock('initializeAuthState');

    // P0 修复：添加重试机制，避免临时错误导致过早登出
    const MAX_RETRY_ATTEMPTS = 3;
    const RETRY_DELAY_MS = 1000;

    try {
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
	          // 在 WebView 环境中不要直接触发原生登出：
	          // - iOS 的 userLogout 会清空 Keychain/UserDefaults，属于"硬登出"
	          // - 这里更可能是"网页 token 不可用/不同步"，应先请求原生重新注入登录态
	          if (isInNativeWebView()) {
	            console.log('📱 Session 验证失败，尝试向 Native 端重新请求登录态（避免误触发原生登出）');
	            requestNativeAuth();
	          }
	          return { ...LOGGED_OUT_STATE };
        }

	        if (restored.session) {
	          console.log('✅ 成功用 localStorage token 恢复 session:', restored.session.user.email);
	          persistSessionToStorage(restored.session);

	          const hasCompletedHabitOnboarding = (await fetchHabitOnboardingCompleted(
	            supabase,
	            restored.session.user.id,
	            'validateSessionWithSupabase(restore)'
	          )) ?? false;

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
    } finally {
      releaseSetSessionLock('initializeAuthState');
    }

	    // 所有重试都失败且非网络错误，清除 localStorage
	    console.warn('⚠️ 多次尝试后仍无法恢复 session，清除本地认证状态');
	    clearAuthStorage();
	    // 在 WebView 环境中不要直接触发原生登出，优先请求原生重新注入登录态
	    if (isInNativeWebView()) {
	      console.log('📱 Session 恢复失败，尝试向 Native 端重新请求登录态（避免误触发原生登出）');
	      requestNativeAuth();
	    }
	  }

  // 4. Native 登录特殊处理：允许没有 Supabase session
	  if (isNativeLogin && storedUserId) {
	    console.log('📱 Native 登录模式，使用 localStorage 状态');

	    const hasCompletedHabitOnboarding = (await fetchHabitOnboardingCompleted(
	      supabase,
	      storedUserId,
	      'validateSessionWithSupabase(native)'
	    )) ?? false;

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
  return { ...LOGGED_OUT_STATE };
}
