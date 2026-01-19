/**
 * StatsCard - 能量启动卡片组件
 *
 * 新版设计理念（截图版）：
 * - 左侧：习惯名称 + 轻量化启动引导语
 * - 右侧：3D 风格 Start 按钮（黄/橙色，有厚度）
 * - 底部：累计经验进度条 + Level 显示
 */

import React, { useState } from 'react';
import { getLocalDateString } from '../../utils/timeUtils';
import { calculateCurrentStreak } from './heatmapHelpers';
import type { Habit } from './types';

interface StatsCardProps {
    /** 习惯数据 */
    habit: Habit;
    /** 切换今天完成状态的回调 */
    onToggleToday: () => void;
    /** 点击查看详情的回调 */
    onClickDetail: () => void;
    /** 打卡成功回调（用于联动蓄水池和 Toast） */
    onCheckIn?: (habitId: string) => void;
    /** 启动 AI Coach 任务的回调（传递习惯 ID 和名称） */
    onStartTask?: (habitId: string, habitTitle: string) => void;
}

/**
 * 检测字符串是否包含中文字符
 * @param text - 要检测的字符串
 * @returns 是否包含中文字符
 */
const containsChinese = (text: string): boolean => {
    // 匹配中文字符范围（包括常用汉字、扩展汉字等）
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
};

/**
 * 默认的轻量化启动引导语
 * 根据习惯标题的语言自动选择对应语言的引导语
 *
 * @param title - 习惯标题
 * @returns 对应语言的引导语
 */
const getDefaultSubtitle = (title: string): string => {
    const lowerTitle = title.toLowerCase();
    const isChinese = containsChinese(title);

    // 阅读相关
    if (lowerTitle.includes('阅读') || lowerTitle.includes('read')) {
        return isChinese ? '读 1 页也算赢' : 'Reading 1 page counts as a win';
    }
    // 运动相关
    if (lowerTitle.includes('运动') || lowerTitle.includes('workout') || lowerTitle.includes('exercise')) {
        return isChinese ? '动 5 分钟也算赢' : '5 minutes of movement counts';
    }
    // 冥想相关
    if (lowerTitle.includes('冥想') || lowerTitle.includes('meditat')) {
        return isChinese ? '静坐 1 分钟也算赢' : '1 minute of stillness counts';
    }
    // 写作相关
    if (lowerTitle.includes('写') || lowerTitle.includes('write') || lowerTitle.includes('journal')) {
        return isChinese ? '写 1 句话也算赢' : 'Writing 1 sentence counts';
    }
    // 学习相关
    if (lowerTitle.includes('学') || lowerTitle.includes('learn') || lowerTitle.includes('study')) {
        return isChinese ? '学 5 分钟也算赢' : '5 minutes of learning counts';
    }
    // 睡眠相关
    if (lowerTitle.includes('睡') || lowerTitle.includes('sleep') || lowerTitle.includes('bed')) {
        return isChinese ? '准时躺下就算赢' : 'Getting to bed on time is a win';
    }
    // 早起相关
    if (lowerTitle.includes('起') || lowerTitle.includes('wake') || lowerTitle.includes('morning')) {
        return isChinese ? '睁眼就是胜利' : 'Opening your eyes is victory';
    }

    // 默认引导语
    return isChinese ? '开始就是胜利' : 'Starting is winning';
};

/**
 * 根据累计次数计算当前等级和下一等级目标
 * 等级里程碑：1, 5, 15, 30, 50, 80, 120, 170, 230, 300...
 */
const getLevelInfo = (totalCompletions: number): { level: number; current: number; target: number } => {
    // 等级对应的累计次数要求（到达该次数升级）
    const levelThresholds = [0, 1, 5, 15, 30, 50, 80, 120, 170, 230, 300, 400, 500, 650, 800, 1000];

    let level = 1;
    for (let i = 1; i < levelThresholds.length; i++) {
        if (totalCompletions >= levelThresholds[i]) {
            level = i + 1;
        } else {
            break;
        }
    }

    // 当前等级的起始值
    const currentLevelStart = levelThresholds[level - 1] || 0;
    // 下一等级的目标值
    const nextLevelTarget = levelThresholds[level] || currentLevelStart + 100;

    return {
        level,
        current: totalCompletions - currentLevelStart,
        target: nextLevelTarget - currentLevelStart,
    };
};

/**
 * 能量启动卡片
 */
export const StatsCard: React.FC<StatsCardProps> = ({
    habit,
    onToggleToday,
    onClickDetail,
    onCheckIn,
    onStartTask,
}) => {
    const todayKey = getLocalDateString();
    const isTodayDone = !!habit.history[todayKey];

    // 动画状态
    const [isPressed, setIsPressed] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);

    // 获取引导语
    const subtitle = habit.subtitle || getDefaultSubtitle(habit.title);

    // 获取等级信息（基于累计完成次数）
    const totalCompletions = habit.totalCompletions || 0;
    const { level, current, target } = getLevelInfo(totalCompletions);
    const progress = Math.min(current / target, 1);

    // 计算连胜天数（复用 heatmapHelpers 中的统一逻辑）
    const streakDays = calculateCurrentStreak(habit.history);

    /**
     * 处理启动按钮点击
     * - 未完成：启动 AI Coach 任务
     * - 已完成：当天不再触发任何操作（金币只是展示）
     */
    const handleStart = (e: React.MouseEvent) => {
        e.stopPropagation();

        if (isTodayDone) {
            // 已完成，当天点击金币不做任何操作
            return;
        }

        // 按下动画
        setIsPressed(true);
        setTimeout(() => setIsPressed(false), 150);

        // 启动 AI Coach 任务（传递习惯 ID 和名称，用于完成时更新正确的习惯记录）
        if (onStartTask) {
            onStartTask(habit.id, habit.title);
        }
    };

    return (
        <div
            className="bg-white rounded-3xl p-5 cursor-pointer"
            style={{
                boxShadow: '0 4px 20px rgba(0, 0, 0, 0.06)',
                border: '1px solid rgba(0, 0, 0, 0.04)',
            }}
            onClick={onClickDetail}
        >
            {/* 上半部分：标题 + 启动按钮 */}
            <div className="flex items-center justify-between mb-6">
                {/* 左侧：标题 + 引导语 */}
                <div className="flex-1 min-w-0 pr-4">
                    <h3 className="text-gray-800 font-bold text-xl flex items-center gap-2">
                        <span className="truncate">{habit.title}</span>
                        {streakDays > 0 && (
                            <span
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap"
                                style={{
                                    background: 'rgba(255, 200, 100, 0.35)',
                                    color: '#B8860B',
                                }}
                            >
                                🔥 {streakDays}{containsChinese(habit.title) ? '天' : 'd'}
                            </span>
                        )}
                    </h3>
                    <p className="text-gray-400 text-sm mt-1 truncate">
                        {subtitle}
                    </p>
                </div>

                {/* 右侧：3D Start 按钮 */}
                <div className="relative flex-shrink-0">
                    {/* 粒子爆炸效果 */}
                    {showConfetti && (
                        <div className="absolute inset-0 pointer-events-none z-10">
                            {[...Array(12)].map((_, i) => (
                                <span
                                    key={i}
                                    className="absolute confetti-particle"
                                    style={{
                                        left: '50%',
                                        top: '50%',
                                        ['--angle' as string]: `${i * 30}deg`,
                                        ['--color' as string]: ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8'][i % 6],
                                    }}
                                />
                            ))}
                        </div>
                    )}

                    {isTodayDone ? (
                        /* 完成状态：金币图标（当天不可再次充能） */
                        <div className="w-14 h-14 flex items-center justify-center">
                            <img
                                src="/coins.png"
                                alt="Completed"
                                className="w-14 h-14 object-contain"
                            />
                        </div>
                    ) : (
                        /* 未完成状态：绿色 3D Start 按钮图片 */
                        <button
                            onClick={handleStart}
                            className={`w-16 h-16 transition-all duration-150 ${isPressed ? 'scale-95' : 'hover:scale-105'}`}
                        >
                            <img
                                src="/start-button.png"
                                alt="Start"
                                className="w-full h-full object-contain"
                            />
                        </button>
                    )}
                </div>
            </div>

            {/* 下半部分：累计经验进度条 + Level */}
            <div className="flex items-center gap-3">
                {/* 进度条 */}
                <div className="flex-1 relative">
                    <div
                        className="h-7 rounded-full overflow-hidden"
                        style={{ backgroundColor: '#F0F0F0' }}
                    >
                        {/* 进度填充 */}
                        <div
                            className="h-full rounded-full transition-all duration-500 ease-out"
                            style={{
                                width: `${progress * 100}%`,
                                background: 'linear-gradient(90deg, #FFD966 0%, #E6A800 100%)',
                            }}
                        />
                    </div>
                    {/* 进度文字 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-gray-600 font-medium text-sm">
                            {current} / {target}
                        </span>
                    </div>
                </div>

                {/* Level 标签 */}
                <div className="flex-shrink-0">
                    <span className="text-gray-600 font-semibold text-sm">
                        Level {level}
                    </span>
                </div>
            </div>

            {/* CSS 动画 */}
            <style>{`
                @keyframes confetti-burst {
                    0% {
                        opacity: 1;
                        transform: translate(-50%, -50%) rotate(var(--angle)) translateX(0) scale(1);
                    }
                    100% {
                        opacity: 0;
                        transform: translate(-50%, -50%) rotate(var(--angle)) translateX(60px) scale(0.3);
                    }
                }
                .confetti-particle {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    background: var(--color);
                    animation: confetti-burst 0.8s ease-out forwards;
                }
            `}</style>
        </div>
    );
};

export default StatsCard;
