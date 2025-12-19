import React, { useState, useEffect, useMemo } from 'react';
import { getLocalDateString } from '../../utils/timeUtils';
import { useAuth } from '../../hooks/useAuth';
import { StatsHeader } from './StatsHeader';
import type { Task } from '../../remindMe/types';
import { fetchRecurringReminders, toggleReminderCompletion, fetchCompletedTodoTasks } from '../../remindMe/services/reminderService';
import { getAllRoutineCompletions, markRoutineComplete, unmarkRoutineComplete } from '../../remindMe/services/routineCompletionService';

type HabitTheme = 'gold' | 'blue' | 'pink';

interface Habit {
    id: string;
    title: string;
    timeLabel: string; // e.g., "9:30 am ☀️"
    theme: HabitTheme;
    // History is a map of date string (YYYY-MM-DD) to boolean (completed)
    history: { [key: string]: boolean };
}

const DoneHistoryView: React.FC<{ refreshTrigger?: number }> = ({ refreshTrigger }) => {
    const auth = useAuth();
    const [historyGroups, setHistoryGroups] = useState<{ dateLabel: string; tasks: Task[] }[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadHistory = async () => {
            if (!auth.userId) return;
            setIsLoading(true);
            try {
                const tasks = await fetchCompletedTodoTasks(auth.userId);

                // Group by date
                const groups: { [key: string]: Task[] } = {};
                tasks.forEach(task => {
                    // Use reminder_date if available, otherwise fallback to today (using local date)
                    const dateStr = task.date || getLocalDateString();
                    if (!groups[dateStr]) {
                        groups[dateStr] = [];
                    }
                    groups[dateStr].push(task);
                });

                // Sort dates descending and format
                const sortedGroups = Object.keys(groups)
                    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())
                    .map(dateStr => {
                        const date = new Date(dateStr);
                        // Format: "Apr 12 . Wed"
                        const month = date.toLocaleDateString('en-US', { month: 'short' });
                        const day = date.getDate();
                        const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
                        return {
                            dateLabel: `${month} ${day} . ${weekday}`,
                            tasks: groups[dateStr]
                        };
                    });

                setHistoryGroups(sortedGroups);
            } catch (error) {
                console.error('Failed to load done history:', error);
            } finally {
                setIsLoading(false);
            }
        };

        void loadHistory();
    }, [auth.userId, refreshTrigger]);

    if (isLoading) {
        return (
            <div className="text-center py-10 text-gray-400">
                <p className="font-serif italic text-lg">Loading history...</p>
            </div>
        );
    }

    if (historyGroups.length === 0) {
        return (
            <div className="text-center py-10 text-gray-400">
                <p className="font-serif italic text-lg">No completed tasks yet.</p>
                <p className="text-sm mt-2">Complete some tasks in the Home tab!</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in-up">
            {historyGroups.map((group, idx) => (
                <div key={idx}>
                    <div className="bg-brand-cream inline-block px-4 py-2 rounded-lg mb-4 mx-2">
                        <h3 className="font-serif text-2xl text-[#3A3A3A] italic font-bold">
                            {group.dateLabel}
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {group.tasks.map(task => (
                            <div key={task.id} className="bg-gray-50 rounded-2xl p-4 flex items-center justify-between opacity-80 border border-gray-100">
                                <div className="flex items-center gap-4">
                                    <div className="w-6 h-6 rounded border-[2px] border-brand-goldBorder bg-brand-goldBorder flex items-center justify-center">
                                        <i className="fa-solid fa-check text-white text-xs"></i>
                                    </div>
                                    <span className="text-lg text-gray-700 font-medium line-through decoration-brand-blue/50">
                                        {task.text}
                                    </span>
                                </div>
                                <div className="bg-brand-cream px-3 py-1 rounded-md">
                                    <span className="text-sm font-bold text-gray-800 italic font-serif flex items-center gap-1">
                                        {task.displayTime} <span className="text-brand-goldBorder">☀️</span>
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
};

/**
 * 将 Task 和完成历史转换为 Habit 格式
 */
const taskToHabit = (task: Task, completions: Set<string>): Habit => {
    // 将 Set 转换为 history 对象
    const history: { [key: string]: boolean } = {};
    completions.forEach(date => {
        history[date] = true;
    });

    // 根据时间分类选择主题颜色
    let theme: HabitTheme = 'gold';
    if (task.category === 'morning') theme = 'gold';
    else if (task.category === 'afternoon') theme = 'blue';
    else if (task.category === 'evening') theme = 'pink';

    // 获取时间图标
    const icon = task.category === 'morning' ? '☀️' : task.category === 'afternoon' ? '🌤️' : '🌙';

    return {
        id: task.id,
        title: task.text,
        timeLabel: `${task.displayTime} ${icon}`,
        theme,
        history,
    };
};

/**
 * 构造示例热力图历史，使用相对日期的完成记录。
 *
 * @param {number[]} completedOffsets - 以天为单位的偏移（0 表示今天，1 表示昨天）
 * @returns {Record<string, boolean>} 示例完成历史
 */
const buildExampleHistory = (completedOffsets: number[]): Record<string, boolean> => {
    const history: Record<string, boolean> = {};
    completedOffsets.forEach(offset => {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        history[getLocalDateString(date)] = true;
    });
    return history;
};

/**
 * 构造高密度示例历史：最近 totalDays 内几乎每日完成，仅在给定间隔/特定日略过形成空白。
 *
 * @param {number} totalDays - 向前回溯的天数（从 0=今天 开始）
 * @param {number[]} gapEvery - 周期性跳过的天数模式，例如 18 表示每 18 天缺一次
 * @param {number[]} extraSkips - 额外指定的偏移天数，用于制造零星空格
 * @returns {Record<string, boolean>} 示例完成历史
 */
const buildDenseHistoryWithGaps = (totalDays: number, gapEvery: number[] = [], extraSkips: number[] = []): Record<string, boolean> => {
    const extraSet = new Set(extraSkips);
    const offsets: number[] = [];
    for (let i = 0; i < totalDays; i++) {
        const hitPattern = gapEvery.some(interval => interval > 0 && i % interval === interval - 1);
        if (hitPattern || extraSet.has(i)) continue;
        offsets.push(i);
    }
    return buildExampleHistory(offsets);
};

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
 * 统计视图，展示 Routine 热力图与 Done 历史列表。
 *
 * @param {StatsViewProps} props - 控制任务完成回调与刷新标记
 * @returns {JSX.Element} 含热力图与历史列表的页面
 */
export const StatsView: React.FC<StatsViewProps> = ({ onToggleComplete, refreshTrigger }) => {
    const auth = useAuth();
    const [habits, setHabits] = useState<Habit[]>([]);
    const [selectedHabit, setSelectedHabit] = useState<Habit | null>(null);
    const [activeTab, setActiveTab] = useState<'routine' | 'done'>('routine');
    const [isLoading, setIsLoading] = useState(true);
    const [longestStreak, setLongestStreak] = useState(0);
    const exampleHabits = useMemo<Habit[]>(() => [
        {
            id: 'example-sleep',
            title: 'Go to bed on time',
            timeLabel: '10:30 pm 🌙',
            theme: 'pink',
            history: buildDenseHistoryWithGaps(120, [18], [7, 38, 61, 95]),
        },
        {
            id: 'example-wake',
            title: 'Wake up on time',
            timeLabel: '7:00 am ☀️',
            theme: 'gold',
            history: buildDenseHistoryWithGaps(120, [21], [15, 44, 73, 102]),
        },
        {
            id: 'example-workout',
            title: 'Work out',
            timeLabel: '6:30 pm 💪',
            theme: 'blue',
            history: buildDenseHistoryWithGaps(120, [20], [10, 37, 68, 99]),
        },
    ], []);
    const [exampleHabitsState, setExampleHabitsState] = useState<Habit[]>(exampleHabits);

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
                // 使用 calculateCurrentStreak，从今天往前连续统计
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
     * 同时更新：
     * 1. tasks 表的 status 字段（通过 toggleReminderCompletion）
     * 2. routine_completions 表的打卡记录（通过 toggleRoutineCompletion）
     * 3. 本地 UI 状态
     */
    const toggleHabitToday = async (id: string) => {
        // 示例数据：仅本地更新，不触发后端
        if (id.startsWith('example-')) {
            const todayKey = getLocalDateString();
            updateExampleHabitHistory(id, todayKey);
            return;
        }

        if (!auth.userId) return;

        const todayKey = getLocalDateString();

        // 先获取当前状态，决定新状态
        const currentHabit = habits.find(h => h.id === id);
        if (!currentHabit) return;

        const isCurrentlyCompleted = !!currentHabit.history[todayKey];
        const newStatus = !isCurrentlyCompleted;

        try {
            // 1. 更新 tasks 表的 status 字段
            await toggleReminderCompletion(id, newStatus);

            // 2. 更新 routine_completions 表（用于热力图历史）
            // 注意：根据 newStatus 决定是添加还是删除记录，而不是切换
            if (newStatus) {
                // 标记为完成：添加打卡记录
                await markRoutineComplete(auth.userId, id, todayKey);
            } else {
                // 标记为未完成：删除打卡记录
                await unmarkRoutineComplete(auth.userId, id, todayKey);
            }

            // 3. 通知父组件同步状态（如果提供了回调）
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

                    // 如果这个任务正在详情弹窗中显示，同步更新弹窗数据
                    if (selectedHabit?.id === id) {
                        setSelectedHabit(updatedHabit);
                    }

                    return updatedHabit;
                }
                return habit;
            }));

            // 5. 基于所有习惯重新计算「当前连续打卡天数」
            // 先计算当前这个习惯最新的连续天数
            const updatedHistory = { ...currentHabit.history, [todayKey]: newStatus };
            let maxStreak = calculateCurrentStreak(updatedHistory);

            // 再和其他习惯的连续天数比较，取最大的那个
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
     * 只更新 routine_completions 表
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

        // 如果是今天，走 toggleHabitToday 逻辑（会同步更新 tasks.status）
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

                    // 同步更新弹窗数据
                    if (selectedHabit?.id === id) {
                        setSelectedHabit(updatedHabit);
                    }
                    return updatedHabit;
                }
                return habit;
            }));

            // 重新计算基于今天的「当前连续打卡天数」
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

    return (
        <div className="flex-1 relative h-full overflow-hidden flex flex-col bg-white">
            {/* Scroll Container */}
            <div className="flex-1 overflow-y-auto no-scrollbar relative">
                
                {/* New Stats Header (Matches Figma Design) */}
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
                                    <p className="font-serif italic text-lg">Loading...</p>
                                </div>
                            ) : habits.length === 0 ? (
                                <div className="py-0 space-y-6 text-gray-700">
                                    <div className="text-center space-y-2">
                                        <p className="font-serif italic text-lg text-gray-600">Your routine streaks will be tracked here.</p>
                                        <p className="text-sm text-gray-500">Here are example streaks (some days kept, some missed):</p>
                                    </div>
                                    <div className="space-y-4">
                                        {exampleHabitsState.map(habit => (
                                            <StatsCard
                                                key={habit.id}
                                                habit={habit}
                                                onToggleToday={() => toggleHabitToday(habit.id)}
                                                onClickDetail={() => setSelectedHabit(habit)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                habits.map((habit) => (
                                    <StatsCard
                                        key={habit.id}
                                        habit={habit}
                                        onToggleToday={() => void toggleHabitToday(habit.id)}
                                        onClickDetail={() => setSelectedHabit(habit)}
                                    />
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

            {selectedHabit && (
                <HeatmapDetailOverlay
                    habit={selectedHabit}
                    onClose={() => setSelectedHabit(null)}
                    onToggleDate={(date) => toggleHabitOnDate(selectedHabit.id, date)}
                />
            )}
        </div>
    );
};

// --- Heatmap Helpers ---

/**
 * 生成热力图数据（固定列数，今天在最右边）
 * @param history - 完成历史
 * @param columns - 列数（周数）
 * @returns 热力图数据，包含月份标签位置
 */
const getFixedHeatmapData = (history: { [key: string]: boolean }, columns: number = 26) => {
    const today = new Date();
    const todayKey = getLocalDateString(today);

    // 计算今天是周几（0=周一，6=周日）
    const todayDayOfWeek = today.getDay() === 0 ? 6 : today.getDay() - 1;

    // 计算开始日期：往前推 (columns - 1) 周 + 今天之前的天数
    // 我们希望今天在最后一列的对应位置
    // 所以总天数 = (columns - 1) * 7 + (todayDayOfWeek + 1)
    // 补全左侧空缺：为了保持完整的 7 行结构，起始日期应该是第一列的周一
    // 第一列的周一 = 今天 - (totalDays - 1) - 第一列空缺
    // 但更简单的逻辑是：生成 columns * 7 个格子，多余的未来日期留空

    const totalGridCells = columns * 7;
    const days: { date: Date | null; level: number; isToday: boolean }[] = [];
    const monthLabels: { month: string; columnIndex: number }[] = [];

    // 计算整个网格的起始日期（第一列的周一）
    // 最后一列的周一 = 今天 - todayDayOfWeek
    // 第一列的周一 = 最后一列的周一 - (columns - 1) * 7
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

interface StatsCardProps {
    habit: Habit;
    onToggleToday: () => void;
    onClickDetail: () => void;
}

const StatsCard: React.FC<StatsCardProps> = ({ habit, onToggleToday, onClickDetail }) => {
    const todayKey = getLocalDateString();
    const isTodayDone = !!habit.history[todayKey];
    const { days } = getFixedHeatmapData(habit.history, 16);

    // Dynamic styles based on theme
    const themeColors = {
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

    const currentTheme = themeColors[habit.theme];

    return (
        <div className="bg-white rounded-2xl p-5 shadow-[0_2px_15px_rgba(0,0,0,0.04)] border border-gray-100">
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onToggleToday}
                        className={`w-6 h-6 rounded border-[2px] flex items-center justify-center transition-colors cursor-pointer ${currentTheme.checkBorder} ${isTodayDone ? currentTheme.checkBg : 'hover:bg-gray-50'}`}
                    >
                        {isTodayDone && <i className="fa-solid fa-check text-white text-xs"></i>}
                    </button>
                    <h3 className="text-gray-800 font-bold text-lg">{habit.title}</h3>
                </div>
                <span className={`text-xs font-serif italic px-3 py-1 rounded-full bg-brand-cream text-gray-700 font-semibold`}>
                    {habit.timeLabel}
                </span>
            </div>

            {/* Colorful Heatmap Grid */}
            <div
                className="grid grid-rows-7 grid-flow-col gap-1 h-[90px] overflow-hidden cursor-pointer"
                onClick={onClickDetail}
            >
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

/**
 * 计算当前连续打卡天数（从今天往前数）
 */
const calculateCurrentStreak = (history: { [key: string]: boolean }): number => {
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
 */
const getCalendarData = (year: number, month: number, history: { [key: string]: boolean }) => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const today = new Date();
    const todayKey = getLocalDateString(today);

    // 获取这个月第一天是周几（0=周日，1=周一...）
    const startDayOfWeek = firstDay.getDay();
    // 调整为周一开始（0=周一，6=周日）
    const adjustedStartDay = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1;

    const days: { date: number | null; isCompleted: boolean; isToday: boolean; isFuture: boolean }[] = [];

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
 * 任务详情弹窗
 * 包含：热力图、连续打卡统计、月历视图
 */
const HeatmapDetailOverlay = ({
    habit,
    onClose,
    onToggleDate
}: {
    habit: Habit,
    onClose: () => void,
    onToggleDate: (date: Date) => void
}) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const HEATMAP_COLUMNS = 160; // 显示160周（约3年）
    const { days: heatmapDays, monthLabels } = getFixedHeatmapData(habit.history, HEATMAP_COLUMNS);
    const currentStreak = calculateCurrentStreak(habit.history);
    const scrollRef = React.useRef<HTMLDivElement>(null);

    // 自动滚动到最右侧（最新日期）
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
    }, []);

    const themeColors = {
        gold: 'bg-brand-heatmapGold',
        blue: 'bg-brand-heatmapBlue',
        pink: 'bg-brand-heatmapPink',
    };
    const activeColor = themeColors[habit.theme];

    // 月份名称
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekDaysShort = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']; // 隔行显示

    // 当前显示月份的日历数据
    const calendarDays = getCalendarData(
        currentDate.getFullYear(),
        currentDate.getMonth(),
        habit.history
    );

    // 切换月份
    const goToPrevMonth = () => {
        setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
    };

    const goToNextMonth = () => {
        const next = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
        if (next <= new Date()) {
            setCurrentDate(next);
        }
    };

    // 格式化月份显示
    const formatMonthYear = (date: Date) => {
        return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    };

    // 格子尺寸配置
    const cellSize = 12;
    const gap = 4;

    return (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl animate-scale-in max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex justify-between items-start p-6 pb-4">
                    <h2 className="text-xl font-bold text-gray-800">{habit.title}</h2>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                    >
                        <i className="fa-solid fa-xmark text-gray-500"></i>
                    </button>
                </div>

                {/* Mini Heatmap - Scrollable with Fixed Weekday Column */}
                <div className="px-6 pb-4 flex gap-2">
                    {/* Fixed Weekday Labels */}
                    <div className="flex flex-col justify-between pt-5 pb-[2px] h-[128px] text-[9px] text-gray-400 shrink-0">
                        {weekDaysShort.map((day, i) => (
                            <span key={i} className="h-[12px] leading-[12px] flex items-center">{day}</span>
                        ))}
                    </div>

                    {/* Scrollable Grid Container */}
                    <div
                        ref={scrollRef}
                        className="flex-1 overflow-x-auto no-scrollbar"
                    >
                        <div className="min-w-max relative">
                            {/* Month Labels */}
                            <div className="relative h-5 w-full">
                                {monthLabels.map((label, i) => (
                                    <span
                                        key={i}
                                        className="absolute text-[10px] text-gray-400 transform -translate-x-1/2"
                                        style={{
                                            left: `${label.columnIndex * (cellSize + gap) + cellSize / 2}px`
                                        }}
                                    >
                                        {label.month}
                                    </span>
                                ))}
                            </div>

                            {/* Heatmap Grid */}
                            <div
                                className="grid grid-rows-7 grid-flow-col"
                                style={{ gap: `${gap}px` }}
                            >
                                {heatmapDays.map((day, i) => (
                                    <div
                                        key={i}
                                        title={day.date ? `${day.date.toLocaleDateString()}: ${day.level > 0 ? '✓' : '✗'}` : ''}
                                        style={{ width: `${cellSize}px`, height: `${cellSize}px` }}
                                        className={`
                                            rounded-[3px] transition-all
                                            ${!day.date ? 'bg-transparent' : (day.level > 0 ? activeColor : 'bg-[#F0F0F0]')} 
                                            ${day.isToday ? 'ring-2 ring-brand-goldBorder ring-offset-1 z-10' : ''}
                                        `}
                                    ></div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Streak Badge */}
                <div className="flex justify-center py-4">
                    <div className="flex items-center gap-2">
                        <span className="text-3xl">🔥</span>
                        <span className="text-2xl font-bold text-brand-goldBorder font-serif italic">
                            {currentStreak} Days Winning
                        </span>
                    </div>
                </div>

                {/* Calendar View */}
                <div className="px-6 pb-6">
                    {/* Week Day Headers */}
                    <div className="grid grid-cols-7 gap-1 mb-2">
                        {weekDays.map(day => (
                            <div key={day} className="text-center text-xs text-gray-400 py-2">
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* Calendar Grid */}
                    <div className="grid grid-cols-7 gap-1">
                        {calendarDays.map((day, i) => (
                            <div
                                key={i}
                                onClick={() => {
                                    if (day.date !== null && !day.isFuture) {
                                        const targetDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day.date);
                                        onToggleDate(targetDate);
                                    }
                                }}
                                className={`
                                    aspect-square flex flex-col items-center justify-center rounded-xl text-sm transition-colors
                                    ${day.date === null ? '' : (day.isFuture ? 'cursor-default' : 'cursor-pointer')}
                                    ${day.isToday ? 'bg-brand-cream ring-2 ring-brand-goldBorder' : ''}
                                    ${day.isFuture ? 'text-gray-300' : 'text-gray-700'}
                                    ${!day.isToday && day.date !== null && !day.isFuture ? 'hover:bg-gray-100 active:bg-gray-200' : ''}
                                `}
                            >
                                {day.date !== null && (
                                    <>
                                        <span className={`font-medium ${day.isToday ? 'font-bold' : ''}`}>
                                            {day.date}
                                        </span>
                                        {day.isCompleted && !day.isFuture && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-goldBorder mt-0.5"></span>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Month Navigation */}
                    <div className="flex justify-between items-center mt-6">
                        <button
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                            onClick={() => setCurrentDate(new Date())}
                        >
                            <i className="fa-regular fa-calendar text-gray-500"></i>
                            <span className="text-sm text-gray-600">{formatMonthYear(currentDate)}</span>
                        </button>

                        <div className="flex gap-2">
                            <button
                                onClick={goToPrevMonth}
                                className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                            >
                                <i className="fa-solid fa-chevron-left text-gray-500"></i>
                            </button>
                            <button
                                onClick={goToNextMonth}
                                className="w-10 h-10 rounded-xl bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition-colors"
                            >
                                <i className="fa-solid fa-chevron-right text-gray-500"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
