/**
 * auth/useAuthLifecycle.ts - 认证生命周期 Hook (Part 1)
 *
 * 封装认证相关的 refs、applyNativeLogin、applyNativeLogout
 * 和 triggerSessionCheckNow。
 *
 * Part 2 (US-013) 将移入 restoreSession、onAuthStateChange 和定期检查逻辑。
 * Part 3 (US-014) 将移入 Native Bridge 和 storage 事件监听器。
 */

import {
  useCallback,
  useRef,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import type { AuthState, NativeAuthPayload } from '../AuthContextDefinition';
import { supabase } from '../../lib/supabase';
import { NATIVE_LOGIN_FLAG_KEY } from './storage';
import {
  canExecuteSetSession,
  acquireSetSessionLock,
  releaseSetSessionLock,
  isNetworkError,
} from './sessionLock';
import {
  parseNativeAuthPayload,
  isValidSupabaseUuid,
  isValidJwt,
  notifyAuthConfirmed,
} from './nativeAuthBridge';
import { syncUserProfileToStorage } from './userProfile';
import { fetchHabitOnboardingCompleted } from './habitOnboarding';
import { bindAnalyticsUserSync } from './analyticsSync';

// ==========================================
// 常量
// ==========================================

const SESSION_CHECK_DEBOUNCE_MS = 3000; // 3 秒内不重复检查

// ==========================================
// 类型定义
// ==========================================

/**
 * useAuthLifecycle 的参数
 */
export interface UseAuthLifecycleParams {
  /** React state setter */
  setAuthState: Dispatch<SetStateAction<AuthState>>;
  /** 从 localStorage 读取登录态并触发 habit onboarding 查询 */
  checkLoginState: () => { isLoggedIn: boolean; userId: string | null; sessionToken: string | null };
  /** 登出函数 */
  logout: () => Promise<void>;
}

/**
 * useAuthLifecycle 的返回值
 */
export interface UseAuthLifecycleReturn {
  /** 立即触发会话检查与修复 */
  triggerSessionCheckNow: (reason?: string) => Promise<void>;
  /** 应用原生登录态 */
  applyNativeLogin: (payload?: NativeAuthPayload) => Promise<void>;
  /** 应用原生登出 */
  applyNativeLogout: () => void;
  // ---- 以下 refs 临时暴露给 AuthContext 中尚未迁移的 useEffect ----
  // US-013/014 完成后将变为 hook 私有
  /** 是否已处理过原生登录事件 */
  hasHandledNativeLoginRef: MutableRefObject<boolean>;
  /** 是否正在处理原生登录 */
  isApplyingNativeLoginRef: MutableRefObject<boolean>;
  /** 最近一次原生登录开始时间 */
  lastNativeLoginStartedAtRef: MutableRefObject<number | null>;
  /** 原生登录态注入的启动期等待窗口截止时间 */
  nativeAuthBootstrapDeadlineRef: MutableRefObject<number | null>;
  /** onAuthStateChange 是否正在处理 */
  isOnAuthStateChangeProcessingRef: MutableRefObject<boolean>;
  /** setSession 是否触发了 onAuthStateChange */
  setSessionTriggeredAuthChangeRef: MutableRefObject<boolean>;
}

// ==========================================
// Hook 实现
// ==========================================

/**
 * 认证生命周期 Hook (Part 1)。
 *
 * 封装：
 * - 8 个生命周期 refs（互斥锁、时间戳、状态标记）
 * - applyNativeLogin / applyNativeLogout
 * - triggerSessionCheckNow
 *
 * @param params - Hook 参数
 * @returns 函数和暂时暴露的 refs
 */
export function useAuthLifecycle(params: UseAuthLifecycleParams): UseAuthLifecycleReturn {
  const { setAuthState, logout } = params;

  // ==========================================
  // Refs
  // ==========================================

  /**
   * 标记是否已处理过原生登录事件或原生登录态。
   * 原理：用于补偿检查，避免事件丢失时重复触发 applyNativeLogin。
   */
  const hasHandledNativeLoginRef = useRef(false);
  /** 防止 applyNativeLogin 被多次调用（Android 注入两次的问题） */
  const isApplyingNativeLoginRef = useRef(false);
  /**
   * 记录最近一次原生登录开始时间（时间戳）。
   * 原理：restoreSession 可能在 Supabase 会话尚未同步时返回空登录态，
   * 通过短时间窗口保护避免覆盖原生登录刚写入的状态。
   */
  const lastNativeLoginStartedAtRef = useRef<number | null>(null);
  /**
   * 原生登录态注入的启动期等待窗口（截止时间戳）。
   *
   * 背景：App 打开后 Native 会通过 JS 注入/CustomEvent 把登录态传进 WebView。
   * 但注入与网页监听器初始化存在时序竞争，偶发会出现：
   * - 网页先判定"未登录" → 路由触发 `navigateToLogin()` → iOS `userLogout` 被调用 → 原生侧被清空登录态（自动登出）
   *
   * 这里用一个短窗口在启动期"先等一等"，避免把"还没注入"误判成"已登出"。
   */
  const nativeAuthBootstrapDeadlineRef = useRef<number | null>(null);
  /** 用于追踪 onAuthStateChange 是否正在处理会话，防止 restoreSession 覆盖 */
  const isOnAuthStateChangeProcessingRef = useRef(false);
  /** 追踪 setSession 是否成功触发了 onAuthStateChange */
  const setSessionTriggeredAuthChangeRef = useRef(false);
  /** 会话检查互斥锁 */
  const sessionCheckMutexRef = useRef(false);
  /** 上次会话检查时间 */
  const lastSessionCheckTimeRef = useRef(0);

  // ==========================================
  // triggerSessionCheckNow
  // ==========================================

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

    // 【修复】互斥锁：同一时间只允许一个会话检查
    if (sessionCheckMutexRef.current) {
      console.log(`🔄 会话检查跳过: 已有检查正在执行 (${reason})`);
      return;
    }

    // 【修复】防抖：短时间内不重复检查
    const now = Date.now();
    const timeSinceLastCheck = now - lastSessionCheckTimeRef.current;
    if (timeSinceLastCheck < SESSION_CHECK_DEBOUNCE_MS) {
      console.log(`🔄 会话检查跳过: 距上次检查仅 ${timeSinceLastCheck}ms (${reason})`);
      return;
    }

    sessionCheckMutexRef.current = true;
    lastSessionCheckTimeRef.current = now;

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
      sessionCheckMutexRef.current = false;
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

        // 【修复】使用全局互斥锁，防止并发 setSession
        if (!canExecuteSetSession('triggerSessionCheckNow')) {
          console.log('🔄 定期检查：跳过 setSession，已有其他调用正在执行');
        } else {
          acquireSetSessionLock('triggerSessionCheckNow');
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
          } finally {
            releaseSetSessionLock('triggerSessionCheckNow');
          }
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
    } finally {
      // 【修复】释放互斥锁
      sessionCheckMutexRef.current = false;
    }
  }, []);

  // ==========================================
  // applyNativeLogin
  // ==========================================

  /**
   * 应用原生登录态。
   *
   * 处理 iOS/Android Native 端通过 JS Bridge 传入的登录信息，
   * 建立 Supabase 会话并同步用户资料。
   *
   * @param payload - 原生端传入的认证数据
   */
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

    // 【修复】移除 triggerSessionCheckNow 调用
    // 原因：applyNativeLogin 下面会直接调用 setSession，
    // 同时调用 triggerSessionCheckNow 会导致两个 setSession 并发，触发 refresh token 竞态
    // triggerSessionCheckNowRef.current?.('native_login'); // 已移除

    // 追踪 setSession 是否成功（会触发 onAuthStateChange）
    let setSessionSucceeded = false;

    if (supabase && accessToken && refreshToken) {
      // 注意：只验证 accessToken 是否为 JWT 格式
      // Supabase 的 refreshToken 不是 JWT，而是一个短随机字符串（如 "frmsy6zx3efo"）
      // 这是 Supabase 的设计，不是错误
      if (!isValidJwt(accessToken)) {
        console.warn('⚠️ 原生登录提供的 accessToken 不是有效的 JWT，已跳过 Supabase 会话设置');
      } else {
        // 【修复】使用全局互斥锁，防止与其他 setSession 调用并发
        if (!canExecuteSetSession('applyNativeLogin')) {
          console.log('🔐 applyNativeLogin: 跳过 setSession，已有其他调用正在执行');
        } else {
          acquireSetSessionLock('applyNativeLogin');
          try {
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
          } finally {
            releaseSetSessionLock('applyNativeLogin');
          }
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
      console.log('🔐 applyNativeLogin: 查询 hasCompletedHabitOnboarding...');
      hasCompletedHabitOnboarding = (await fetchHabitOnboardingCompleted(
        supabase,
        userId,
        'applyNativeLogin'
      )) ?? false;
      console.log('🔐 applyNativeLogin: hasCompletedHabitOnboarding =', hasCompletedHabitOnboarding);
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
    nativeAuthBootstrapDeadlineRef.current = null;
    isOnAuthStateChangeProcessingRef.current = false;
    isApplyingNativeLoginRef.current = false;

    notifyAuthConfirmed('session_set');
    console.log('🔐 applyNativeLogin: 完成, userId:', userId, 'hasCompletedHabitOnboarding:', hasCompletedHabitOnboarding);
  }, [setAuthState]);

  // ==========================================
  // applyNativeLogout
  // ==========================================

  /**
   * 应用原生登出。
   * 清除原生登录标记并调用 logout。
   */
  const applyNativeLogout = useCallback(() => {
    localStorage.removeItem(NATIVE_LOGIN_FLAG_KEY);
    void logout();
  }, [logout]);

  // ==========================================
  // 返回
  // ==========================================

  return {
    triggerSessionCheckNow,
    applyNativeLogin,
    applyNativeLogout,
    hasHandledNativeLoginRef,
    isApplyingNativeLoginRef,
    lastNativeLoginStartedAtRef,
    nativeAuthBootstrapDeadlineRef,
    isOnAuthStateChangeProcessingRef,
    setSessionTriggeredAuthChangeRef,
  };
}
