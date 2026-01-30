import { useCallback, useEffect, useState } from 'react';
import { getSupabaseClient } from '../lib/supabase';

export interface TwoMinuteRuleState {
  /** 是否启用两分钟模式 */
  isActive: boolean;
  /** 当前难度等级 */
  currentLevel: 1 | 2 | 3 | 4 | 5;
  /** 建议时长（秒） */
  suggestedDuration: number;
  /** 达到该天数后升级 */
  streakToGraduate: number;
  /** 当前连续成功天数 */
  currentStreak: number;
  /** 推荐的微小动作 */
  tinyStepSuggestion: string;
}

const LEVEL_DURATIONS: Record<number, number> = {
  1: 120,
  2: 300,
  3: 600,
  4: 900,
  5: 0,
};

const TINY_STEPS: Record<string, string[]> = {
  sleep: ['把手机放到卧室外', '换上睡衣', '刷牙洗脸', '躺到床上', '关灯'],
  exercise: ['穿上运动鞋', '走出家门', '做10个开合跳', '走5分钟', '完整运动'],
  study: ['打开书本', '读一段', '做一道题', '复习笔记', '完整学习'],
};

/**
 * Two-Minute Rule Hook
 *
 * @description 为新手/受挫用户提供极简起步与进阶逻辑
 * @param goalId 目标 ID
 * @param userId 用户 ID（可选，用于写入进阶记录）
 */
export function useTwoMinuteRule(goalId: string, userId?: string) {
  const [state, setState] = useState<TwoMinuteRuleState | null>(null);

  useEffect(() => {
    if (!goalId) return;

    const fetchGoal = async () => {
      const supabase = getSupabaseClient();
      if (!supabase) return;

      const { data, error } = await supabase
        .from('goals')
        .select('two_minute_mode, difficulty_level, graduate_after_streak, consecutive_success, goal_type')
        .eq('id', goalId)
        .single();

      if (error || !data) return;

      const level = Math.min(5, Math.max(1, data.difficulty_level || 1)) as 1 | 2 | 3 | 4 | 5;
      const steps = TINY_STEPS[data.goal_type] || ['开始第一步'];
      const tinyStepSuggestion = steps[Math.min(level - 1, steps.length - 1)];

      setState({
        isActive: Boolean(data.two_minute_mode),
        currentLevel: level,
        suggestedDuration: LEVEL_DURATIONS[level],
        streakToGraduate: data.graduate_after_streak || 7,
        currentStreak: data.consecutive_success || 0,
        tinyStepSuggestion,
      });
    };

    void fetchGoal();
  }, [goalId]);

  /**
   * 获取当前用户 ID（优先使用传入参数）
   */
  const resolveUserId = useCallback(async () => {
    if (userId) return userId;
    const supabase = getSupabaseClient();
    if (!supabase) return null;
    const { data } = await supabase.auth.getUser();
    return data.user?.id || null;
  }, [userId]);

  /**
   * 检查是否需要升级难度
   */
  const checkGraduation = useCallback(async () => {
    if (!state) return false;
    if (state.currentStreak < state.streakToGraduate) return false;

    const supabase = getSupabaseClient();
    if (!supabase) return false;

    const nextLevel = Math.min(5, state.currentLevel + 1);

    await supabase
      .from('goals')
      .update({
        difficulty_level: nextLevel,
        two_minute_mode: nextLevel < 5,
      })
      .eq('id', goalId);

    const resolvedUserId = await resolveUserId();
    if (resolvedUserId) {
      await supabase
        .from('difficulty_progressions')
        .insert({
          goal_id: goalId,
          user_id: resolvedUserId,
          from_level: state.currentLevel,
          to_level: nextLevel,
          reason: 'streak_achieved',
        });
    }

    return true;
  }, [goalId, resolveUserId, state]);

  /**
   * 手动激活两分钟模式
   */
  const activate = useCallback(async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    await supabase
      .from('goals')
      .update({
        two_minute_mode: true,
        difficulty_level: 1,
      })
      .eq('id', goalId);
  }, [goalId]);

  return { state, checkGraduation, activate };
}
