import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 从 `public.users` 表查询用户是否已完成 Habit Onboarding。
 *
 * 设计目标：
 * - ✅ 统一查询逻辑，避免在多处复制粘贴（降低 AuthContext 复杂度）。
 * - ✅ 查询失败时不抛错（登录链路不能被引导状态查询阻断）。
 *
 * @param supabase - Supabase 客户端实例
 * @param userId - 用户 ID
 * @param source - 调用来源标识（用于日志定位）
 * @returns 是否已完成 Habit Onboarding；失败时返回 false
 */
export async function fetchHabitOnboardingCompleted(
  supabase: SupabaseClient,
  userId: string,
  source: string = 'fetchHabitOnboardingCompleted',
  fallback: boolean | null = false
): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('has_completed_habit_onboarding')
      .eq('id', userId)
      .single();

    if (error) {
      console.warn(`⚠️ ${source}: 获取 habit onboarding 状态失败:`, error);
      return fallback;
    }

    return data?.has_completed_habit_onboarding ?? false;
  } catch (err) {
    console.warn(`⚠️ ${source}: 获取 habit onboarding 状态异常:`, err);
    return fallback;
  }
}
