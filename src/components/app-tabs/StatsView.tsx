/**
 * StatsView - 统计页面主组件（蓄水池版重构）
 *
 * 设计理念：
 * - 去压力化：移除"连胜/断签"，只展示累计
 * - 视觉对比：顶部蓄水池（总览）vs 底部卡片（明细）
 * - 打卡联动：下方操作 → 上方充能 → Toast 激励
 */

import React, { useState, useEffect, useMemo } from 'react';
import { getLocalDateString, getCategoryFromTimeString, getTimeIcon } from '../../utils/timeUtils';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { StatsHeader } from './StatsHeader';
import type { Task } from '../../remindMe/types';
import { fetchRecurringReminders, toggleReminderCompletion, updateReminder, deleteReminder } from '../../remindMe/services/reminderService';
import { getAllRoutineCompletions, markRoutineComplete, unmarkRoutineComplete } from '../../remindMe/services/routineCompletionService';
import { getWeeklyCompletedCount, getHabitsTotalCompletions } from '../../remindMe/services/statsService';

// 从 stats 模块导入组件和类型
import {
    StatsCard,
    DoneHistoryView,
    HeatmapDetailOverlay,
    CheckInToast,
    useCheckInToast,
    buildDenseHistoryWithGaps,
} from '../stats';
import type { Habit, HabitTheme } from '../stats';
import { StickyHeader } from './StickyHeader';

/**
 * 将 Task 和完成历史转换为 Habit 格式
 */
const taskToHabit = (task: Task, completions: Set<string>, totalCompletions?: number): Habit => {
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
        totalCompletions,
    };
};

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
}

/**
 * 统计视图主组件
 *
 * 功能：
 * 1. 顶部蓄水池：显示本周完成进度
 * 2. 习惯卡片：热力图 + 里程碑进度条
 * 3. 打卡联动：打卡时水位上涨 + Toast 激励
 */
export const StatsView: React.FC<StatsViewProps> = ({ onToggleComplete, refreshTrigger, onStartTask }) => {
    const auth = useAuth();
    const { t } = useTranslation();

    // ========== 状态定义 ==========
    const [habits, setHabits] = useState<Habit[]>([]);
    const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
    const [activeTab, setActiveTab] = useState<'routine' | 'done'>('routine');
    const [isLoading, setIsLoading] = useState(true);
    const [scrollTop, setScrollTop] = useState(0);

    // 存钱罐数据（本周习惯完成总次数）
    const [weeklyCount, setWeeklyCount] = useState(0);
    const [weeklyTarget] = useState(20); // 目标固定为 20
    const [triggerRise, setTriggerRise] = useState(false);

    // Toast 状态
    const { toastMessage, showToast, hideToast } = useCheckInToast();

    const showStickyHeader = scrollTop > 80;

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

                // 3. 获取本周完成数（存钱罐数据）
                const weeklyProgress = await getWeeklyCompletedCount(auth.userId);
                setWeeklyCount(weeklyProgress.current);

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
        } catch (error) {
            console.error('Failed to toggle habit:', error);
        }
    };

    /**
     * 打卡成功回调（联动能量球和 Toast）
     */
    const handleCheckIn = () => {
        // 1. 能量球 +1（乐观更新）
        setWeeklyCount(prev => prev + 1);

        // 2. 触发水位上涨动画
        setTriggerRise(true);
        setTimeout(() => setTriggerRise(false), 600);

        // 3. 显示 Toast
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
                // 更新能量球计数
                setWeeklyCount(prev => newStatus ? prev + 1 : Math.max(prev - 1, 0));

                // 如果是打卡（非取消打卡），触发水位上涨动画和 Toast
                if (newStatus) {
                    setTriggerRise(true);
                    setTimeout(() => setTriggerRise(false), 600);
                    showToast();
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

    // ========== 渲染 ==========
    return (
        <div
            className="flex-1 relative h-full overflow-hidden flex flex-col"
            style={{ backgroundColor: '#F5F5F5' }}
        >
            {/* 打卡成功 Toast */}
            <CheckInToast message={toastMessage} onClose={hideToast} />

            {/* Sticky 顶部栏 */}
            <StickyHeader
                title={t('stats.habitProgress')}
                bgColor="#429950"
                visible={showStickyHeader}
            />

            {/* 滚动容器 */}
            <div
                className="flex-1 overflow-y-auto no-scrollbar relative overscroll-none"
                data-tour="stats-area"
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
                {/* 蓄水池头部 */}
                <StatsHeader
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    weeklyCount={weeklyCount}
                    weeklyTarget={weeklyTarget}
                    triggerRise={triggerRise}
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
