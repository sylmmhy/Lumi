/**
 * StatsCard - 习惯统计卡片组件
 * 展示单个习惯的热力图和完成状态
 */

import React from 'react';
import { getLocalDateString } from '../../utils/timeUtils';
import { getFixedHeatmapData } from './heatmapHelpers';
import type { Habit } from './types';
import { themeColorMap } from './types';

interface StatsCardProps {
    /** 习惯数据 */
    habit: Habit;
    /** 切换今天完成状态的回调 */
    onToggleToday: () => void;
    /** 点击查看详情的回调 */
    onClickDetail: () => void;
}

/**
 * 习惯统计卡片
 * 包含：勾选框、标题、时间标签、迷你热力图
 */
export const StatsCard: React.FC<StatsCardProps> = ({ habit, onToggleToday, onClickDetail }) => {
    const todayKey = getLocalDateString();
    const isTodayDone = !!habit.history[todayKey];
    const { days } = getFixedHeatmapData(habit.history, 16);

    const currentTheme = themeColorMap[habit.theme];

    return (
        <div
            className="bg-white rounded-2xl p-5 shadow-[0_2px_15px_rgba(0,0,0,0.04)] border border-gray-100 cursor-pointer"
            onClick={onClickDetail}
        >
            {/* 卡片头部：勾选框 + 标题 + 时间标签 */}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    {/* 今日完成勾选框 */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleToday();
                        }}
                        className={`w-6 h-6 rounded border-[2px] flex items-center justify-center transition-colors cursor-pointer ${currentTheme.checkBorder} ${isTodayDone ? currentTheme.checkBg : 'hover:bg-gray-50'}`}
                    >
                        {isTodayDone && <i className="fa-solid fa-check text-white text-xs"></i>}
                    </button>
                    {/* 习惯标题 */}
                    <h3 className="text-gray-800 font-bold text-lg">{habit.title}</h3>
                </div>
                {/* 时间标签 */}
                <span className={`text-xs font-serif italic px-3 py-1 rounded-full bg-brand-cream text-gray-700 font-semibold`}>
                    {habit.timeLabel}
                </span>
            </div>

            {/* 迷你热力图（16周） */}
            <div className="grid grid-rows-7 grid-flow-col gap-1 h-[90px] overflow-hidden">
                {days.map((day, i) => (
                    <div
                        key={i}
                        title={day.date ? day.date.toDateString() : ''}
                        className={`w-2.5 h-2.5 rounded-[3px] transition-colors duration-200 ${day.level > 0 ? currentTheme.cellActive : 'bg-[#F0F0F0]'} ${!day.date ? 'opacity-0' : ''}`}
                    ></div>
                ))}
            </div>
        </div>
    );
};

export default StatsCard;
