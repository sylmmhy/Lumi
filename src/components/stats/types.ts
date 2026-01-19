/**
 * 统计模块的共享类型定义
 * 用于 StatsView、StatsCard、HeatmapDetailOverlay 等组件
 */

import type { Task } from '../../remindMe/types';

/**
 * 习惯卡片的主题颜色
 * - gold: 金色（早晨/中午任务）
 * - blue: 蓝色（下午任务）
 * - pink: 粉色（晚上/深夜任务）
 */
export type HabitTheme = 'gold' | 'blue' | 'pink';

/**
 * 习惯数据结构
 * 用于热力图展示和统计
 */
export interface Habit {
    /** 习惯唯一标识 */
    id: string;
    /** 习惯标题 */
    title: string;
    /** 显示用的时间标签，如 "9:30 am ☀️" */
    timeLabel: string;
    /** 24小时格式的时间，如 "09:30" */
    time: string;
    /** 主题颜色 */
    theme: HabitTheme;
    /** 完成历史，key 为日期字符串 (YYYY-MM-DD)，value 为是否完成 */
    history: { [key: string]: boolean };
}

/**
 * 热力图单元格数据
 */
export interface HeatmapDay {
    /** 日期对象，null 表示未来日期（留空） */
    date: Date | null;
    /** 完成等级（0=未完成，1=已完成） */
    level: number;
    /** 是否是今天 */
    isToday: boolean;
}

/**
 * 热力图月份标签
 */
export interface MonthLabel {
    /** 月份名称，如 "Jan" */
    month: string;
    /** 所在列索引 */
    columnIndex: number;
}

/**
 * 日历单元格数据
 */
export interface CalendarDay {
    /** 日期数字（1-31），null 表示空白格 */
    date: number | null;
    /** 是否已完成 */
    isCompleted: boolean;
    /** 是否是今天 */
    isToday: boolean;
    /** 是否是未来日期 */
    isFuture: boolean;
}

/**
 * 主题颜色映射
 */
export const themeColorMap = {
    gold: {
        checkBg: 'bg-brand-goldBorder',
        checkBorder: 'border-brand-goldBorder',
        cellActive: 'bg-brand-heatmapGold',
    },
    blue: {
        checkBg: 'bg-brand-heatmapBlue',
        checkBorder: 'border-brand-heatmapBlue',
        cellActive: 'bg-brand-heatmapBlue',
    },
    pink: {
        checkBg: 'bg-brand-heatmapPink',
        checkBorder: 'border-brand-heatmapPink',
        cellActive: 'bg-brand-heatmapPink',
    }
};

/**
 * 将 Task 和完成历史转换为 Habit 格式
 * @param task - 任务对象
 * @param completions - 完成日期集合
 * @returns Habit 对象
 */
export const taskToHabit = (task: Task, completions: Set<string>): Habit => {
    const { getTimeIcon } = require('../../utils/timeUtils');

    // 将 Set 转换为 history 对象
    const history: { [key: string]: boolean } = {};
    completions.forEach(date => {
        history[date] = true;
    });

    // 根据时间分类选择主题颜色
    let theme: HabitTheme = 'gold';
    if (task.category === 'morning') theme = 'gold';
    else if (task.category === 'noon') theme = 'gold';
    else if (task.category === 'afternoon') theme = 'blue';
    else if (task.category === 'evening') theme = 'pink';
    else if (task.category === 'latenight') theme = 'pink';

    // 获取时间图标
    const icon = getTimeIcon(task.category || 'morning');

    return {
        id: task.id,
        title: task.text,
        timeLabel: `${task.displayTime} ${icon}`,
        time: task.time || '',
        theme,
        history,
    };
};
