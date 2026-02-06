/**
 * auth/sessionLock.ts - setSession 互斥锁与防抖
 *
 * 防止并发 refresh token 竞态条件。
 * 当 iOS WebView 从挂起恢复时，多处代码可能同时调用 setSession，
 * 并发调用会导致 refresh token 被重复使用，触发
 * "refresh_token_already_used" 错误。
 *
 * 本模块提供模块级全局锁，确保同一时间只有一个 setSession 调用在执行。
 */

// ==========================================
// 常量
// ==========================================

/** 防抖窗口：同一时间段内不重复调用 setSession（毫秒） */
export const GLOBAL_SET_SESSION_DEBOUNCE_MS = 2000;

// ==========================================
// 内部状态
// ==========================================

let globalSetSessionInProgress = false;
let lastGlobalSetSessionTime = 0;

// ==========================================
// 函数
// ==========================================

/**
 * 检查是否可以执行 setSession（全局互斥锁 + 防抖）。
 *
 * @param caller - 调用者名称（用于日志）
 * @returns true 如果可以执行，false 如果应该跳过
 */
export function canExecuteSetSession(caller: string): boolean {
  const now = Date.now();
  const timeSinceLastCall = now - lastGlobalSetSessionTime;

  // 检查防抖
  if (timeSinceLastCall < GLOBAL_SET_SESSION_DEBOUNCE_MS) {
    console.log(`🔐 setSession (${caller}): 跳过，距上次调用仅 ${timeSinceLastCall}ms`);
    return false;
  }

  // 检查互斥锁
  if (globalSetSessionInProgress) {
    console.log(`🔐 setSession (${caller}): 跳过，已有 setSession 正在执行`);
    return false;
  }

  return true;
}

/**
 * 获取全局 setSession 锁。
 *
 * @param caller - 调用者名称（用于日志）
 */
export function acquireSetSessionLock(caller: string): void {
  globalSetSessionInProgress = true;
  lastGlobalSetSessionTime = Date.now();
  console.log(`🔐 setSession (${caller}): 获取锁`);
}

/**
 * 释放全局 setSession 锁。
 *
 * @param caller - 调用者名称（用于日志）
 */
export function releaseSetSessionLock(caller: string): void {
  globalSetSessionInProgress = false;
  console.log(`🔐 setSession (${caller}): 释放锁`);
}

/**
 * 判断错误是否是网络相关错误（而非 token 真正失效）。
 * 网络错误时不应强制登出，应保留本地状态等待重试。
 *
 * @param error - 包含 message 和/或 code 的错误对象
 * @returns true 如果是网络错误
 */
export function isNetworkError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || '').toLowerCase();
  const code = (error.code || '').toLowerCase();

  // 网络相关错误关键词
  // 注意：iOS WebKit 网络失败的错误信息是 "TypeError: Load failed"，必须包含 'load failed'
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
    'load failed',
  ];

  return networkErrorPatterns.some(pattern => msg.includes(pattern) || code.includes(pattern));
}

/**
 * 重置锁状态（仅用于测试）。
 */
export function _resetForTesting(): void {
  globalSetSessionInProgress = false;
  lastGlobalSetSessionTime = 0;
}
