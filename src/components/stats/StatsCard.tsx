/**
 * StatsCard - 能量启动卡片组件
 *
 * 新版设计理念（截图版）：
 * - 左侧：习惯名称 + 轻量化启动引导语
 * - 右侧：3D 风格 Start 按钮（黄/橙色，有厚度）
 * - 底部：每周打卡进度（周一到周日的7个圆圈，完成显示金币）
 */

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { getLocalDateString } from '../../utils/timeUtils';
import { calculateCurrentStreak } from './heatmapHelpers';
import { useTranslation } from '../../hooks/useTranslation';
import type { Habit } from './types';

interface StatsCardProps {
    /** 习惯数据 */
    habit: Habit;
    /** 切换今天完成状态的回调 */
    onToggleToday: () => void;
    /** 点击查看详情的回调 */
    onClickDetail: () => void;
    /** 打卡成功回调（用于联动存钱罐和 Toast） */
    onCheckIn?: (habitId: string) => Promise<void>;
    /** 启动 AI Coach 任务的回调（传递习惯 ID 和名称） */
    onStartTask?: (habitId: string, habitTitle: string) => void;
}

/**
 * 默认的轻量化启动引导语
 * 使用 i18n 翻译函数根据习惯标题关键词匹配对应引导语
 *
 * @param title - 习惯标题
 * @param t - 翻译函数
 * @returns 对应语言的引导语
 */
const getDefaultSubtitle = (title: string, t: (key: string) => string): string => {
    const lowerTitle = title.toLowerCase();

    if (lowerTitle.includes('阅读') || lowerTitle.includes('read')) {
        return t('stats.subtitle.reading');
    }
    if (lowerTitle.includes('运动') || lowerTitle.includes('workout') || lowerTitle.includes('exercise')) {
        return t('stats.subtitle.exercise');
    }
    if (lowerTitle.includes('冥想') || lowerTitle.includes('meditat')) {
        return t('stats.subtitle.meditation');
    }
    if (lowerTitle.includes('写') || lowerTitle.includes('write') || lowerTitle.includes('journal')) {
        return t('stats.subtitle.writing');
    }
    if (lowerTitle.includes('学') || lowerTitle.includes('learn') || lowerTitle.includes('study')) {
        return t('stats.subtitle.learning');
    }
    if (lowerTitle.includes('睡') || lowerTitle.includes('sleep') || lowerTitle.includes('bed')) {
        return t('stats.subtitle.sleep');
    }
    if (lowerTitle.includes('起') || lowerTitle.includes('wake') || lowerTitle.includes('morning')) {
        return t('stats.subtitle.wake');
    }

    return t('stats.subtitle.default');
};

/**
 * 获取本周的日期数组（周一到周日）
 * @returns 本周每天的日期字符串数组（YYYY-MM-DD 格式）
 */
const getThisWeekDays = (): string[] => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = 周日, 1 = 周一, ...
    // 计算本周周一的日期（如果今天是周日，则往前推6天）
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(today);
    monday.setDate(today.getDate() + mondayOffset);

    const days: string[] = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        days.push(getLocalDateString(date));
    }
    return days;
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
    const { t } = useTranslation();

    // 周几标签（从 i18n 获取）
    const weekdayLabels = [
        t('stats.mon'), t('stats.tue'), t('stats.wed'), t('stats.thu'),
        t('stats.fri'), t('stats.sat'), t('stats.sun')
    ];

    // 动画状态
    const [isPressed, setIsPressed] = useState(false);
    const [showConfetti] = useState(false);
    // 取消打卡确认弹窗状态
    const [showCancelConfirm, setShowCancelConfirm] = useState(false);

    // 获取引导语
    const subtitle = habit.subtitle || getDefaultSubtitle(habit.title, t);

    // 获取本周的打卡进度
    const thisWeekDays = getThisWeekDays();

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

    /**
     * 处理今天圆圈点击
     * - 未完成：直接打卡
     * - 已完成：弹出确认取消弹窗
     */
    const handleTodayCircleClick = async (e: React.MouseEvent) => {
        e.stopPropagation();

        if (isTodayDone) {
            // 已完成，显示取消确认弹窗
            setShowCancelConfirm(true);
        } else {
            // 未完成，直接打卡
            if (onCheckIn) {
                await onCheckIn(habit.id);
            }
        }
    };

    /**
     * 确认取消打卡
     */
    const handleConfirmCancel = () => {
        setShowCancelConfirm(false);
        if (onToggleToday) {
            onToggleToday();
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
                                🔥 {streakDays}{t('stats.streakDayUnit')}
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

            {/* 下半部分：每周打卡进度（周一到周日） */}
            <div className="flex items-center justify-between">
                {thisWeekDays.map((dateKey, index) => {
                    const isCompleted = !!habit.history[dateKey];
                    const isToday = dateKey === todayKey;

                    return (
                        <div
                            key={dateKey}
                            className="flex flex-col items-center gap-1"
                        >
                            {/* 周几标签 */}
                            <span
                                className={`text-xs font-medium ${
                                    isToday ? 'text-amber-500' : 'text-gray-400'
                                }`}
                            >
                                {weekdayLabels[index]}
                            </span>
                            {/* 打卡状态圆圈 - 今天的可点击 */}
                            <div
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform ${
                                    isCompleted
                                        ? ''
                                        : isToday
                                          ? 'border-2 border-amber-400 bg-amber-50'
                                          : 'border-2 border-gray-200 bg-gray-50'
                                } ${isToday ? 'cursor-pointer active:scale-90' : ''}`}
                                onClick={isToday ? handleTodayCircleClick : undefined}
                            >
                                {isCompleted ? (
                                    <img
                                        src="/coins.png"
                                        alt="完成"
                                        className="w-8 h-8 object-contain"
                                    />
                                ) : null}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 取消打卡确认弹窗 - 使用 Portal 渲染到 body */}
            {showCancelConfirm && createPortal(
                <div
                    className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowCancelConfirm(false);
                    }}
                >
                    <div
                        className="bg-white rounded-2xl p-6 mx-6 max-w-sm w-full shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-gray-800 mb-2">
                            {t('stats.cancelCheckIn.title')}
                        </h3>
                        <p className="text-gray-500 text-sm mb-6">
                            {t('stats.cancelCheckIn.message')}
                        </p>
                        <div className="flex gap-3">
                            <button
                                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-medium"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowCancelConfirm(false);
                                }}
                            >
                                {t('stats.cancelCheckIn.keep')}
                            </button>
                            <button
                                className="flex-1 py-2.5 rounded-xl bg-red-500 text-white font-medium"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleConfirmCancel();
                                }}
                            >
                                {t('stats.cancelCheckIn.cancel')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

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
