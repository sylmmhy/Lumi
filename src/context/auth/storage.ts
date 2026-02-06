/**
 * auth/storage.ts - 认证存储工具模块
 *
 * 集中管理 localStorage 的读写常量和函数，
 * 使存储逻辑的修改只需编辑一个文件。
 */

import type { AuthState } from '../AuthContextDefinition';
import type { Session } from '@supabase/supabase-js';

// ==========================================
// 常量
// ==========================================

/** Native 登录标记的 localStorage key */
export const NATIVE_LOGIN_FLAG_KEY = 'native_login';

/** 需要读取的所有认证相关 localStorage keys */
export const AUTH_STORAGE_KEYS = [
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
 * 已验证的登出状态常量。
 *
 * 使用时必须展开（`{ ...LOGGED_OUT_STATE }`），防止引用被意外修改。
 */
export const LOGGED_OUT_STATE: AuthState = {
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

// ==========================================
// 函数
// ==========================================

/**
 * 批量读取 localStorage，减少同步 I/O 次数。
 * iOS WebView 中每次 localStorage.getItem 都是昂贵的同步操作。
 *
 * @param keys - 要读取的 localStorage key 数组
 * @returns 以 key 为属性、value 为值（可能为 null）的对象
 */
export function batchGetLocalStorage<T extends readonly string[]>(keys: T): Record<T[number], string | null> {
  const result = {} as Record<T[number], string | null>;
  for (const key of keys) {
    result[key as T[number]] = localStorage.getItem(key);
  }
  return result;
}

/**
 * 从 localStorage 读取认证状态（仅作为缓存，需通过 Supabase 验证）。
 *
 * 注意：返回的 `isSessionValidated` 始终为 `false`，
 * 需通过 `validateSessionWithSupabase` 验证后才设为 `true`。
 *
 * @returns 从 localStorage 恢复的认证状态
 */
export function readAuthFromStorage(): AuthState {
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
 * 将 Supabase session 同步到本地存储。
 *
 * @param session - Supabase 的 Session 对象
 */
export function persistSessionToStorage(session: Session): void {
  localStorage.setItem('session_token', session.access_token);
  if (session.refresh_token) {
    localStorage.setItem('refresh_token', session.refresh_token);
  }
  localStorage.setItem('user_id', session.user.id);
  localStorage.setItem('user_email', session.user.email || '');
  localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
}

/**
 * 清理所有认证相关的 localStorage。
 */
export function clearAuthStorage(): void {
  localStorage.removeItem('session_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user_id');
  localStorage.removeItem('user_email');
  localStorage.removeItem('user_name');
  localStorage.removeItem('user_picture');
  localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
}
