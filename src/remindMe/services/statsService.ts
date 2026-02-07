/**
 * 统计数据服务
 * 用于获取蓄水池和里程碑进度条所需的数据
 */

import { supabase } from '../../lib/supabase';

/**
 * 本周进度数据结构
 */
export interface WeeklyProgress {
    /** 当前完成数 */
    current: number;
    /** 目标数 */
    target: number;
    /** 本周起始日期 (ISO) */
    weekStart: string;
}

/**
 * 本月进度数据结构
 */
export interface MonthlyProgress {
    /** 当前完成数 */
    current: number;
    /** 目标数 */
    target: number;
    /** 本月起始日期 (ISO) */
    monthStart: string;
}

/**
 * 获取本周一的日期（00:00:00）
 * @returns Date 本周一的日期对象
 */
const getThisMonday = (): Date => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=周日
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(now);
    monday.setDate(now.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);
    return monday;
};

/**
 * 获取本月第一天的日期（00:00:00）
 * @returns Date 本月第一天的日期对象
 */
const getThisMonthStart = (): Date => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    return monthStart;
};

/**
 * 获取本周完成的任务数量（蓄水池数据）
 *
 * 说明：
 * - "本周"定义为周一 00:00:00 到当前时间
 * - 统计所有 status='completed' 且 completed_at 在本周内的任务
 * - 使用现有索引 idx_tasks_user_completed 优化查询
 *
 * @param userId - 用户 ID
 * @param target - 目标数，默认 20
 * @returns WeeklyProgress 对象，包含 current 和 target
 */
export async function getWeeklyCompletedCount(
    userId: string,
    target: number = 20
): Promise<WeeklyProgress> {
    if (!supabase) {
        throw new Error('Supabase client is not initialized');
    }
    const monday = getThisMonday();
    const mondayDateStr = monday.toISOString().split('T')[0]; // YYYY-MM-DD 格式

    const { count, error } = await supabase
        .from('routine_completions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('completion_date', mondayDateStr);

    if (error) {
        console.error('Failed to get weekly completed count:', error);
        throw error;
    }

    return {
        current: count || 0,
        target,
        weekStart: monday.toISOString(),
    };
}

/**
 * 获取本月完成的习惯总次数（能量球数据）
 *
 * 说明：
 * - "本月"定义为本月第一天 00:00:00 到当前时间
 * - 统计 routine_completions 表中本月内的所有完成记录
 * - 这是用户本月所有习惯完成的总次数
 *
 * @param userId - 用户 ID
 * @param target - 目标数，默认 20
 * @returns MonthlyProgress 对象，包含 current 和 target
 */
export async function getMonthlyCompletedCount(
    userId: string,
    target: number = 20
): Promise<MonthlyProgress> {
    if (!supabase) {
        throw new Error('Supabase client is not initialized');
    }
    const monthStart = getThisMonthStart();

    const { count, error } = await supabase
        .from('routine_completions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('completion_date', monthStart.toISOString().split('T')[0]); // completion_date 是 DATE 类型

    if (error) {
        console.error('Failed to get monthly completed count:', error);
        throw error;
    }

    return {
        current: count || 0,
        target,
        monthStart: monthStart.toISOString(),
    };
}

/**
 * 历史周金币数据结构
 */
export interface WeeklyCoinEntry {
    /** 赛季周标识，格式如 '2026-W06' */
    week: string;
    /** 该周金币总数 */
    coins: number;
}

/**
 * 获取用户当前周金币数（从 users.weekly_coins）
 *
 * @param userId - 用户 ID
 * @returns 当前周金币数
 */
export async function getUserWeeklyCoins(userId: string): Promise<number> {
    if (!supabase) {
        throw new Error('Supabase client is not initialized');
    }

    const { data, error } = await supabase
        .from('users')
        .select('weekly_coins')
        .eq('id', userId)
        .single();

    if (error) {
        console.error('Failed to get user weekly coins:', error);
        throw error;
    }

    return data?.weekly_coins ?? 0;
}

/**
 * 获取用户历史每周金币（从 coins_ledger 按 season_week 聚合，最近 12 周）
 *
 * @param userId - 用户 ID
 * @returns 按周排序的金币数组（最近的在前）
 */
export async function getWeeklyCoinHistory(userId: string): Promise<WeeklyCoinEntry[]> {
    if (!supabase) {
        throw new Error('Supabase client is not initialized');
    }

    const { data, error } = await supabase
        .from('coins_ledger')
        .select('season_week, amount')
        .eq('user_id', userId);

    if (error) {
        console.error('Failed to get weekly coin history:', error);
        throw error;
    }

    // 按 season_week 分组求和
    const weekMap = new Map<string, number>();
    data?.forEach(row => {
        const current = weekMap.get(row.season_week) ?? 0;
        weekMap.set(row.season_week, current + (row.amount ?? 0));
    });

    // 转换为数组，按周降序排序，取最近 12 周
    const entries: WeeklyCoinEntry[] = Array.from(weekMap.entries())
        .map(([week, coins]) => ({ week, coins }))
        .sort((a, b) => b.week.localeCompare(a.week))
        .slice(0, 12);

    return entries;
}

/**
 * 获取习惯的累计完成次数（用于里程碑进度条）
 *
 * 说明：
 * - 统计 routine_completions 表中该习惯的总记录数
 * - 这个数字永不清零，用于展示用户的长期积累
 *
 * @param userId - 用户 ID
 * @param habitId - 习惯（Routine 任务）ID
 * @returns 累计完成次数
 */
export async function getHabitTotalCompletions(
    userId: string,
    habitId: string
): Promise<number> {
    if (!supabase) {
        throw new Error('Supabase client is not initialized');
    }
    const { count, error } = await supabase
        .from('routine_completions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('task_id', habitId);

    if (error) {
        console.error('Failed to get habit total completions:', error);
        throw error;
    }

    return count || 0;
}

/**
 * 批量获取多个习惯的累计完成次数
 *
 * @param userId - 用户 ID
 * @param habitIds - 习惯 ID 数组
 * @returns Map<habitId, totalCompletions>
 */
export async function getHabitsTotalCompletions(
    userId: string,
    habitIds: string[]
): Promise<Map<string, number>> {
    if (!supabase) {
        throw new Error('Supabase client is not initialized');
    }
    const result = new Map<string, number>();

    // 初始化所有习惯为 0
    habitIds.forEach(id => result.set(id, 0));

    if (habitIds.length === 0) {
        return result;
    }

    // 使用单次查询获取所有习惯的完成记录
    const { data, error } = await supabase
        .from('routine_completions')
        .select('task_id')
        .eq('user_id', userId)
        .in('task_id', habitIds);

    if (error) {
        console.error('Failed to get habits total completions:', error);
        throw error;
    }

    // 统计每个习惯的完成次数
    data?.forEach(row => {
        const currentCount = result.get(row.task_id) || 0;
        result.set(row.task_id, currentCount + 1);
    });

    return result;
}
