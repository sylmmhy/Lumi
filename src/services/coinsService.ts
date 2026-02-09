/**
 * 金币服务
 * 统一调用 get-coin-summary 和 set-leaderboard-opt-in Edge Functions
 */

import { supabase } from '../lib/supabase';

/**
 * 金币概览数据结构
 */
export interface CoinSummary {
    /** 是否参与排行榜 */
    leaderboard_opt_in: boolean;
    /** 本周公开金币（参与排行榜时计入） */
    weekly_public_coins: number;
    /** 本周私有金币（不参与排行榜时计入） */
    weekly_private_coins: number;
    /** 累计总金币 */
    total_coins: number;
    /** 当前赛季周标识（如 '2026-W06'） */
    season_week: string;
    /** 下次可切换排行榜开关的时间（ISO 格式） */
    next_opt_in_change_allowed_at: string;
}

/**
 * 获取用户金币概览
 *
 * @param userId - 用户 ID
 * @returns CoinSummary 对象
 */
export async function getCoinSummary(userId: string): Promise<CoinSummary> {
    if (!supabase) {
        throw new Error('Supabase client is not initialized');
    }

    const { data, error } = await supabase.functions.invoke('get-coin-summary', {
        body: { user_id: userId },
    });

    if (error) {
        console.error('Failed to get coin summary:', error);
        throw error;
    }

    return data as CoinSummary;
}

/**
 * 设置排行榜参与状态返回结构
 */
export interface SetOptInResult {
    success?: boolean;
    leaderboard_opt_in?: boolean;
    error?: string;
    next_opt_in_change_allowed_at?: string;
}

/**
 * 切换排行榜参与状态
 * 每 UTC 周只能切换一次
 *
 * @param userId - 用户 ID
 * @param optIn - 是否参与排行榜
 * @returns 切换结果
 */
export async function setLeaderboardOptIn(userId: string, optIn: boolean): Promise<SetOptInResult> {
    if (!supabase) {
        throw new Error('Supabase client is not initialized');
    }

    const { data, error } = await supabase.functions.invoke('set-leaderboard-opt-in', {
        body: { user_id: userId, opt_in: optIn },
    });

    if (error) {
        console.error('Failed to set leaderboard opt-in:', error);
        // Edge Function 返回 409 时，data 中仍包含错误信息
        if (data?.error) {
            return data as SetOptInResult;
        }
        throw error;
    }

    return data as SetOptInResult;
}
