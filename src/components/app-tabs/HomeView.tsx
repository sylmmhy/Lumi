import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TaskType } from '../../remindMe/types';
import type { Task } from '../../remindMe/types';
import { parseTimeToString, getLocalDateString, formatDateForSeparator } from '../../utils/timeUtils';
import { TimePicker } from './TimePicker';
import { TaskGroup } from './TaskGroup';
import { DateSeparator } from './DateSeparator';
import { useTranslation } from '../../hooks/useTranslation';
import { detectWebView } from '../../utils/webviewDetection';

import { supabase } from '../../lib/supabase';

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
}) => {
    const { t } = useTranslation();
    const [taskInput, setTaskInput] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date()); // New State for Date
    const [isRoutine, setIsRoutine] = useState(false);
    const [activeTab, setActiveTab] = useState<TaskType>(TaskType.TODO);
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
    const routineTabRef = useRef<HTMLButtonElement>(null);
    const todoTabRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (timePickerContainerRef.current && !timePickerContainerRef.current.contains(event.target as Node)) {
                setShowTimePicker(false);
            }
        };

        if (showTimePicker) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showTimePicker]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    const handleSetTask = () => {
        if (!isLoggedIn) {
            onRequestLogin?.();
            return;
        }

        if (!taskInput.trim()) {
            alert(t('home.pleaseEnterTask'));
            return;
        }

        // Trigger Animation
        const targetRef = isRoutine ? routineTabRef : todoTabRef;

        if (inputContainerRef.current && targetRef.current) {
            const startRect = inputContainerRef.current.getBoundingClientRect();
            const endRect = targetRef.current.getBoundingClientRect();
            setAnimatingTask({
                text: taskInput,
                startRect,
                endRect
            });
        }

        let finalTime = selectedTime;
        if (!finalTime) {
            const now = new Date();
            now.setMinutes(now.getMinutes() + 5);
            finalTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        }

        const [h] = finalTime.split(':').map(Number);
        let category: Task['category'] = 'morning';
        if (h >= 12 && h < 17) category = 'afternoon';
        if (h >= 17) category = 'evening';

        // For routine templates, don't set a specific date (they generate daily instances)
        // For todo tasks, use the selected date (using local date to avoid UTC timezone issues)
        const dateStr = isRoutine ? undefined : getLocalDateString(selectedDate);

        const newTask: Task = {
            id: Date.now().toString(),
            text: taskInput,
            time: finalTime,
            displayTime: parseTimeToString(finalTime),
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
        setIsRoutine(false);
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

        const [h] = editTaskTime.split(':').map(Number);
        let category: Task['category'] = 'morning';
        if (h >= 12 && h < 17) category = 'afternoon';
        if (h >= 17) category = 'evening';

        const updatedTask: Task = {
            ...editingTask,
            text: editTaskText,
            time: editTaskTime,
            displayTime: parseTimeToString(editTaskTime),
            date: editingTask.type === 'routine' ? undefined : getLocalDateString(editTaskDate),
            category,
        };

        onUpdateTask(updatedTask);
        setEditingTask(null);
    };

    // Now tab: 只显示 todo 任务，排除已完成的
    // Routine tab: 显示 routine 模板（用于管理 routine）
    // 注意：routine_instance 只在后台用于闹钟提醒，不在 UI 显示
    const filteredTasks = activeTab === TaskType.TODO
        ? tasks.filter(task => task.type === 'todo' && !task.completed)
        : tasks.filter(task => task.type === 'routine');

    // Group tasks by date for Now tab, sorted with most recent first
    const tasksByDate = useMemo(() => {
        if (activeTab !== TaskType.TODO) return null;

        const today = getLocalDateString(new Date());
        const grouped: { [date: string]: Task[] } = {};

        filteredTasks.forEach(task => {
            const taskDate = task.date || today;
            if (!grouped[taskDate]) {
                grouped[taskDate] = [];
            }
            grouped[taskDate].push(task);
        });

        // Sort dates in descending order (most recent first)
        const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

        return sortedDates.map(date => ({
            date,
            isToday: date === today,
            tasks: grouped[date],
            morningTasks: grouped[date].filter(task => task.category === 'morning'),
            afternoonTasks: grouped[date].filter(task => task.category === 'afternoon'),
            eveningTasks: grouped[date].filter(task => task.category === 'evening'),
        }));
    }, [filteredTasks, activeTab]);

    // For Routine tab, use flat category grouping (no date separation)
    const morningTasks = filteredTasks.filter(task => task.category === 'morning');
    const afternoonTasks = filteredTasks.filter(task => task.category === 'afternoon');
    const eveningTasks = filteredTasks.filter(task => task.category === 'evening');

    const exampleNowTasks = [
        { title: t('home.exampleVehicle'), time: '6:00 pm' },
        { title: t('home.examplePackage'), time: '6:00 pm' },
    ];

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

            {/* Unified Scroll Container */}
            <div className="flex-1 overflow-y-auto no-scrollbar relative" onScroll={handleScroll}>

                {/* Header Section (Scrolls away) - Increased z-index to 45 to be above sticky tabs (z-40) so TimePicker shows on top */}
                <div className="bg-brand-blue px-6 pt-16 pb-1 relative z-[45] transition-colors duration-500">
                    <p className="text-white/90 text-2xl italic mb-1" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}>{t('home.procrastinating')}</p>
                    <h1 className="text-5xl text-white italic mb-6" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic', fontWeight: 800 }}>{t('home.aiWillCallYou')}</h1>

                    <div ref={inputContainerRef} className="bg-white rounded-2xl p-4 shadow-sm mb-6 transition-all focus-within:ring-2 focus-within:ring-blue-300">
                        <textarea
                            value={taskInput}
                            onChange={(e) => setTaskInput(e.target.value)}
                            placeholder={t('home.placeholder')}
                            className="w-full resize-none outline-none text-brand-text placeholder-gray-400 text-lg leading-relaxed h-16 bg-transparent"
                            style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}
                        />
                    </div>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="relative z-[150]" ref={timePickerContainerRef}>
                            <button
                                onClick={() => setShowTimePicker(!showTimePicker)}
                                className="bg-brand-darkBlue text-white italic text-4xl px-5 py-3 rounded-xl shadow-inner flex items-center gap-2 hover:bg-opacity-90 transition-all"
                                style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic', fontWeight: 600 }}
                            >
                                {selectedTime ? parseTimeToString(selectedTime) : t('home.setTime')}
                            </button>

                            {showTimePicker && (
                                <TimePicker
                                    timeValue={selectedTime}
                                    onTimeChange={setSelectedTime}
                                    dateValue={selectedDate}
                                    onDateChange={setSelectedDate}
                                    onClose={() => setShowTimePicker(false)}
                                />
                            )}
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-white/90 cursor-pointer select-none group mb-4">
                        <div className={`w-5 h-5 border-[1.5px] border-white rounded-[4px] flex items-center justify-center transition-colors ${isRoutine ? 'bg-brand-lime border-brand-lime' : ''}`}>
                            {isRoutine && <i className="fa-solid fa-check text-brand-blue text-[10px]"></i>}
                        </div>
                        <input
                            type="checkbox"
                            className="hidden"
                            checked={isRoutine}
                            onChange={() => setIsRoutine(!isRoutine)}
                        />
                        <span className="italic text-lg group-hover:text-white transition-colors" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic', fontWeight: 600 }}>{t('home.routineTask')}</span>
                    </label>

                    {/* SVG Arc Bottom */}
                    <div className="absolute bottom-0 left-0 right-0 translate-y-[99%] z-0">
                        <svg viewBox="0 0 1440 200" className="w-full h-auto block text-brand-blue fill-current transition-colors duration-500" preserveAspectRatio="none">
                            <path d="M0,0 L1440,0 L1440,50 Q720,200 0,50 Z" />
                        </svg>
                    </div>

                    {/* "Set" Button */}
                    <div className="absolute bottom-[-100px] right-1 z-30">
                        <div className="relative w-40 h-40">
                            <button
                                onClick={() => {
                                    if (!taskInput.trim()) {
                                        alert(t('home.pleaseEnterTask'));
                                        return;
                                    }
                                    handleSetTask();
                                }}
                                className="w-full h-full bg-transparent flex items-center justify-center transform transition-transform hover:scale-105 active:scale-95"
                            >
                                <img
                                    src="/setbutton.png"
                                    alt="Set"
                                    className="w-full h-full object-contain select-none pointer-events-none"
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Spacer for Arc overlap */}
                <div className="h-12 bg-transparent"></div>

                {/* Content Body */}
                <div className="bg-white px-6 pb-28 min-h-screen">

                    {/* Sticky Tabs */}
                    <div className="sticky top-12 z-40 bg-white pt-6 pb-6">
                        <div className="flex gap-4">
                            <button
                                ref={todoTabRef}
                                onClick={() => setActiveTab(TaskType.TODO)}
                                className={`px-8 py-2 rounded-3xl font-bold italic text-lg transition-all ${activeTab === TaskType.TODO ? 'bg-brand-blue text-white shadow-button transform scale-105' : 'bg-brand-gray text-gray-400 hover:bg-gray-200'}`}
                                style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}
                            >
                                {t('home.now')}
                            </button>
                            <button
                                ref={routineTabRef}
                                onClick={() => setActiveTab(TaskType.ROUTINE)}
                                className={`px-8 py-2 rounded-3xl font-bold italic text-lg transition-all ${activeTab === TaskType.ROUTINE ? 'bg-brand-blue text-white shadow-button transform scale-105' : 'bg-brand-gray text-gray-400 hover:bg-gray-200'}`}
                                style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}
                            >
                                {t('home.routine')}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6 mt-2">
                        {/* Now tab: render tasks grouped by date with separators */}
                        {activeTab === TaskType.TODO && tasksByDate && tasksByDate.map((dateGroup) => (
                            <div key={dateGroup.date}>
                                {/* Show date separator for non-today dates (skip first group if it's today) */}
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
                                {dateGroup.afternoonTasks.length > 0 && (
                                    <div className={dateGroup.morningTasks.length > 0 ? 'mt-6' : ''}>
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
                                    <div className={(dateGroup.morningTasks.length > 0 || dateGroup.afternoonTasks.length > 0) ? 'mt-6' : ''}>
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
                            </div>
                        ))}

                        {/* Routine tab: render tasks without date grouping */}
                        {activeTab === TaskType.ROUTINE && (
                            <>
                                {morningTasks.length > 0 && (
                                    <TaskGroup
                                        title={t('home.morning')}
                                        icon="☀️"
                                        tasks={morningTasks}
                                        onToggle={onToggleComplete}
                                        onDelete={onDeleteTask}
                                        onEdit={handleEditTask}
                                    />
                                )}
                                {afternoonTasks.length > 0 && (
                                    <TaskGroup
                                        title={t('home.afternoon')}
                                        icon="🌤️"
                                        tasks={afternoonTasks}
                                        onToggle={onToggleComplete}
                                        onDelete={onDeleteTask}
                                        onEdit={handleEditTask}
                                    />
                                )}
                                {eveningTasks.length > 0 && (
                                    <TaskGroup
                                        title={t('home.evening')}
                                        icon="🌙"
                                        tasks={eveningTasks}
                                        onToggle={onToggleComplete}
                                        onDelete={onDeleteTask}
                                        onEdit={handleEditTask}
                                    />
                                )}
                            </>
                        )}

                        {filteredTasks.length === 0 && (
                            <div className="py-0 space-y-4">
                                <p className="text-center font-serif italic text-lg text-gray-400">{t('home.noTasks')}</p>
                                <div className="space-y-3">
                                    {(activeTab === TaskType.TODO ? exampleNowTasks : exampleRoutineTasks).map((item, idx) => (
                                        <div key={`${item.title}-${idx}`} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
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
            </div>

            {/* Ghost Task Animation */}
            {animatingTask && (
                <GhostTask
                    text={animatingTask.text}
                    startRect={animatingTask.startRect}
                    endRect={animatingTask.endRect}
                    onComplete={() => setAnimatingTask(null)}
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
                        <div className="mb-4">
                            <h3 className="text-gray-900 font-semibold text-lg">{t('home.editTask')}</h3>
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
