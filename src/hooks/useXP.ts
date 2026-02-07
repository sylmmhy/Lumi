/**
 * useXP - XP 发放 Hook
 *
 * 调用 award-xp Edge Function，支持：
 * - 任务完成 XP
 * - Session 完成 XP
 * - 连续天数奖励（自动检测）
 * - 抵抗拖延奖励
 *
 * 内置去重机制，同一 task + source 不会重复发放。
 */

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/** XP 来源类型 */
export type XPSource =
  | 'task_complete'
  | 'session_complete'
  | 'visual_verification'
  | 'photo_verification'
  | 'streak_bonus'
  | 'resistance_bonus';

/** XP 发放明细 */
interface XPBreakdownItem {
  source: XPSource;
  amount: number;
  status: 'awarded' | 'duplicate';
}

/** XP 发放结果 */
export interface XPAwardResult {
  total_xp_awarded: number;
  breakdown: XPBreakdownItem[];
  weekly_total: number;
  total_xp: number;
  streak_days: number;
}

interface UseXPReturn {
  /** 发放 XP */
  awardXP: (
    userId: string,
    taskId: string,
    sources: XPSource[],
    metadata?: Record<string, unknown>
  ) => Promise<XPAwardResult | null>;

  /** 是否正在发放 */
  isAwarding: boolean;

  /** 最近一次发放结果 */
  lastAward: XPAwardResult | null;
}

/**
 * XP 发放 Hook
 *
 * @example
 * ```ts
 * const { awardXP, isAwarding, lastAward } = useXP();
 *
 * // 任务 + Session 完成
 * await awardXP(userId, taskId, ['task_complete', 'session_complete']);
 *
 * // 查看结果
 * console.log(lastAward?.total_xp_awarded); // 150 (100 + 50)
 * ```
 */
export function useXP(): UseXPReturn {
  const [isAwarding, setIsAwarding] = useState(false);
  const [lastAward, setLastAward] = useState<XPAwardResult | null>(null);

  const awardXP = useCallback(async (
    userId: string,
    taskId: string,
    sources: XPSource[],
    metadata?: Record<string, unknown>
  ): Promise<XPAwardResult | null> => {
    if (!supabase) {
      console.error('[useXP] Supabase not initialized');
      return null;
    }

    if (sources.length === 0) {
      console.warn('[useXP] No sources provided, skipping');
      return null;
    }

    setIsAwarding(true);

    try {
      const { data, error } = await supabase.functions.invoke('award-xp', {
        body: {
          user_id: userId,
          task_id: taskId,
          sources,
          metadata,
        },
      });

      if (error) {
        console.error('[useXP] Error:', error);
        return null;
      }

      const result = data as XPAwardResult;
      setLastAward(result);
      return result;

    } catch (err) {
      console.error('[useXP] Unexpected error:', err);
      return null;

    } finally {
      setIsAwarding(false);
    }
  }, []);

  return {
    awardXP,
    isAwarding,
    lastAward,
  };
}
