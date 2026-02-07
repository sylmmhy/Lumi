/**
 * auth/postLoginSync.ts - 登录后同步管道
 *
 * 统一登录成功后的数据同步逻辑，消除 loginWithEmail、verifyEmailOtp、
 * onAuthStateChange、applyNativeLogin 中的重复代码。
 *
 * syncAfterLogin 仅负责数据获取和同步，不调用 setAuthState——
 * 各调用方根据自身的并发控制需求自行处理状态更新。
 */

import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { persistSessionToStorage } from './storage';
import { syncUserProfileToStorage } from './userProfile';
import { bindAnalyticsUserSync } from './analyticsSync';
import { fetchHabitOnboardingCompleted } from './habitOnboarding';
import { loadLanguagePreferencesFromBackend, getUILanguage, syncLanguagePreferencesToBackend, syncUILanguageToiOS } from '../../lib/language';

/**
 * syncAfterLogin 的参数
 */
export interface SyncAfterLoginParams {
  /** Supabase 客户端 */
  client: SupabaseClient;
  /** 当前 Supabase session */
  session: Session;
  /** 用户 ID */
  userId: string;
  /** 调用来源（用于日志） */
  source: string;
}

/**
 * syncAfterLogin 的返回值
 */
export interface SyncAfterLoginResult {
  /** 用户名（优先 localStorage，其次 user_metadata） */
  userName: string | null;
  /** 用户头像（优先 localStorage，其次 user_metadata） */
  userPicture: string | null;
  /** 是否已完成习惯 onboarding */
  hasCompletedHabitOnboarding: boolean;
}

/**
 * 登录成功后的统一数据同步管道。
 *
 * 依次执行：
 * 1. persistSessionToStorage — 将 session 写入 localStorage
 * 2. syncUserProfileToStorage — 从数据库同步用户资料到 localStorage
 * 3. 计算 userName / userPicture（localStorage 优先，user_metadata 兜底）
 * 4. bindAnalyticsUserSync — 绑定分析平台用户标识
 * 5. fetchHabitOnboardingCompleted — 查询 habit onboarding 状态
 *
 * @param params - 同步参数
 * @returns 同步结果（userName、userPicture、hasCompletedHabitOnboarding）
 */
export async function syncAfterLogin(params: SyncAfterLoginParams): Promise<SyncAfterLoginResult> {
  const { client, session, userId, source } = params;

  // 1. 将 session 写入 localStorage
  persistSessionToStorage(session);

  // 2. 从数据库同步用户资料到 localStorage
  await syncUserProfileToStorage(client, userId);

  // 3. 计算 userName / userPicture（localStorage 优先，user_metadata 兜底）
  const userName = localStorage.getItem('user_name')
    || session.user.user_metadata?.full_name
    || null;
  const userPicture = localStorage.getItem('user_picture')
    || session.user.user_metadata?.avatar_url
    || null;

  // 如果 localStorage 没有，用 user_metadata 的值写入（避免下次再查）
  if (userName && !localStorage.getItem('user_name')) {
    localStorage.setItem('user_name', userName);
  }
  if (userPicture && !localStorage.getItem('user_picture')) {
    localStorage.setItem('user_picture', userPicture);
  }

  // 4. 绑定分析平台用户标识
  await bindAnalyticsUserSync(userId, session.user.email);

  // 5. 查询 habit onboarding 状态
  const hasCompletedHabitOnboarding = (await fetchHabitOnboardingCompleted(
    client,
    userId,
    source,
  )) ?? false;

  // 6. 同步语言偏好：后端 → localStorage，或 localStorage → 后端
  try {
    const backendPrefs = await loadLanguagePreferencesFromBackend();
    if (!backendPrefs?.ui_language) {
      // 后端没有语言设置，将当前自动检测的 UI 语言同步到后端
      const currentLang = getUILanguage();
      console.log(`[PostLoginSync] 后端无语言设置，同步当前语言到后端: ${currentLang}`);
      syncLanguagePreferencesToBackend({ ui_language: currentLang });
    }
    // 同步到 iOS（供 Shield Extension 本地化推送通知）
    syncUILanguageToiOS();
  } catch (error) {
    console.warn('[PostLoginSync] 语言偏好同步失败:', error);
  }

  return { userName, userPicture, hasCompletedHabitOnboarding };
}
