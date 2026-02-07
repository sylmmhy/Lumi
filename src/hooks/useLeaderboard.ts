/**
 * useLeaderboard - 排行榜数据 Hook
 *
 * 调用 get-leaderboard Edge Function，支持：
 * - Public 排行榜（全服按 weekly_coins 排名）
 * - Friends 排行榜（好友间排名）
 * - 自动包含用户自己的排名（即使不在 Top N）
 * - 赛季信息（当前周数、剩余天数）
 */

import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/** 排行榜类型 */
export type LeaderboardType = 'public' | 'friends';

/** 排名条目 */
export interface RankingEntry {
  rank: number;
  user_id: string;
  display_name: string;
  avatar_emoji: string;
  weekly_coins: number;
  total_coins: number;
  is_me: boolean;
}

/** 排行榜数据 */
export interface LeaderboardData {
  rankings: RankingEntry[];
  user_rank: RankingEntry | null;
  season_week: string;
  season_ends_at: string;
  days_remaining: number;
}

interface UseLeaderboardReturn {
  /** 加载排行榜数据 */
  fetchLeaderboard: (
    userId: string,
    type: LeaderboardType,
    limit?: number
  ) => Promise<LeaderboardData | null>;

  /** 排行榜数据 */
  data: LeaderboardData | null;

  /** 是否正在加载 */
  isLoading: boolean;

  /** 当前排行榜类型 */
  currentType: LeaderboardType;

  /** 切换排行榜类型并刷新 */
  switchType: (userId: string, type: LeaderboardType) => Promise<void>;

  /** 刷新当前排行榜 */
  refresh: (userId: string) => Promise<void>;
}

/**
 * 排行榜数据 Hook
 *
 * @example
 * ```ts
 * const { data, isLoading, fetchLeaderboard, switchType } = useLeaderboard();
 *
 * // 初始加载
 * useEffect(() => {
 *   fetchLeaderboard(userId, 'public');
 * }, [userId]);
 *
 * // 切换到好友排行
 * await switchType(userId, 'friends');
 *
 * // 显示数据
 * data?.rankings.map(r => `${r.rank}. ${r.display_name}: ${r.weekly_coins} XP`);
 * ```
 */
export function useLeaderboard(): UseLeaderboardReturn {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentType, setCurrentType] = useState<LeaderboardType>('public');

  const fetchLeaderboard = useCallback(async (
    userId: string,
    type: LeaderboardType,
    limit?: number
  ): Promise<LeaderboardData | null> => {
    if (!supabase) {
      console.error('[useLeaderboard] Supabase not initialized');
      return null;
    }

    setIsLoading(true);
    setCurrentType(type);

    try {
      const { data: responseData, error } = await supabase.functions.invoke('get-leaderboard', {
        body: {
          user_id: userId,
          type,
          limit,
        },
      });

      if (error) {
        console.error('[useLeaderboard] Error:', error);
        return null;
      }

      const result = responseData as LeaderboardData;
      setData(result);
      return result;

    } catch (err) {
      console.error('[useLeaderboard] Unexpected error:', err);
      return null;

    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchType = useCallback(async (userId: string, type: LeaderboardType) => {
    await fetchLeaderboard(userId, type);
  }, [fetchLeaderboard]);

  const refresh = useCallback(async (userId: string) => {
    await fetchLeaderboard(userId, currentType);
  }, [fetchLeaderboard, currentType]);

  return {
    fetchLeaderboard,
    data,
    isLoading,
    currentType,
    switchType,
    refresh,
  };
}
