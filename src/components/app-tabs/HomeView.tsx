import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { Task } from '../../remindMe/types';
import { parseTimeToString, getLocalDateString, formatDateForSeparator } from '../../utils/timeUtils';
import { TimePicker } from './TimePicker';
import { TaskGroup } from './TaskGroup';
import { DateSeparator } from './DateSeparator';
import { useTranslation } from '../../hooks/useTranslation';
import { detectWebView } from '../../utils/webviewDetection';
import { PullToRefresh } from '../common/PullToRefresh';

import { supabase } from '../../lib/supabase';

// Quick tags with translation keys for home page
const QUICK_TAG_KEYS = [
    { emoji: '🛏️', key: 'urgency.getOutOfBed' },
    { emoji: '💪', key: 'urgency.workout' },
    { emoji: '😴', key: 'urgency.goToSleep' },
    { emoji: '📚', key: 'urgency.startReading' },
    { emoji: '🛁', key: 'urgency.needShower' },
    { emoji: '📝', key: 'urgency.startStudying' },
    { emoji: '✉️', key: 'urgency.replyEmails' },
    { emoji: '📞', key: 'urgency.makeCall' },
    { emoji: '🍳', key: 'urgency.cookDinner' },
    { emoji: '🧹', key: 'urgency.cleanUp' },
];

const QuickTag = ({ emoji, text, onClick, variant = 'gray' }: { emoji: string; text: string; onClick: () => void; variant?: 'gray' | 'blue' }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-150 active:scale-[0.97] ${
            variant === 'blue'
                ? 'bg-brand-darkBlue/80 text-white hover:bg-brand-darkBlue'
                : 'border border-gray-200 bg-gray-100 text-gray-800 hover:bg-gray-200'
        }`}
    >
        <span className="text-[15px] leading-none">{emoji}</span>
        <span className="text-[15px] leading-none whitespace-nowrap">{text}</span>
    </button>
);

const QuickTagsRow: React.FC<{ onSelect: (text: string) => void; variant?: 'gray' | 'blue' }> = ({ onSelect, variant = 'gray' }) => {
    const { t } = useTranslation();
    const quickTagsScrollRef = useRef<HTMLDivElement | null>(null);
    const quickTagsAnimationRef = useRef<number | null>(null);
    const quickTagsVirtualScrollRef = useRef(0);
    const quickTagsPauseRef = useRef(false);

    // Translate quick tags
    const QUICK_TAGS = QUICK_TAG_KEYS.map(tag => ({
        emoji: tag.emoji,
        text: t(tag.key),
    }));

    const pauseQuickTagsAutoScroll = () => {
        quickTagsPauseRef.current = true;
    };

    const resumeQuickTagsAutoScroll = () => {
        quickTagsPauseRef.current = false;
    };

    useEffect(() => {
        quickTagsVirtualScrollRef.current = quickTagsScrollRef.current?.scrollLeft || 0;

        const applyScrollPosition = (element: HTMLDivElement, value: number) => {
            element.scrollLeft = value;
            if (typeof element.scrollTo === 'function') {
                element.scrollTo({ left: value, behavior: 'auto' });
            }
        };

        const step = () => {
            const container = quickTagsScrollRef.current;
            if (container && !quickTagsPauseRef.current) {
                const maxScrollable = container.scrollWidth - container.clientWidth;
                if (maxScrollable > 2) {
                    const resetPoint = container.scrollWidth / 2;
                    let newScroll = quickTagsVirtualScrollRef.current + 0.8;
                    if (newScroll >= resetPoint) {
                        newScroll = 0;
                    }
                    quickTagsVirtualScrollRef.current = newScroll;
                    applyScrollPosition(container, newScroll);
                }
            }
            quickTagsAnimationRef.current = requestAnimationFrame(step);
        };

        quickTagsAnimationRef.current = requestAnimationFrame(step);
        return () => {
            if (quickTagsAnimationRef.current) {
                cancelAnimationFrame(quickTagsAnimationRef.current);
            }
        };
    }, []);

    return (
        <div className="w-full flex flex-col items-center gap-1 mb-4">
            <div className="relative w-full">
                <div className={`absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none ${variant === 'blue' ? 'bg-gradient-to-r from-brand-blue to-transparent' : 'bg-gradient-to-r from-white to-transparent'}`} />
                <div className={`absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none ${variant === 'blue' ? 'bg-gradient-to-l from-brand-blue to-transparent' : 'bg-gradient-to-l from-white to-transparent'}`} />
                <div
                    ref={quickTagsScrollRef}
                    className="flex gap-3 px-4 py-2 overflow-x-auto no-scrollbar"
                    role="list"
                    style={{
                        scrollBehavior: 'auto',
                        WebkitOverflowScrolling: 'touch',
                        touchAction: 'pan-x'
                    }}
                    onMouseEnter={pauseQuickTagsAutoScroll}
                    onMouseLeave={resumeQuickTagsAutoScroll}
                    onTouchStart={pauseQuickTagsAutoScroll}
                    onTouchEnd={() => {
                        setTimeout(resumeQuickTagsAutoScroll, 300);
                    }}
                    onScroll={() => {
                        if (quickTagsPauseRef.current && quickTagsScrollRef.current) {
                            quickTagsVirtualScrollRef.current = quickTagsScrollRef.current.scrollLeft;
                        }
                    }}
                >
                    {[0, 1].map(loopIndex => (
                        QUICK_TAGS.map((tag) => (
                            <div key={`${loopIndex}-${tag.text}`} className="flex-shrink-0" role="listitem">
                                <QuickTag
                                    emoji={tag.emoji}
                                    text={tag.text}
                                    onClick={() => onSelect(tag.text)}
                                    variant={variant}
                                />
                            </div>
                        ))
                    ))}
                </div>
            </div>
        </div>
    );
};

interface HomeViewProps {
    tasks: Task[];
    onAddTask: (task: Task) => void;
    onToggleComplete: (id: string) => void;
    onDeleteTask: (id: string) => void;
    /** 更新任务 */
    onUpdateTask?: (task: Task) => void;
    /** 未登录时触发登录弹窗 */
    onRequestLogin?: () => void;
    /** 是否已登录，用于控制优先级：先提示登录，再提示输入 */
    isLoggedIn?: boolean;
    /** 下拉刷新回调 */
    onRefresh?: () => Promise<void>;
}

/**
 * 任务列表首页：支持创建提醒、切换 To-do/Routine、AI 建议时间，并按时间段展示任务。
 */
export const HomeView: React.FC<HomeViewProps> = ({
    tasks,
    onAddTask,
    onToggleComplete,
    onDeleteTask,
    onUpdateTask,
    onRequestLogin,
    isLoggedIn = false,
    onRefresh,
}) => {
    const { t } = useTranslation();
    const [taskInput, setTaskInput] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date()); // New State for Date
    const [isRoutine, setIsRoutine] = useState(() => {
        const saved = localStorage.getItem('isRoutinePreference');
        return saved !== null ? saved === 'true' : true;
    });
    const [showTimePicker, setShowTimePicker] = useState(false);

    // Edit Task State
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [editTaskText, setEditTaskText] = useState('');
    const [editTaskTime, setEditTaskTime] = useState('');
    const [editTaskDate, setEditTaskDate] = useState(new Date());

    // Test Version Request State
    const [testEmail, setTestEmail] = useState('');
    const [isSubmittingTest, setIsSubmittingTest] = useState(false);
    const [androidRequestSent, setAndroidRequestSent] = useState(false);
    const [showAndroidForm, setShowAndroidForm] = useState(false);

    // Animation State
    const [animatingTask, setAnimatingTask] = useState<{
        text: string;
        startRect: DOMRect;
        endRect: DOMRect;
    } | null>(null);

    // Scroll State
    const [scrollTop, setScrollTop] = useState(0);

    // Refs
    const timePickerContainerRef = useRef<HTMLDivElement>(null);
    const inputContainerRef = useRef<HTMLDivElement>(null);

    // Note: handleClickOutside logic removed because TimePicker is now a modal
    // with its own backdrop click-to-close behavior (onClick={onClose} on the outer div)

    const handleSetTask = () => {
        if (!isLoggedIn) {
            onRequestLogin?.();
            return;
        }

        if (!taskInput.trim()) {
            alert(t('home.pleaseEnterTask'));
            return;
        }

        // Trigger Animation - simple fade effect from input
        if (inputContainerRef.current) {
            const startRect = inputContainerRef.current.getBoundingClientRect();
            // Animate to center-bottom of input
            const endRect = new DOMRect(
                startRect.left + startRect.width / 2,
                startRect.top + startRect.height,
                0,
                0
            );
            setAnimatingTask({
                text: taskInput,
                startRect,
                endRect
            });
        }

        // selectedTime 由 TimePicker 自动设置，不可能为空
        const [h, m] = selectedTime.split(':').map(Number);
        let category: Task['category'] = 'morning';
        if (h >= 0 && h < 5) category = 'latenight';
        else if (h >= 5 && h < 12) category = 'morning';
        else if (h >= 12 && h < 14) category = 'noon';
        else if (h >= 14 && h < 18) category = 'afternoon';
        else if (h >= 18 && h < 23) category = 'evening';
        else category = 'latenight';

        // For routine templates, don't set a specific date (they generate daily instances)
        // For todo tasks, use the selected date (using local date to avoid UTC timezone issues)
        let dateStr = isRoutine ? undefined : getLocalDateString(selectedDate);

        // 对于一次性任务，检查时间是否已过
        if (!isRoutine && dateStr) {
            const [year, month, day] = dateStr.split('-').map(Number);
            const reminderTime = new Date(year, month - 1, day, h, m);

            if (reminderTime.getTime() <= Date.now()) {
                const confirmed = window.confirm(t('home.timePastConfirm'));
                if (confirmed) {
                    // 设为明天同一时间
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    dateStr = getLocalDateString(tomorrow);
                } else {
                    return; // 用户取消，不创建任务
                }
            }
        }

        const newTask: Task = {
            id: Date.now().toString(),
            text: taskInput,
            time: selectedTime,
            displayTime: parseTimeToString(selectedTime),
            date: dateStr,
            completed: false,
            type: isRoutine ? 'routine' : 'todo',
            category,
            called: false,
            // For routine tasks, set as recurring with daily pattern by default
            isRecurring: isRoutine,
            recurrencePattern: isRoutine ? 'daily' : undefined,
        };

        onAddTask(newTask);
        setTaskInput('');
        setSelectedTime('');
        setShowTimePicker(false);
    };

    const handleAndroidWaitlist = async () => {
        if (!supabase) return;

        setIsSubmittingTest(true);
        let emailToSubmit = testEmail;
        let userId = null;

        // 如果已登录，尝试自动获取邮箱
        if (isLoggedIn) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && user.email) {
                emailToSubmit = user.email;
                userId = user.id;
            }
        }

        // 未登录且没有输入邮箱时，需要验证
        if (!isLoggedIn && (!emailToSubmit || !emailToSubmit.includes('@'))) {
            alert(t('home.invalidEmail'));
            setIsSubmittingTest(false);
            return;
        }

        try {
            const { error } = await supabase
                .from('test_version_requests')
                .insert({
                    email: emailToSubmit || null,
                    user_id: userId,
                    status: 'pending'
                });

            if (error) throw error;

            setAndroidRequestSent(true);
            setTestEmail('');
            setShowAndroidForm(false);
        } catch (error: unknown) {
            console.error('Error requesting test version:', error);
            alert(t('home.submitFailed'));
        } finally {
            setIsSubmittingTest(false);
        }
    };

    const handleiOSClick = () => {
        window.open('https://testflight.apple.com/join/JJaHMe4C', '_blank');
    };

    // Handle opening edit modal
    const handleEditTask = (task: Task) => {
        setEditingTask(task);
        setEditTaskText(task.text);
        setEditTaskTime(task.time || '');
        // Parse task date
        if (task.date) {
            const [year, month, day] = task.date.split('-').map(Number);
            setEditTaskDate(new Date(year, month - 1, day));
        } else {
            setEditTaskDate(new Date());
        }
    };

    // Handle saving edited task
    const handleSaveEdit = () => {
        if (!editingTask || !onUpdateTask) return;

        const [h, m] = editTaskTime.split(':').map(Number);
        let category: Task['category'] = 'morning';
        if (h >= 0 && h < 5) category = 'latenight';
        else if (h >= 5 && h < 12) category = 'morning';
        else if (h >= 12 && h < 14) category = 'noon';
        else if (h >= 14 && h < 18) category = 'afternoon';
        else if (h >= 18 && h < 23) category = 'evening';
        else category = 'latenight';

        let taskDate = editingTask.type === 'routine' ? undefined : getLocalDateString(editTaskDate);

        // 对于一次性任务，检查时间是否已过
        if (editingTask.type === 'todo' && taskDate) {
            const [year, month, day] = taskDate.split('-').map(Number);
            const reminderTime = new Date(year, month - 1, day, h, m);

            if (reminderTime.getTime() <= Date.now()) {
                const confirmed = window.confirm(t('home.timePastConfirm'));
                if (confirmed) {
                    // 设为明天同一时间
                    const tomorrow = new Date(editTaskDate);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    taskDate = getLocalDateString(tomorrow);
                } else {
                    return; // 用户取消，不保存
                }
            }
        }

        const updatedTask: Task = {
            ...editingTask,
            text: editTaskText,
            time: editTaskTime,
            displayTime: parseTimeToString(editTaskTime),
            date: taskDate,
            category,
        };

        onUpdateTask(updatedTask);
        setEditingTask(null);
    };

    // 显示所有未完成任务（routine + todo），不区分 tab
    // 注意：routine_instance 只在后台用于闹钟提醒，不在 UI 显示
    // 排除 displayTime === 'Now' 的任务（这些是在 UrgencyView 中创建的即时任务，进行中不显示）
    const filteredTasks = tasks.filter(task =>
        (task.type === 'todo' || task.type === 'routine') && !task.completed && task.displayTime !== 'Now'
    );

    // Group tasks by date, sorted with today first
    // For routine tasks without date: if today's reminder time has passed, show in tomorrow
    const tasksByDate = useMemo(() => {
        const now = new Date();
        const today = getLocalDateString(now);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = getLocalDateString(tomorrow);

        const grouped: { [date: string]: Task[] } = {};

        filteredTasks.forEach(task => {
            let taskDate = task.date || today;

            // For routine tasks without a specific date, check if today's time has passed
            if (task.type === 'routine' && !task.date && task.time) {
                const [hours, minutes] = task.time.split(':').map(Number);
                const taskTimeToday = new Date(now);
                taskTimeToday.setHours(hours, minutes, 0, 0);

                // If the task time has already passed today, show it as tomorrow's task
                if (now > taskTimeToday) {
                    taskDate = tomorrowStr;
                }
            }

            if (!grouped[taskDate]) {
                grouped[taskDate] = [];
            }
            grouped[taskDate].push(task);
        });

        // Sort dates in ascending order (today first, then tomorrow, etc.)
        const sortedDates = Object.keys(grouped).sort((a, b) => a.localeCompare(b));

        return sortedDates.map(date => ({
            date,
            isToday: date === today,
            tasks: grouped[date],
            morningTasks: grouped[date].filter(task => task.category === 'morning'),
            noonTasks: grouped[date].filter(task => task.category === 'noon'),
            afternoonTasks: grouped[date].filter(task => task.category === 'afternoon'),
            eveningTasks: grouped[date].filter(task => task.category === 'evening'),
            latenightTasks: grouped[date].filter(task => task.category === 'latenight'),
        }));
    }, [filteredTasks]);


    const exampleRoutineTasks = [
        { title: t('stats.goToBed'), time: '10:30 pm' },
        { title: t('stats.wakeUp'), time: '7:00 am' },
        { title: t('stats.workout'), time: '6:30 pm' },
    ];

    const showStickyHeader = scrollTop > 80;

    // 检测是否在自家App的WebView中，如果是则隐藏下载提示
    const webViewInfo = useMemo(() => detectWebView(), []);
    const showDownloadPrompt = !webViewInfo.isNativeApp;

    return (
        <div className="flex-1 relative h-full overflow-hidden flex flex-col">
            {/* Sticky Top Bar (Floating) */}
            <div className={`absolute top-0 left-0 right-0 h-12 bg-white z-50 flex items-end justify-center pb-2 shadow-sm transition-all duration-300 ${showStickyHeader ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}`}>
                <span className="italic text-brand-darkBlue text-xl" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic', fontWeight: 800 }}>{t('home.settingReminder')}</span>
            </div>

            {/* Unified Scroll Container with Pull to Refresh */}
            <PullToRefresh
                onRefresh={onRefresh || (async () => { window.location.reload(); })}
                disabled={!webViewInfo.isNativeApp}
                pullText="Pull to refresh"
                releaseText="Release to refresh"
                refreshingText="Refreshing..."
                className="flex-1 no-scrollbar relative"
                onScrollChange={setScrollTop}
            >

                {/* Header Section (Scrolls away) */}
                <div className="bg-brand-blue px-6 pt-16 pb-12 relative z-[45] transition-colors duration-500 overflow-visible">
                    <p className="text-white/90 text-2xl italic mb-1" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}>{t('home.procrastinating')}</p>
                    <h1 className="text-5xl text-white italic mb-6" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic', fontWeight: 800 }}>{t('home.aiWillCallYou')}</h1>

                    <div ref={inputContainerRef} className="bg-white rounded-2xl px-4 py-3 shadow-sm mb-4 transition-all focus-within:ring-2 focus-within:ring-blue-300">
                        <input
                            type="text"
                            value={taskInput}
                            onChange={(e) => setTaskInput(e.target.value)}
                            placeholder={t('home.placeholder')}
                            className="w-full outline-none text-brand-text placeholder-gray-400 text-lg bg-transparent"
                            style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}
                        />
                    </div>

                    {/* Quick Tags Row */}
                    <QuickTagsRow onSelect={setTaskInput} variant="blue" />


                    {/* "Set a time" Button - positioned to span across blue/white boundary */}
                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 z-50" ref={timePickerContainerRef}>
                        {/* White outer container */}
                        <button
                            onClick={() => {
                                // 验证任务名称：如果用户未输入任务名，先提示再打开时间选择器
                                if (!taskInput.trim()) {
                                    alert(t('home.pleaseEnterTask'));
                                    return;
                                }
                                setShowTimePicker(!showTimePicker);
                            }}
                            className="bg-white rounded-full p-[10px] transition-transform hover:scale-105 active:scale-95"
                            style={{
                                boxShadow: '0px 4px 16px rgba(0, 0, 0, 0.25)',
                            }}
                        >
                            {/* Yellow-green inner button - 204x51 */}
                            <div
                                className="flex items-center justify-center rounded-full"
                                style={{
                                    backgroundColor: '#E6FB47',
                                    width: '204px',
                                    height: '51px',
                                }}
                            >
                                <span
                                    style={{
                                        fontFamily: "'Sansita', sans-serif",
                                        fontStyle: 'italic',
                                        fontWeight: 700,
                                        fontSize: '32px',
                                        color: '#3A64E7',
                                    }}
                                >
                                    Set a time
                                </span>
                            </div>
                        </button>
                    </div>
                </div>


                {/* Content Body */}
                <div className="bg-white px-6 pb-28 min-h-screen">


                    <div className="space-y-6 pt-14">
                        {/* Render all tasks grouped by date with separators */}
                        {tasksByDate && tasksByDate.map((dateGroup) => (
                            <div key={dateGroup.date}>
                                {/* Show date separator for non-today dates */}
                                {!dateGroup.isToday && (
                                    <DateSeparator date={formatDateForSeparator(dateGroup.date)} />
                                )}

                                {dateGroup.morningTasks.length > 0 && (
                                    <TaskGroup
                                        title={t('home.morning')}
                                        icon="☀️"
                                        tasks={dateGroup.morningTasks}
                                        onToggle={onToggleComplete}
                                        onDelete={onDeleteTask}
                                        onEdit={handleEditTask}
                                    />
                                )}
                                {dateGroup.noonTasks.length > 0 && (
                                    <div className={dateGroup.morningTasks.length > 0 ? 'mt-6' : ''}>
                                        <TaskGroup
                                            title={t('home.noon')}
                                            icon="🌞"
                                            tasks={dateGroup.noonTasks}
                                            onToggle={onToggleComplete}
                                            onDelete={onDeleteTask}
                                            onEdit={handleEditTask}
                                        />
                                    </div>
                                )}
                                {dateGroup.afternoonTasks.length > 0 && (
                                    <div className={(dateGroup.morningTasks.length > 0 || dateGroup.noonTasks.length > 0) ? 'mt-6' : ''}>
                                        <TaskGroup
                                            title={t('home.afternoon')}
                                            icon="🌤️"
                                            tasks={dateGroup.afternoonTasks}
                                            onToggle={onToggleComplete}
                                            onDelete={onDeleteTask}
                                            onEdit={handleEditTask}
                                        />
                                    </div>
                                )}
                                {dateGroup.eveningTasks.length > 0 && (
                                    <div className={(dateGroup.morningTasks.length > 0 || dateGroup.noonTasks.length > 0 || dateGroup.afternoonTasks.length > 0) ? 'mt-6' : ''}>
                                        <TaskGroup
                                            title={t('home.evening')}
                                            icon="🌙"
                                            tasks={dateGroup.eveningTasks}
                                            onToggle={onToggleComplete}
                                            onDelete={onDeleteTask}
                                            onEdit={handleEditTask}
                                        />
                                    </div>
                                )}
                                {dateGroup.latenightTasks.length > 0 && (
                                    <div className={(dateGroup.morningTasks.length > 0 || dateGroup.noonTasks.length > 0 || dateGroup.afternoonTasks.length > 0 || dateGroup.eveningTasks.length > 0) ? 'mt-6' : ''}>
                                        <TaskGroup
                                            title={t('home.latenight')}
                                            icon="🌃"
                                            tasks={dateGroup.latenightTasks}
                                            onToggle={onToggleComplete}
                                            onDelete={onDeleteTask}
                                            onEdit={handleEditTask}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}

                        {filteredTasks.length === 0 && (
                            <div className="py-0 space-y-4">
                                <p className="text-center font-serif italic text-lg text-gray-400">{t('home.noTasks')}</p>
                                <div className="space-y-3">
                                    {exampleRoutineTasks.map((item, idx) => (
                                        <div
                                            key={`${item.title}-${idx}`}
                                            className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors"
                                            onClick={() => alert(t('home.exampleClickHint'))}
                                        >
                                            <div className="flex flex-col text-left">
                                                <span className="text-gray-800 font-semibold">{item.title}</span>
                                                <span className="text-xs text-gray-400">{t('home.example')}</span>
                                            </div>
                                            <div className="bg-brand-cream px-3 py-1 rounded-lg text-sm font-serif italic font-bold text-gray-800 shadow-inner whitespace-nowrap">
                                                {item.time}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Request Test Version Card - 仅在非自家App中显示 */}
                        {showDownloadPrompt && (
                            <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 shadow-sm mb-6">
                                <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                                    💗 The phone-call reminder feature is only available on the mobile app. The iOS version is now available on TestFlight. Android version coming soon!
                                </p>

                                <div className="space-y-3">
                                    <button
                                        onClick={handleiOSClick}
                                        className="w-full bg-brand-darkBlue text-white font-serif italic font-bold text-sm py-3 rounded-xl shadow-sm hover:bg-brand-darkBlue/90 transition-colors active:scale-95 flex items-center justify-center gap-2"
                                    >
                                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                                        </svg>
                                        Get iOS Version (TestFlight)
                                    </button>

                                    {androidRequestSent ? (
                                        <div className="w-full bg-green-50 border border-green-200 text-green-700 font-serif italic font-bold text-sm py-3 rounded-xl text-center">
                                            Joined! We'll notify you when ready.
                                        </div>
                                    ) : showAndroidForm ? (
                                        <div className="space-y-2">
                                            <input
                                                type="email"
                                                value={testEmail}
                                                onChange={(e) => setTestEmail(e.target.value)}
                                                placeholder={t('home.enterEmail')}
                                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 bg-white text-sm"
                                            />
                                            <button
                                                onClick={handleAndroidWaitlist}
                                                disabled={isSubmittingTest}
                                                className="w-full bg-white border border-gray-200 text-brand-darkBlue font-serif italic font-bold text-sm py-3 rounded-xl shadow-sm hover:bg-gray-100 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {isSubmittingTest ? t('common.submitting') : 'Join Waitlist'}
                                            </button>
                                            <button
                                                onClick={() => setShowAndroidForm(false)}
                                                className="w-full text-gray-400 text-sm py-2 hover:text-gray-600 transition-colors"
                                            >
                                                Back
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => isLoggedIn ? handleAndroidWaitlist() : setShowAndroidForm(true)}
                                            disabled={isSubmittingTest}
                                            className="w-full bg-white border border-gray-200 text-brand-darkBlue font-serif italic font-bold text-sm py-3 rounded-xl shadow-sm hover:bg-gray-100 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                        >
                                            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M17.523 2.402l1.68 2.89a.5.5 0 01-.183.684l-.632.366 1.767 3.04H14.91l1.767-3.04-.632-.366a.5.5 0 01-.183-.683l1.68-2.891zm-11.046 0l1.68 2.89a.5.5 0 01-.183.684l-.632.366 1.767 3.04H3.865l1.767-3.04-.632-.366a.5.5 0 01-.183-.683l1.68-2.891zM5 10.382h14a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2v-7a2 2 0 012-2zm2.5 4a1 1 0 100 2 1 1 0 000-2zm9 0a1 1 0 100 2 1 1 0 000-2z"/>
                                            </svg>
                                            {isSubmittingTest ? t('common.submitting') : 'Android Waitlist'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </PullToRefresh>

            {/* Ghost Task Animation */}
            {animatingTask && (
                <GhostTask
                    text={animatingTask.text}
                    startRect={animatingTask.startRect}
                    endRect={animatingTask.endRect}
                    onComplete={() => setAnimatingTask(null)}
                />
            )}

            {/* Time Picker Modal */}
            {showTimePicker && (
                <TimePicker
                    timeValue={selectedTime}
                    onTimeChange={setSelectedTime}
                    dateValue={selectedDate}
                    onDateChange={setSelectedDate}
                    onClose={() => setShowTimePicker(false)}
                    onConfirm={handleSetTask}
                    isRoutine={isRoutine}
                    onRoutineChange={(val) => {
                        setIsRoutine(val);
                        localStorage.setItem('isRoutinePreference', String(val));
                    }}
                    routineLabel={t('home.routineTask')}
                    confirmRoutineLabel={t('home.setRecurringReminder')}
                    confirmOnceLabel={t('home.setOnceReminder')}
                />
            )}

            {/* Edit Task Modal */}
            {editingTask && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center animate-fade-in"
                    onClick={() => {
                        handleSaveEdit();
                    }}
                >
                    {/* Semi-transparent backdrop */}
                    <div className="absolute inset-0 bg-gray-500/40" />

                    {/* Modal content */}
                    <div
                        className="relative bg-white rounded-[32px] shadow-2xl w-[340px] p-6 border border-gray-100/50"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="mb-4 flex items-center justify-between">
                            <h3 className="text-gray-900 font-semibold text-lg">{t('home.editTask')}</h3>
                            <button
                                onClick={() => {
                                    if (editingTask && window.confirm(t('home.confirmDelete'))) {
                                        onDeleteTask(editingTask.id);
                                        setEditingTask(null);
                                    }
                                }}
                                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        </div>

                        {/* Task Name Input */}
                        <div className="mb-4">
                            <label className="text-gray-500 text-sm mb-2 block">{t('home.taskName')}</label>
                            <input
                                type="text"
                                value={editTaskText}
                                onChange={(e) => setEditTaskText(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 bg-white text-gray-800"
                                style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}
                            />
                        </div>

                        {/* Time Picker */}
                        <div className="mb-6">
                            <label className="text-gray-500 text-sm mb-2 block">{t('home.taskTime')}</label>
                            <TimePicker
                                timeValue={editTaskTime}
                                onTimeChange={setEditTaskTime}
                                dateValue={editTaskDate}
                                onDateChange={setEditTaskDate}
                                onClose={() => {}}
                                embedded
                            />
                        </div>

                        {/* Save Button */}
                        <button
                            onClick={handleSaveEdit}
                            className="w-full py-3 bg-brand-blue text-white font-semibold rounded-xl hover:bg-brand-blue/90 transition-colors"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Ghost Task Component for Animation
const GhostTask: React.FC<{
    text: string;
    startRect: DOMRect;
    endRect: DOMRect;
    onComplete: () => void;
}> = ({ text, startRect, endRect, onComplete }) => {
    const [style, setStyle] = useState<React.CSSProperties>({
        top: startRect.top,
        left: startRect.left,
        width: startRect.width,
        height: startRect.height,
        opacity: 1,
        transform: 'scale(1)',
    });

    useEffect(() => {
        // Trigger animation in next frame
        requestAnimationFrame(() => {
            setStyle({
                top: endRect.top + endRect.height / 2, // Center of target
                left: endRect.left + endRect.width / 2,
                width: 0, // Shrink to nothing
                height: 0,
                opacity: 1,
                transform: 'scale(0) rotate(15deg)', // Shrink and rotate
            });
        });

        const timer = setTimeout(onComplete, 1000); // Increased duration to 1s
        return () => clearTimeout(timer);
    }, [endRect, onComplete]);

    return (
        <div
            className="fixed z-[100] bg-white rounded-2xl p-4 shadow-soft pointer-events-none transition-all duration-1000 [transition-timing-function:cubic-bezier(0.2,0.8,0.2,1)]"
            style={style}
        >
            <p className="text-brand-text text-lg leading-relaxed truncate">{text}</p>
        </div>
    );
};
