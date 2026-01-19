/**
 * StatsView - 统计视图主组件
 * 展示 Routine 热力图与 Done 历史列表
 *
 * 拆分后的组件结构：
 * - StatsCard: 习惯统计卡片（src/components/stats/StatsCard.tsx）
 * - DoneHistoryView: 已完成任务历史（src/components/stats/DoneHistoryView.tsx）
 * - HeatmapDetailOverlay: 热力图详情弹窗（src/components/stats/HeatmapDetailOverlay.tsx）
 */

import React, { useState, useEffect, useMemo } from 'react';
import { getLocalDateString, getCategoryFromTimeString, getTimeIcon } from '../../utils/timeUtils';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { StatsHeader } from './StatsHeader';
import type { Task } from '../../remindMe/types';
import { fetchRecurringReminders, toggleReminderCompletion, updateReminder, deleteReminder } from '../../remindMe/services/reminderService';
import { getAllRoutineCompletions, markRoutineComplete, unmarkRoutineComplete } from '../../remindMe/services/routineCompletionService';

// 从拆分后的 stats 模块导入
import {
    StatsCard,
    DoneHistoryView,
    HeatmapDetailOverlay,
    taskToHabit,
    calculateCurrentStreak,
    buildDenseHistoryWithGaps,
} from '../stats';
import type { Habit, HabitTheme } from '../stats';

/**
 * StatsView Props
 * @param onToggleComplete - 可选回调，用于同步 tasks 表的 status 字段
 * @param refreshTrigger - 可选数字，变化时触发重新加载数据
 */
interface StatsViewProps {
    onToggleComplete?: (id: string, completed: boolean) => void;
    refreshTrigger?: number;
}

/**
 * 统计视图，展示 Routine 热力图与 Done 历史列表
 */
export const StatsView: React.FC<StatsViewProps> = ({ onToggleComplete, refreshTrigger }) => {
    const auth = useAuth();
    const { t } = useTranslation();
    const [habits, setHabits] = useState<Habit[]>([]);
    const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
    const [activeTab, setActiveTab] = useState<'routine' | 'done'>('routine');
    const [isLoading, setIsLoading] = useState(true);
    const [longestStreak, setLongestStreak] = useState(0);
    const [scrollTop, setScrollTop] = useState(0);
    const showStickyHeader = scrollTop > 80;

    // 示例习惯数据（用户没有习惯时展示）
    const exampleHabits = useMemo<Habit[]>(() => [
        {
            id: 'example-sleep',
            title: t('stats.goToBed'),
            timeLabel: '10:30 pm 🌙',
            time: '22:30',
            theme: 'pink',
            history: buildDenseHistoryWithGaps(120, [18], [7, 38, 61, 95]),
        },
        {
            id: 'example-wake',
            title: t('stats.wakeUp'),
            timeLabel: '7:00 am ☀️',
            time: '07:00',
            theme: 'gold',
            history: buildDenseHistoryWithGaps(120, [21], [15, 44, 73, 102]),
        },
        {
            id: 'example-workout',
            title: t('stats.workout'),
            timeLabel: '6:30 pm 💪',
            time: '18:30',
            theme: 'blue',
            history: buildDenseHistoryWithGaps(120, [20], [10, 37, 68, 99]),
        },
    ], [t]);

    const [exampleHabitsState, setExampleHabitsState] = useState<Habit[]>(exampleHabits);

    /**
     * 更新示例习惯的历史记录（仅本地状态）
     */
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

    // 加载 Routine 任务和完成历史
    useEffect(() => {
        const loadRoutineTasks = async () => {
            if (!auth.userId) {
                setIsLoading(false);
                return;
            }

            setIsLoading(true);
            try {
                // 获取所有 Routine 任务
                const routineTasks = await fetchRecurringReminders(auth.userId);
                // 获取所有完成历史
                const completionsMap = await getAllRoutineCompletions(auth.userId);
                // 转换为 Habit 格式
                const habitsData = routineTasks.map(task =>
                    taskToHabit(task, completionsMap.get(task.id) || new Set())
                );

                setHabits(habitsData);

                // 计算所有任务的「当前连续打卡天数」中的最大值
                let maxStreak = 0;
                habitsData.forEach(habit => {
                    const streak = calculateCurrentStreak(habit.history);
                    if (streak > maxStreak) {
                        maxStreak = streak;
                    }
                });
                setLongestStreak(maxStreak);

            } catch (error) {
                console.error('Failed to load routine tasks:', error);
            } finally {
                setIsLoading(false);
            }
        };

        void loadRoutineTasks();
    }, [auth.userId, refreshTrigger]);

    /**
     * 切换今天的完成状态
     * 同时更新：tasks 表、routine_completions 表、本地 UI 状态
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
            // 1. 更新 tasks 表的 status 字段
            await toggleReminderCompletion(id, newStatus);

            // 2. 更新 routine_completions 表（用于热力图历史）
            if (newStatus) {
                await markRoutineComplete(auth.userId, id, todayKey);
            } else {
                await unmarkRoutineComplete(auth.userId, id, todayKey);
            }

            // 3. 通知父组件同步状态
            if (onToggleComplete) {
                onToggleComplete(id, newStatus);
            }

            // 4. 更新本地状态
            setHabits(prev => prev.map(habit => {
                if (habit.id === id) {
                    const updatedHabit = {
                        ...habit,
                        history: { ...habit.history, [todayKey]: newStatus }
                    };
                    if (selectedHabit?.id === id) {
                        setSelectedHabit(updatedHabit);
                    }
                    return updatedHabit;
                }
                return habit;
            }));

            // 5. 重新计算连续打卡天数
            const updatedHistory = { ...currentHabit.history, [todayKey]: newStatus };
            let maxStreak = calculateCurrentStreak(updatedHistory);
            habits.forEach(habit => {
                if (habit.id === id) return;
                const streak = calculateCurrentStreak(habit.history);
                if (streak > maxStreak) {
                    maxStreak = streak;
                }
            });
            setLongestStreak(maxStreak);
        } catch (error) {
            console.error('Failed to toggle habit:', error);
        }
    };

    /**
     * 切换指定日期的完成状态（用于补打卡）
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
            // 更新 routine_completions 表
            if (newStatus) {
                await markRoutineComplete(auth.userId, id, dateKey);
            } else {
                await unmarkRoutineComplete(auth.userId, id, dateKey);
            }

            // 更新本地状态
            setHabits(prev => prev.map(habit => {
                if (habit.id === id) {
                    const updatedHabit = {
                        ...habit,
                        history: { ...habit.history, [dateKey]: newStatus }
                    };
                    if (selectedHabit?.id === id) {
                        setSelectedHabit(updatedHabit);
                    }
                    return updatedHabit;
                }
                return habit;
            }));

            // 重新计算连续打卡天数
            const updatedHistory = { ...currentHabit.history, [dateKey]: newStatus };
            let maxStreak = calculateCurrentStreak(updatedHistory);
            habits.forEach(habit => {
                if (habit.id === id) return;
                const streak = calculateCurrentStreak(habit.history);
                if (streak > maxStreak) {
                    maxStreak = streak;
                }
            });
            setLongestStreak(maxStreak);
        } catch (error) {
            console.error('Failed to toggle habit on date:', error);
        }
    };

    /**
     * 更新习惯（名称、时间）
     */
    const handleUpdateHabit = async (newName: string, newTime: string) => {
        if (!selectedHabit || selectedHabit.id.startsWith('example-')) return;

        try {
            // 根据时间计算 category
            const category = getCategoryFromTimeString(newTime);
            const icon = getTimeIcon(category);

            // 获取主题颜色
            const getTheme = (cat: Task['category']): HabitTheme => {
                if (cat === 'morning' || cat === 'noon') return 'gold';
                if (cat === 'afternoon') return 'blue';
                return 'pink';
            };

            // 格式化显示时间
            const [h] = newTime.split(':').map(Number);
            const h12 = h % 12 || 12;
            const [, m] = newTime.split(':');
            const period = h >= 12 ? 'pm' : 'am';
            const displayTime = `${h12}:${m} ${period}`;

            // 更新数据库
            await updateReminder(selectedHabit.id, {
                text: newName,
                time: newTime,
                displayTime,
                category
            });

            // 更新本地状态
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
    };

    /**
     * 删除习惯
     */
    const handleDeleteHabit = async () => {
        if (!selectedHabit) return;
        try {
            await deleteReminder(selectedHabit.id);
            setHabits(prev => prev.filter(h => h.id !== selectedHabit.id));
            setSelectedHabit(null);
        } catch (error) {
            console.error('Failed to delete habit:', error);
        }
    };

    return (
        <div className="flex-1 relative h-full overflow-hidden flex flex-col bg-white">
            {/* Sticky Top Bar */}
            <div className={`absolute top-0 left-0 right-0 bg-white z-50 flex items-end justify-start px-6 pb-3 pt-[59px] shadow-sm transition-all duration-300 ${showStickyHeader ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}`}>
                <span className="text-[24px] text-gray-900" style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 600 }}>
                    {t('stats.habitProgress')}
                </span>
            </div>

            {/* Scroll Container */}
            <div
                className="flex-1 overflow-y-auto no-scrollbar relative"
                data-tour="stats-area"
                onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            >
                {/* Stats Header */}
                <StatsHeader
                    activeTab={activeTab}
                    onTabChange={setActiveTab}
                    streak={isLoading ? 0 : longestStreak}
                />

                {/* Content */}
                <div className="px-4 pb-28 min-h-screen -mt-4 relative z-20">
                    {activeTab === 'routine' ? (
                        <div className="space-y-4 mt-2">
                            {isLoading ? (
                                <div className="text-center py-10 text-gray-400">
                                    <p className="font-serif italic text-lg">{t('common.loading')}</p>
                                </div>
                            ) : habits.length === 0 ? (
                                // 显示示例习惯
                                <div className="py-0 space-y-4 text-gray-700">
                                    <div data-tour="habit-record-example" className="space-y-4">
                                        <p className="text-center text-sm text-gray-500">{t('stats.exampleStreaksHint')}</p>
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
                    onUpdateHabit={handleUpdateHabit}
                    onDeleteHabit={selectedHabit.id.startsWith('example-') ? undefined : handleDeleteHabit}
                />
            )}
        </div>
    );
};
