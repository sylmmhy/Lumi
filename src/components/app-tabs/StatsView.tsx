/**
 * StatsView - 统计页面主组件（蓄水池版重构）
 *
 * 设计理念：
 * - 去压力化：移除"连胜/断签"，只展示累计
 * - 视觉对比：顶部蓄水池（总览）vs 底部卡片（明细）
 * - 打卡联动：下方操作 → 上方充能 → Toast 激励
 */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { getLocalDateString, getCategoryFromTimeString, getTimeIcon } from '../../utils/timeUtils';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { StatsHeader } from './StatsHeader';
import type { Task } from '../../remindMe/types';
import { fetchRecurringReminders, toggleReminderCompletion, updateReminder, deleteReminder } from '../../remindMe/services/reminderService';
import { getAllRoutineCompletions, markRoutineComplete, unmarkRoutineComplete } from '../../remindMe/services/routineCompletionService';
import { getUserWeeklyCoins, getWeeklyCoinHistory, getHabitsTotalCompletions } from '../../remindMe/services/statsService';
import type { WeeklyCoinEntry } from '../../remindMe/services/statsService';

// 从 stats 模块导入组件和类型
import {
    StatsCard,
    DoneHistoryView,
    HeatmapDetailOverlay,
    CheckInToast,
    useCheckInToast,
    buildDenseHistoryWithGaps,
    EnergyBall,
    taskToHabit,
    calculateCurrentStreak,
} from '../stats';
import type { Habit, HabitTheme } from '../stats';

/**
 * StatsView Props
 */
interface StatsViewProps {
    /** 可选回调，用于同步 tasks 表的 status 字段 */
    onToggleComplete?: (id: string, completed: boolean) => void;
    /** 可选数字，变化时触发重新加载数据 */
    refreshTrigger?: number;
    /** 启动 AI Coach 任务的回调（传递习惯 ID 和名称） */
    onStartTask?: (habitId: string, habitTitle: string) => void;
    /** 外部触发打卡动画的计数器（每次递增时触发 EnergyBall 动画 + 音效 + Toast） */
    externalCheckInTrigger?: number;
}

/**
 * 统计视图主组件
 *
 * 功能：
 * 1. 顶部蓄水池：显示本周完成进度
 * 2. 习惯卡片：热力图 + 里程碑进度条
 * 3. 打卡联动：打卡时水位上涨 + Toast 激励
 */
export const StatsView: React.FC<StatsViewProps> = ({ onToggleComplete, refreshTrigger, onStartTask, externalCheckInTrigger }) => {
    const auth = useAuth();
    const { t } = useTranslation();

    // ========== 状态定义 ==========
    const [habits, setHabits] = useState<Habit[]>([]);
    const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
    const [activeTab, setActiveTab] = useState<'routine' | 'done'>('routine');
    const [isLoading, setIsLoading] = useState(true);

    // 存钱罐数据（本周金币余额 from users.weekly_coins）
    const [weeklyCount, setWeeklyCount] = useState(0);
    const [weeklyTarget] = useState(20);
    const [triggerRise, setTriggerRise] = useState(false);

    // 周切换状态
    const [weeklyHistory, setWeeklyHistory] = useState<WeeklyCoinEntry[]>([]);
    const [currentWeekIndex, setCurrentWeekIndex] = useState(0); // 0=本周

    // Streak 弹窗状态
    const [streakPill, setStreakPill] = useState<{ visible: boolean; count: number }>({ visible: false, count: 0 });

    // Toast 状态
    const { toastMessage, showToast, hideToast } = useCheckInToast();

    // StatsHeader 底部位置（用于动态定位金币盒子）
    const headerRef = useRef<HTMLDivElement>(null);
    const [headerBottom, setHeaderBottom] = useState(0);

    // 获取 StatsHeader 底部相对于视口的位置
    const updateHeaderPosition = useCallback(() => {
        if (headerRef.current) {
            const rect = headerRef.current.getBoundingClientRect();
            setHeaderBottom(rect.bottom);
        }
    }, []);

    useEffect(() => {
        // 延迟获取位置，确保渲染完成
        const timer = setTimeout(updateHeaderPosition, 50);
        window.addEventListener('resize', updateHeaderPosition);
        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', updateHeaderPosition);
        };
    }, [updateHeaderPosition]);

    // 外部触发打卡动画（verify 成功跳转过来时）— Duolingo 风格三阶段叠加
    const prevExternalTriggerRef = useRef(externalCheckInTrigger ?? 0);
    useEffect(() => {
        const prev = prevExternalTriggerRef.current;
        const curr = externalCheckInTrigger ?? 0;
        prevExternalTriggerRef.current = curr;

        // 只在计数器递增时触发动画（首次挂载 prev === curr 不触发）
        if (curr > prev) {
            // 阶段 1 (0ms)：金色光晕 + checkin 音效 + 黑色遮罩
            setTriggerRise(true);
            playCheckInSound();

            // 阶段 2 (800ms)：金币掉入 + coinDrop 音效 + 刷新真实 weeklyCount
            setTimeout(async () => {
                if (auth.userId) {
                    try {
                        const coins = await getUserWeeklyCoins(auth.userId);
                        setWeeklyCount(coins);
                    } catch { /* ignore */ }
                }
                playCoinDropSound();
            }, 800);

            // 阶段 3 (1800ms)：Streak 弹窗
            setTimeout(() => {
                // 从所有习惯中取最大 streak
                const maxStreak = habits.reduce((max, h) => {
                    const s = calculateCurrentStreak(h.history);
                    return s > max ? s : max;
                }, 0);
                if (maxStreak > 0) {
                    setStreakPill({ visible: true, count: maxStreak });
                    // 2s 后 fade out
                    setTimeout(() => setStreakPill({ visible: false, count: 0 }), 2000);
                }
            }, 1800);

            // 光晕持续 3.5s
            setTimeout(() => setTriggerRise(false), 3500);

            showToast();
        }
    }, [externalCheckInTrigger, auth.userId, showToast, habits]);

    /**
     * 播放打卡光晕音效
     */
    const playCheckInSound = () => {
        const audio = new Audio('/checkin-sound.mp3');
        audio.volume = 0.7;
        audio.play().catch(err => console.log('音效播放失败:', err));
    };

    /**
     * 播放硬币掉落音效
     */
    const playCoinDropSound = () => {
        const audio = new Audio('/coin-drop-sound.wav');
        audio.volume = 0.7;
        audio.play().catch(err => console.log('硬币音效播放失败:', err));
    };

    // 示例习惯数据
    const exampleHabits = useMemo<Habit[]>(() => [
        {
            id: 'example-sleep',
            title: t('stats.goToBed'),
            subtitle: '准时躺下就算赢',
            timeLabel: '10:30 pm',
            time: '22:30',
            theme: 'pink',
            history: buildDenseHistoryWithGaps(120, [18], [7, 38, 61, 95]),
            totalCompletions: 85,
        },
        {
            id: 'example-wake',
            title: t('stats.wakeUp'),
            subtitle: '睁眼就是胜利',
            timeLabel: '7:00 am',
            time: '07:00',
            theme: 'gold',
            history: buildDenseHistoryWithGaps(120, [21], [15, 44, 73, 102]),
            totalCompletions: 92,
        },
        {
            id: 'example-workout',
            title: t('stats.workout'),
            subtitle: '动 5 分钟也算赢',
            timeLabel: '6:30 pm',
            time: '18:30',
            theme: 'blue',
            history: buildDenseHistoryWithGaps(120, [20], [10, 37, 68, 99]),
            totalCompletions: 45,
        },
    ], [t]);

    const [exampleHabitsState, setExampleHabitsState] = useState<Habit[]>(exampleHabits);

    // ========== 示例数据处理 ==========
    const updateExampleHabitHistory = (habitId: string, dateKey: string, newStatus?: boolean) => {
        setExampleHabitsState(prev => prev.map(habit => {
            if (habit.id !== habitId) return habit;
            const updatedHistory = { ...habit.history };
            const nextStatus = newStatus !== undefined ? newStatus : !updatedHistory[dateKey];
            if (nextStatus) {
                updatedHistory[dateKey] = true;
            } else {
                delete updatedHistory[dateKey];
            }
            const updatedHabit = { ...habit, history: updatedHistory };
            if (selectedHabit?.id === habitId) {
                setSelectedHabit(updatedHabit);
            }
            return updatedHabit;
        }));
    };

    // ========== 数据加载 ==========
    useEffect(() => {
        const loadData = async () => {
            if (!auth.userId) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                // 1. 获取所有 Routine 任务
                const routineTasks = await fetchRecurringReminders(auth.userId);

                // 2. 获取所有完成历史
                const completionsMap = await getAllRoutineCompletions(auth.userId);

                // 3. 获取本周金币余额（存钱罐数据）
                const coins = await getUserWeeklyCoins(auth.userId);
                setWeeklyCount(coins);

                // 3b. 获取历史周金币数据（周切换用）
                // 过滤掉本周（本周已由 weeklyCount 实时显示）
                const allHistory = await getWeeklyCoinHistory(auth.userId);
                const now = new Date();
                const yearStart = new Date(now.getFullYear(), 0, 1);
                const weekNum = Math.ceil(((now.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
                const currentSeasonWeek = `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
                const pastHistory = allHistory.filter(e => e.week !== currentSeasonWeek);
                setWeeklyHistory(pastHistory);
                setCurrentWeekIndex(0);

                // 4. 批量获取累计完成次数（里程碑进度条数据）
                const habitIds = routineTasks.map(t => t.id);
                const totalCompletionsMap = await getHabitsTotalCompletions(auth.userId, habitIds);

                // 5. 转换为 Habit 格式
                const habitsData = routineTasks.map(task =>
                    taskToHabit(
                        task,
                        completionsMap.get(task.id) || new Set(),
                        totalCompletionsMap.get(task.id) || 0
                    )
                );

                setHabits(habitsData);
            } catch (error) {
                console.error('Failed to load stats data:', error);
            } finally {
                setIsLoading(false);
            }
        };

        void loadData();
    }, [auth.userId, refreshTrigger]);

    // ========== 打卡逻辑 ==========

    /**
     * 切换今天的完成状态
     */
    const toggleHabitToday = async (id: string) => {
        // 示例数据：仅本地更新
        if (id.startsWith('example-')) {
            const todayKey = getLocalDateString();
            updateExampleHabitHistory(id, todayKey);
            return;
        }

        if (!auth.userId) return;

        const todayKey = getLocalDateString();
        const currentHabit = habits.find(h => h.id === id);
        if (!currentHabit) return;

        const isCurrentlyCompleted = !!currentHabit.history[todayKey];
        const newStatus = !isCurrentlyCompleted;

        try {
            // 1. 更新 tasks 表
            await toggleReminderCompletion(id, newStatus);

            // 2. 更新 routine_completions 表
            if (newStatus) {
                await markRoutineComplete(auth.userId, id, todayKey);
            } else {
                await unmarkRoutineComplete(auth.userId, id, todayKey);
            }

            // 3. 通知父组件
            if (onToggleComplete) {
                onToggleComplete(id, newStatus);
            }

            // 4. 更新本地状态
            setHabits(prev => prev.map(habit => {
                if (habit.id === id) {
                    const updatedHabit = {
                        ...habit,
                        history: { ...habit.history, [todayKey]: newStatus },
                        totalCompletions: newStatus
                            ? (habit.totalCompletions || 0) + 1
                            : Math.max((habit.totalCompletions || 0) - 1, 0),
                    };
                    if (selectedHabit?.id === id) {
                        setSelectedHabit(updatedHabit);
                    }
                    return updatedHabit;
                }
                return habit;
            }));

            // 5. 更新存钱罐计数（取消打卡时刷新真实金币数）
            if (!newStatus && auth.userId) {
                getUserWeeklyCoins(auth.userId)
                    .then(coins => setWeeklyCount(coins))
                    .catch(() => setWeeklyCount(prev => Math.max(prev - 1, 0)));
            }
        } catch (error) {
            console.error('Failed to toggle habit:', error);
        }
    };

    /**
     * 打卡成功回调（联动存钱罐和 Toast）
     * @param habitId - 习惯 ID
     */
    const handleCheckIn = async (habitId: string) => {
        // 检查是否已经打卡
        const habit = habits.find(h => h.id === habitId);
        const todayKey = getLocalDateString();
        if (habit?.history[todayKey]) {
            return; // 今天已打卡，不重复
        }

        // 1. 调用 API 记录打卡
        await toggleHabitToday(habitId);

        // 2. 触发光晕动画（持续 3.5 秒）+ 播放音效
        setTriggerRise(true);
        playCheckInSound();
        setTimeout(() => setTriggerRise(false), 3500);

        // 3. 延迟 800ms 后，刷新真实金币数 + 播放硬币音效
        setTimeout(async () => {
            if (auth.userId) {
                try {
                    const coins = await getUserWeeklyCoins(auth.userId);
                    setWeeklyCount(coins);
                } catch {
                    // 回退到 +1
                    setWeeklyCount(prev => prev + 1);
                }
            }
            playCoinDropSound();
        }, 800);

        // 4. 显示 Toast
        showToast();
    };

    /**
     * 切换指定日期的完成状态（补打卡）
     */
    const toggleHabitOnDate = async (id: string, date: Date) => {
        if (id.startsWith('example-')) {
            const dateKey = getLocalDateString(date);
            updateExampleHabitHistory(id, dateKey);
            return;
        }

        if (!auth.userId) return;
        const dateKey = getLocalDateString(date);
        const todayKey = getLocalDateString();

        // 如果是今天，走 toggleHabitToday 逻辑
        if (dateKey === todayKey) {
            await toggleHabitToday(id);
            return;
        }

        // 如果是未来，不允许打卡
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);
        if (targetDate > now) return;

        const currentHabit = habits.find(h => h.id === id);
        if (!currentHabit) return;

        const isCompleted = !!currentHabit.history[dateKey];
        const newStatus = !isCompleted;

        try {
            if (newStatus) {
                await markRoutineComplete(auth.userId, id, dateKey);
            } else {
                await unmarkRoutineComplete(auth.userId, id, dateKey);
            }

            // 判断补打卡日期是否在当前月份，如果是则更新能量球计数
            const currentMonth = new Date();
            const isInCurrentMonth =
                targetDate.getFullYear() === currentMonth.getFullYear() &&
                targetDate.getMonth() === currentMonth.getMonth();

            if (isInCurrentMonth) {
                // 如果是打卡（非取消打卡），触发光晕动画、音效和 Toast
                if (newStatus) {
                    setTriggerRise(true);
                    playCheckInSound();
                    setTimeout(() => setTriggerRise(false), 3500);
                    // 延迟 800ms 后刷新真实金币数 + 播放硬币音效
                    setTimeout(async () => {
                        if (auth.userId) {
                            try {
                                const coins = await getUserWeeklyCoins(auth.userId);
                                setWeeklyCount(coins);
                            } catch {
                                setWeeklyCount(prev => prev + 1);
                            }
                        }
                        playCoinDropSound();
                    }, 800);
                    showToast();
                } else {
                    // 取消打卡时刷新真实金币数
                    if (auth.userId) {
                        getUserWeeklyCoins(auth.userId)
                            .then(coins => setWeeklyCount(coins))
                            .catch(() => setWeeklyCount(prev => Math.max(prev - 1, 0)));
                    }
                }
            }

            setHabits(prev => prev.map(habit => {
                if (habit.id === id) {
                    const updatedHabit = {
                        ...habit,
                        history: { ...habit.history, [dateKey]: newStatus },
                        totalCompletions: newStatus
                            ? (habit.totalCompletions || 0) + 1
                            : Math.max((habit.totalCompletions || 0) - 1, 0),
                    };
                    if (selectedHabit?.id === id) {
                        setSelectedHabit(updatedHabit);
                    }
                    return updatedHabit;
                }
                return habit;
            }));
        } catch (error) {
            console.error('Failed to toggle habit on date:', error);
        }
    };

    // ========== 周切换逻辑 ==========

    /** 当前显示的金币数（本周用实时 weeklyCount，历史周用 history） */
    const displayedWeeklyCount = useMemo(() => {
        if (currentWeekIndex === 0) return weeklyCount;
        // 历史周：index 0 = 最新周（history 降序排列）
        const entry = weeklyHistory[currentWeekIndex - 1];
        return entry?.coins ?? 0;
    }, [currentWeekIndex, weeklyCount, weeklyHistory]);

    /** 格式化赛季周标签 '2026-W06' → 'Feb 3 - Feb 9' */
    const formatWeekLabel = useCallback((seasonWeek: string): string => {
        const match = seasonWeek.match(/^(\d{4})-W(\d{2})$/);
        if (!match) return seasonWeek;
        const year = parseInt(match[1], 10);
        const week = parseInt(match[2], 10);
        // ISO week → Monday date
        const jan4 = new Date(year, 0, 4);
        const dayOfWeek = jan4.getDay() || 7;
        const monday = new Date(jan4);
        monday.setDate(jan4.getDate() - dayOfWeek + 1 + (week - 1) * 7);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${fmt(monday)} - ${fmt(sunday)}`;
    }, []);

    /** 当前显示的周标签 */
    const weekLabel = useMemo(() => {
        if (currentWeekIndex === 0) return 'This Week';
        const entry = weeklyHistory[currentWeekIndex - 1];
        return entry ? formatWeekLabel(entry.week) : 'This Week';
    }, [currentWeekIndex, weeklyHistory, formatWeekLabel]);

    /** 切换到上一周（更早） */
    const handlePrevWeek = useCallback(() => {
        // 最多可回退到 weeklyHistory.length 周前
        setCurrentWeekIndex(prev => Math.min(prev + 1, weeklyHistory.length));
    }, [weeklyHistory.length]);

    /** 切换到下一周（更近） */
    const handleNextWeek = useCallback(() => {
        setCurrentWeekIndex(prev => Math.max(prev - 1, 0));
    }, []);

    /** 是否可以往"下一周"（更近）方向切换 */
    const canGoNext = currentWeekIndex > 0;

    // ========== 渲染 ==========
    return (
        <div
            className="flex-1 relative h-full overflow-hidden flex flex-col"
            style={{ backgroundColor: '#F5F5F5' }}
        >
            {/* 打卡时的黑色遮罩 - 覆盖整个页面，只有存钱罐和光晕在上方 */}
            <div
                className={`fixed inset-0 bg-black/60 transition-opacity duration-300 pointer-events-none ${
                    triggerRise ? 'opacity-100' : 'opacity-0'
                }`}
                style={{ zIndex: 35 }}
            />

            {/* 存钱罐 - fixed 定位，打卡时在遮罩上方 */}
            {/* 位置：绿色区域底部边缘，一半在绿色区域一半在白色区域 */}
            <div
                className="fixed left-1/2 -translate-x-1/2 -translate-y-1/2"
                style={{
                    top: headerBottom,
                    zIndex: triggerRise ? 40 : 31,
                    opacity: headerBottom > 0 ? 1 : 0,
                }}
            >
                <EnergyBall
                    current={displayedWeeklyCount}
                    target={weeklyTarget}
                    triggerRise={currentWeekIndex === 0 && triggerRise}
                />
            </div>

            {/* Streak 弹窗 - 存钱罐下方 */}
            {streakPill.visible && (
                <div
                    className="fixed left-1/2 -translate-x-1/2"
                    style={{
                        top: headerBottom + 70,
                        zIndex: 41,
                        animation: 'streak-fade-in-out 2s ease-in-out forwards',
                    }}
                >
                    <div
                        className="px-4 py-2 rounded-full bg-orange-500/90 text-white text-sm font-bold shadow-lg"
                        style={{ fontFamily: "'Quicksand', sans-serif" }}
                    >
                        🔥 {streakPill.count}d streak!
                    </div>
                    <style>{`
                        @keyframes streak-fade-in-out {
                            0% { opacity: 0; transform: translateY(10px); }
                            15% { opacity: 1; transform: translateY(0); }
                            75% { opacity: 1; transform: translateY(0); }
                            100% { opacity: 0; transform: translateY(-5px); }
                        }
                    `}</style>
                </div>
            )}

            {/* 打卡成功 Toast */}
            <CheckInToast message={toastMessage} onClose={hideToast} />


            {/* 滚动容器 */}
            <div
                className="flex-1 overflow-y-auto no-scrollbar relative overscroll-none"
                data-tour="stats-area"
            >
                {/* 蓄水池头部 */}
                <StatsHeader
                    ref={headerRef}
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    weekLabel={weekLabel}
                    onPrevWeek={handlePrevWeek}
                    onNextWeek={handleNextWeek}
                    canGoNext={canGoNext}
                />

                {/* 内容区域 - pt-20 为悬挂的能量球留出空间 */}
                <div className="px-4 pb-28 min-h-screen pt-20 relative z-10">
                    {activeTab === 'routine' ? (
                        <div className="space-y-4 mt-2">
                            {isLoading ? (
                                <div className="text-center py-10 text-gray-400">
                                    <p className="font-serif italic text-lg">{t('common.loading')}</p>
                                </div>
                            ) : habits.length === 0 ? (
                                // 无习惯时显示示例
                                <div className="py-0 space-y-4 text-gray-700">
                                    <div data-tour="habit-record-example" className="space-y-4">
                                        <p className="text-center text-sm text-gray-500">
                                            {t('stats.exampleStreaksHint')}
                                        </p>
                                        <StatsCard
                                            key={exampleHabitsState[0].id}
                                            habit={exampleHabitsState[0]}
                                            onToggleToday={() => toggleHabitToday(exampleHabitsState[0].id)}
                                            onClickDetail={() => alert(t('home.exampleClickHint'))}
                                        />
                                    </div>
                                    <div className="space-y-4">
                                        {exampleHabitsState.slice(1).map(habit => (
                                            <StatsCard
                                                key={habit.id}
                                                habit={habit}
                                                onToggleToday={() => toggleHabitToday(habit.id)}
                                                onClickDetail={() => alert(t('home.exampleClickHint'))}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                // 显示用户习惯
                                habits.map((habit, index) => (
                                    <div
                                        key={habit.id}
                                        data-tour={index === 0 ? 'habit-record-example' : undefined}
                                    >
                                        <StatsCard
                                            habit={habit}
                                            onToggleToday={() => void toggleHabitToday(habit.id)}
                                            onClickDetail={() => setSelectedHabit(habit)}
                                            onCheckIn={handleCheckIn}
                                            onStartTask={onStartTask}
                                        />
                                    </div>
                                ))
                            )}
                        </div>
                    ) : (
                        <div className="mt-2">
                            <DoneHistoryView refreshTrigger={refreshTrigger} />
                        </div>
                    )}
                </div>
            </div>

            {/* 习惯详情弹窗 */}
            {selectedHabit && (
                <HeatmapDetailOverlay
                    habit={selectedHabit}
                    onClose={() => setSelectedHabit(null)}
                    onToggleDate={(date) => toggleHabitOnDate(selectedHabit.id, date)}
                    onUpdateHabit={async (newName: string, newTime: string) => {
                        if (selectedHabit.id.startsWith('example-')) return;

                        try {
                            const category = getCategoryFromTimeString(newTime);
                            const icon = getTimeIcon(category);

                            const getTheme = (cat: Task['category']): HabitTheme => {
                                if (cat === 'morning' || cat === 'noon') return 'gold';
                                if (cat === 'afternoon') return 'blue';
                                return 'pink';
                            };

                            const [h] = newTime.split(':').map(Number);
                            const h12 = h % 12 || 12;
                            const [, m] = newTime.split(':');
                            const period = h >= 12 ? 'pm' : 'am';
                            const displayTime = `${h12}:${m} ${period}`;

                            await updateReminder(selectedHabit.id, {
                                text: newName,
                                time: newTime,
                                displayTime,
                                category
                            });

                            const updatedHabit = {
                                ...selectedHabit,
                                title: newName,
                                time: newTime,
                                timeLabel: `${displayTime} ${icon}`,
                                theme: getTheme(category),
                            };

                            setHabits(prev => prev.map(h =>
                                h.id === selectedHabit.id ? updatedHabit : h
                            ));
                            setSelectedHabit(updatedHabit);
                        } catch (error) {
                            console.error('Failed to update habit:', error);
                        }
                    }}
                    onDeleteHabit={selectedHabit.id.startsWith('example-') ? undefined : async () => {
                        try {
                            await deleteReminder(selectedHabit.id);
                            setHabits(prev => prev.filter(h => h.id !== selectedHabit.id));
                            setSelectedHabit(null);
                        } catch (error) {
                            console.error('Failed to delete habit:', error);
                        }
                    }}
                />
            )}
        </div>
    );
};
