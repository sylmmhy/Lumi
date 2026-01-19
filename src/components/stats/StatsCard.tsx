/**
 * StatsCard - 习惯统计卡片组件
 *
 * 新版设计：
 * - 添加里程碑进度条（显示累计完成次数）
 * - 打卡按钮带弹跳动画
 * - 打卡成功时触发 onCheckIn 回调（用于联动蓄水池）
 */

import React, { useState } from 'react';
import { getLocalDateString } from '../../utils/timeUtils';
import { getFixedHeatmapData } from './heatmapHelpers';
import { MilestoneProgressBar } from './MilestoneProgressBar';
import type { Habit } from './types';
import { themeColorMap } from './types';

interface StatsCardProps {
    /** 习惯数据 */
    habit: Habit;
    /** 切换今天完成状态的回调 */
    onToggleToday: () => void;
    /** 点击查看详情的回调 */
    onClickDetail: () => void;
    /** 打卡成功回调（用于联动蓄水池和 Toast） */
    onCheckIn?: (habitId: string) => void;
}

/**
 * 习惯统计卡片
 *
 * 包含：
 * 1. 勾选框（带弹跳动画）
 * 2. 标题 + 时间标签
 * 3. 迷你热力图
 * 4. 里程碑进度条（新增）
 */
export const StatsCard: React.FC<StatsCardProps> = ({
    habit,
    onToggleToday,
    onClickDetail,
    onCheckIn,
}) => {
    const todayKey = getLocalDateString();
    const isTodayDone = !!habit.history[todayKey];
    const { days } = getFixedHeatmapData(habit.history, 16);

    // 打卡按钮弹跳动画状态
    const [isAnimating, setIsAnimating] = useState(false);

    const currentTheme = themeColorMap[habit.theme];

    /**
     * 处理打卡点击
     * 1. 触发弹跳动画
     * 2. 调用 onToggleToday
     * 3. 如果是从未完成→完成，触发 onCheckIn
     */
    const handleCheckIn = () => {
        // 触发弹跳动画
        setIsAnimating(true);
        setTimeout(() => setIsAnimating(false), 300);

        // 切换完成状态
        onToggleToday();

        // 如果是新完成（之前未完成），触发 onCheckIn
        if (!isTodayDone && onCheckIn) {
            onCheckIn(habit.id);
        }
    };

    return (
        <div
            className="bg-white rounded-2xl p-5 shadow-[0_2px_15px_rgba(0,0,0,0.04)] border border-gray-100 cursor-pointer"
            onClick={onClickDetail}
        >
            {/* 卡片头部：勾选框 + 标题 + 时间标签 */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    {/* 今日完成勾选框（带弹跳动画） */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleCheckIn();
                        }}
                        className={`
                            w-6 h-6 rounded border-[2px] flex items-center justify-center
                            transition-all duration-200 cursor-pointer
                            ${currentTheme.checkBorder}
                            ${isTodayDone ? currentTheme.checkBg : 'hover:bg-gray-50'}
                            ${isAnimating ? 'scale-125' : 'scale-100'}
                        `}
                    >
                        {isTodayDone && <i className="fa-solid fa-check text-white text-xs"></i>}
                    </button>
                    {/* 习惯标题 */}
                    <h3 className="text-gray-800 font-bold text-lg">{habit.title}</h3>
                </div>
                {/* 时间标签 */}
                <span className="text-xs font-serif italic px-3 py-1 rounded-full bg-brand-cream text-gray-700 font-semibold">
                    {habit.timeLabel}
                </span>
            </div>

            {/* 迷你热力图（16周） */}
            <div className="grid grid-rows-7 grid-flow-col gap-1 h-[90px] overflow-hidden">
                {days.map((day, i) => (
                    <div
                        key={i}
                        title={day.date ? day.date.toDateString() : ''}
                        className={`
                            w-2.5 h-2.5 rounded-[3px] transition-colors duration-200
                            ${day.level > 0 ? currentTheme.cellActive : 'bg-[#F0F0F0]'}
                            ${!day.date ? 'opacity-0' : ''}
                        `}
                    />
                ))}
            </div>

            {/* 里程碑进度条（新增） */}
            {habit.totalCompletions !== undefined && (
                <MilestoneProgressBar
                    totalCount={habit.totalCompletions}
                    theme={habit.theme}
                />
            )}
        </div>
    );
};

export default StatsCard;
