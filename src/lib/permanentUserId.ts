/**
 * 永久设备用户 ID（PUID）工具函数。
 *
 * 用途：
 * - 用于分析工具（Amplitude/PostHog）跨账号、跨会话关联“同一个设备上的人”。
 *
 * 注意：
 * - 这不是 Supabase Auth 的 user_id（账号 ID）。
 * - localStorage 可能在某些环境不可用（隐私模式/被禁用）。本工具会尽量不让应用崩溃。
 */

/**
 * 永久设备用户 ID 在 localStorage 中存储的 key。
 */
export const PERMANENT_USER_ID_STORAGE_KEY = 'firego_permanent_user_id'

/**
 * 读取永久设备用户 ID。
 *
 * @returns {string | null} 已存在的 PUID；若不存在或 localStorage 不可用则返回 null
 */
export function getPermanentUserId(): string | null {
  try {
    return localStorage.getItem(PERMANENT_USER_ID_STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * 获取或生成永久设备用户 ID（PUID）。
 *
 * 生成规则：
 * - 形如 `puid_${Date.now()}_${random}`，仅用于分析关联（不用于安全/鉴权）。
 *
 * @returns {string} 永久设备用户 ID（PUID）
 */
export function getOrCreatePermanentUserId(): string {
  const existing = getPermanentUserId()
  if (existing) return existing

  const newId = `puid_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  try {
    localStorage.setItem(PERMANENT_USER_ID_STORAGE_KEY, newId)
  } catch {
    // localStorage 可能不可用；此时返回临时 ID，保持应用可运行。
  }
  return newId
}

