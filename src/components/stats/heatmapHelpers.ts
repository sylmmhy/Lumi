/**
 * 热力图相关的辅助函数
 * 包含数据生成、连续天数计算、日历数据等
 */

import { getLocalDateString } from '../../utils/timeUtils';
import type { HeatmapDay, MonthLabel, CalendarDay } from './types';

/**
 * 生成热力图数据（固定列数，今天在最右边）
 * @param history - 完成历史
 * @param columns - 列数（周数），默认 26 周
 * @returns 热力图数据，包含日期数组和月份标签位置
 */
export const getFixedHeatmapData = (
    history: { [key: string]: boolean },
    columns: number = 26
): { days: HeatmapDay[]; monthLabels: MonthLabel[] } => {
    const today = new Date();
    const todayKey = getLocalDateString(today);

    // 计算今天是周几（0=周一，6=周日）
    const todayDayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;

    const totalGridCells = columns * 7;
    const days: HeatmapDay[] = [];
    const monthLabels: MonthLabel[] = [];

    // 计算整个网格的起始日期（第一列的周一）
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - todayDayOfWeek);

    const startMonday = new Date(lastMonday);
    startMonday.setDate(lastMonday.getDate() - (columns - 1) * 7);

    let lastMonth = -1;
    const iterDate = new Date(startMonday);

    for (let i = 0; i < totalGridCells; i++) {
        const isFuture = iterDate > today;

        if (isFuture) {
            days.push({ date: null, level: 0, isToday: false });
        } else {
            const key = getLocalDateString(iterDate);
            const isDone = !!history[key];

            // 检测月份变化（只在每周第一天检测，或者是每月的1号所在周）
            if (iterDate.getDate() <= 7 && iterDate.getMonth() !== lastMonth) {
                const columnIndex = Math.floor(i / 7);
                // 避免标签过于拥挤，至少间隔2列
                const lastLabel = monthLabels[monthLabels.length - 1];
                if (!lastLabel || columnIndex - lastLabel.columnIndex > 2) {
                    lastMonth = iterDate.getMonth();
                    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                    monthLabels.push({
                        month: monthNames[iterDate.getMonth()],
                        columnIndex,
                    });
                }
            }

            days.push({
                date: new Date(iterDate),
                level: isDone ? 1 : 0,
                isToday: key === todayKey,
            });
        }

        iterDate.setDate(iterDate.getDate() + 1);
    }

    return { days, monthLabels };
};

/**
 * 计算当前连续打卡天数（从今天往前数）
 * @param history - 完成历史
 * @returns 连续天数
 */
export const calculateCurrentStreak = (history: { [key: string]: boolean }): number => {
    const today = new Date();
    let streak = 0;

    for (let i = 0; i < 365; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const key = getLocalDateString(date);

        if (history[key]) {
            streak++;
        } else {
            break;
        }
    }

    return streak;
};

/**
 * 生成月历数据
 * @param year - 年份
 * @param month - 月份（0-11）
 * @param history - 完成历史
 * @returns 日历单元格数组
 */
export const getCalendarData = (
    year: number,
    month: number,
    history: { [key: string]: boolean }
): CalendarDay[] => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const today = new Date();
    const todayKey = getLocalDateString(today);

    // 获取这个月第一天是周几（0=周日，1=周一...）
    const startDayOfWeek = firstDay.getDay();
    // 调整为周一开始（0=周一，6=周日）
    const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const days: CalendarDay[] = [];

    // 填充月初的空白
    for (let i = 0; i < adjustedStartDay; i++) {
        days.push({ date: null, isCompleted: false, isToday: false, isFuture: false });
    }

    // 填充日期
    for (let d = 1; d <= lastDay.getDate(); d++) {
        const dateObj = new Date(year, month, d);
        const key = getLocalDateString(dateObj);
        const isFuture = dateObj > today;

        days.push({
            date: d,
            isCompleted: !!history[key],
            isToday: key === todayKey,
            isFuture,
        });
    }

    return days;
};

/**
 * 构造示例热力图历史，使用相对日期的完成记录
 * @param completedOffsets - 以天为单位的偏移（0 表示今天，1 表示昨天）
 * @returns 示例完成历史
 */
export const buildExampleHistory = (completedOffsets: number[]): Record<string, boolean> => {
    const history: Record<string, boolean> = {};
    completedOffsets.forEach(offset => {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        history[getLocalDateString(date)] = true;
    });
    return history;
};

/**
 * 构造高密度示例历史：最近 totalDays 内几乎每日完成，仅在给定间隔/特定日略过形成空白
 * @param totalDays - 向前回溯的天数（从 0=今天 开始）
 * @param gapEvery - 周期性跳过的天数模式，例如 18 表示每 18 天缺一次
 * @param extraSkips - 额外指定的偏移天数，用于制造零星空格
 * @returns 示例完成历史
 */
export const buildDenseHistoryWithGaps = (
    totalDays: number,
    gapEvery: number[] = [],
    extraSkips: number[] = []
): Record<string, boolean> => {
    const extraSet = new Set(extraSkips);
    const offsets: number[] = [];
    for (let i = 0; i < totalDays; i++) {
        const hitPattern = gapEvery.some(interval => interval > 0 && i % interval === interval - 1);
        if (hitPattern || extraSet.has(i)) continue;
        offsets.push(i);
    }
    return buildExampleHistory(offsets);
};
