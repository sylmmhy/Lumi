/**
 * Analytics Sync Module
 *
 * 负责同步用户身份到各个分析工具（Amplitude、PostHog）
 * 从 AuthContext 中拆分出来，保持单一职责
 */

import { setUserId, resetUser, setUserProperties } from '../../lib/amplitude';
import { resetPostHogUser } from '../../lib/posthog';

/**
 * 绑定用户身份到所有分析工具
 * 非阻塞执行，分析工具绑定失败不影响用户体验
 *
 * @param userId - 用户 ID
 * @param email - 用户邮箱（可选）
 */
export function bindAnalyticsUser(userId: string, email?: string | null): void {
  // 使用 void 确保不阻塞，分析工具绑定失败不影响用户体验
  void setUserId(userId);
  if (email) {
    void setUserProperties({ email });
  }
}

/**
 * 同步绑定用户身份（需要等待完成）
 * 用于登录成功后确保 Amplitude 已设置用户 ID
 *
 * @param userId - 用户 ID
 * @param email - 用户邮箱（可选）
 */
export async function bindAnalyticsUserSync(userId: string, email?: string | null): Promise<void> {
  await setUserId(userId);
  if (email) {
    void setUserProperties({ email });
  }
}

/**
 * 重置所有分析工具的用户身份
 * 在用户登出时调用
 */
export function resetAnalyticsUser(): void {
  resetUser(); // Amplitude
  resetPostHogUser(); // PostHog
}
