import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TaskType } from '../../remindMe/types';
import type { Task } from '../../remindMe/types';
import { parseTimeToString, getLocalDateString, formatDateForSeparator } from '../../utils/timeUtils';
import { TimePicker } from './TimePicker';
import { TaskGroup } from './TaskGroup';
import { DateSeparator } from './DateSeparator';

import { supabase } from '../../lib/supabase';

interface HomeViewProps {
    tasks: Task[];
    onAddTask: (task: Task) => void;
    onToggleComplete: (id: string) => void;
    onDeleteTask: (id: string) => void;
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
    onRequestLogin,
    isLoggedIn = false,
}) => {
    const [taskInput, setTaskInput] = useState('');
    const [selectedTime, setSelectedTime] = useState('');
    const [selectedDate, setSelectedDate] = useState(new Date()); // New State for Date
    const [isRoutine, setIsRoutine] = useState(false);
    const [activeTab, setActiveTab] = useState<TaskType>(TaskType.TODO);
    const [showTimePicker, setShowTimePicker] = useState(false);

    // Test Version Request State
    const [testEmail, setTestEmail] = useState('');
    const [isSubmittingTest, setIsSubmittingTest] = useState(false);
    const [testRequestSent, setTestRequestSent] = useState(false);

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
            alert('Please enter your task. AI will call you to remind!');
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

    const handleRequestTestVersion = async () => {
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

        if (!emailToSubmit || !emailToSubmit.includes('@')) {
            alert('Please enter a valid email address.');
            setIsSubmittingTest(false);
            return;
        }

        try {
            const { error } = await supabase
                .from('test_version_requests')
                .insert({
                    email: emailToSubmit,
                    user_id: userId,
                    status: 'pending'
                });

            if (error) throw error;

            setTestRequestSent(true);
            setTestEmail('');
        } catch (error: any) {
            console.error('Error requesting test version:', error);
            alert('Failed to submit request. Please try again.');
        } finally {
            setIsSubmittingTest(false);
        }
    };

    // Now tab: 只显示 todo 任务，排除已完成的
    // Routine tab: 显示 routine 模板（用于管理 routine）
    // 注意：routine_instance 只在后台用于闹钟提醒，不在 UI 显示
    const filteredTasks = activeTab === TaskType.TODO
        ? tasks.filter(t => t.type === 'todo' && !t.completed)
        : tasks.filter(t => t.type === 'routine');

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
            morningTasks: grouped[date].filter(t => t.category === 'morning'),
            afternoonTasks: grouped[date].filter(t => t.category === 'afternoon'),
            eveningTasks: grouped[date].filter(t => t.category === 'evening'),
        }));
    }, [filteredTasks, activeTab]);

    // For Routine tab, use flat category grouping (no date separation)
    const morningTasks = filteredTasks.filter(t => t.category === 'morning');
    const afternoonTasks = filteredTasks.filter(t => t.category === 'afternoon');
    const eveningTasks = filteredTasks.filter(t => t.category === 'evening');

    const exampleNowTasks = [
        { title: 'Remember vehicle registration', time: '6:00 pm' },
        { title: 'Send the package on time', time: '6:00 pm' },
    ];

    const exampleRoutineTasks = [
        { title: 'Go to bed on time', time: '10:30 pm' },
        { title: 'Wake up on time', time: '7:00 am' },
        { title: 'Work out', time: '6:30 pm' },
    ];

    const showStickyHeader = scrollTop > 80;

    return (
        <div className="flex-1 relative h-full overflow-hidden flex flex-col">
            {/* Sticky Top Bar (Floating) */}
            <div className={`absolute top-0 left-0 right-0 h-12 bg-white z-50 flex items-end justify-center pb-2 shadow-sm transition-all duration-300 ${showStickyHeader ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}`}>
                <span className="italic text-brand-darkBlue text-xl" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic', fontWeight: 800 }}>Setting Reminder</span>
            </div>

            {/* Unified Scroll Container */}
            <div className="flex-1 overflow-y-auto no-scrollbar relative" onScroll={handleScroll}>

                {/* Header Section (Scrolls away) - Increased z-index to 45 to be above sticky tabs (z-40) so TimePicker shows on top */}
                <div className="bg-brand-blue px-6 pt-16 pb-1 relative z-[45] transition-colors duration-500">
                    <p className="text-white/90 text-2xl italic mb-1" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}>Procrastinating?</p>
                    <h1 className="text-5xl text-white italic mb-6" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic', fontWeight: 800 }}>AI will call you</h1>

                    <div ref={inputContainerRef} className="bg-white rounded-2xl p-4 shadow-sm mb-6 transition-all focus-within:ring-2 focus-within:ring-blue-300">
                        <textarea
                            value={taskInput}
                            onChange={(e) => setTaskInput(e.target.value)}
                            placeholder="Enter your task here.&#10;e.g., &quot;take shower&quot;"
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
                                {selectedTime ? parseTimeToString(selectedTime) : 'Set a time'}
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
                        <span className="italic text-lg group-hover:text-white transition-colors" style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic', fontWeight: 600 }}>Routine task</span>
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
                                        alert('Please enter your task. AI will call you to remind!');
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
                                Now
                            </button>
                            <button
                                ref={routineTabRef}
                                onClick={() => setActiveTab(TaskType.ROUTINE)}
                                className={`px-8 py-2 rounded-3xl font-bold italic text-lg transition-all ${activeTab === TaskType.ROUTINE ? 'bg-brand-blue text-white shadow-button transform scale-105' : 'bg-brand-gray text-gray-400 hover:bg-gray-200'}`}
                                style={{ fontFamily: "'Sansita', sans-serif", fontStyle: 'italic' }}
                            >
                                Routine
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
                                        title="Morning"
                                        icon="☀️"
                                        tasks={dateGroup.morningTasks}
                                        onToggle={onToggleComplete}
                                        onDelete={onDeleteTask}
                                    />
                                )}
                                {dateGroup.afternoonTasks.length > 0 && (
                                    <div className={dateGroup.morningTasks.length > 0 ? 'mt-6' : ''}>
                                        <TaskGroup
                                            title="Afternoon"
                                            icon="🌤️"
                                            tasks={dateGroup.afternoonTasks}
                                            onToggle={onToggleComplete}
                                            onDelete={onDeleteTask}
                                        />
                                    </div>
                                )}
                                {dateGroup.eveningTasks.length > 0 && (
                                    <div className={(dateGroup.morningTasks.length > 0 || dateGroup.afternoonTasks.length > 0) ? 'mt-6' : ''}>
                                        <TaskGroup
                                            title="Evening"
                                            icon="🌙"
                                            tasks={dateGroup.eveningTasks}
                                            onToggle={onToggleComplete}
                                            onDelete={onDeleteTask}
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
                                        title="Morning"
                                        icon="☀️"
                                        tasks={morningTasks}
                                        onToggle={onToggleComplete}
                                        onDelete={onDeleteTask}
                                    />
                                )}
                                {afternoonTasks.length > 0 && (
                                    <TaskGroup
                                        title="Afternoon"
                                        icon="🌤️"
                                        tasks={afternoonTasks}
                                        onToggle={onToggleComplete}
                                        onDelete={onDeleteTask}
                                    />
                                )}
                                {eveningTasks.length > 0 && (
                                    <TaskGroup
                                        title="Evening"
                                        icon="🌙"
                                        tasks={eveningTasks}
                                        onToggle={onToggleComplete}
                                        onDelete={onDeleteTask}
                                    />
                                )}
                            </>
                        )}

                        {filteredTasks.length === 0 && (
                            <div className="py-0 space-y-4">
                                <p className="text-center font-serif italic text-lg text-gray-400">No tasks yet. Here are some examples:</p>
                                <div className="space-y-3">
                                    {(activeTab === TaskType.TODO ? exampleNowTasks : exampleRoutineTasks).map((item, idx) => (
                                        <div key={`${item.title}-${idx}`} className="flex items-center justify-between bg-gray-50 border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
                                            <div className="flex flex-col text-left">
                                                <span className="text-gray-800 font-semibold">{item.title}</span>
                                                <span className="text-xs text-gray-400">Example</span>
                                            </div>
                                            <div className="bg-brand-cream px-3 py-1 rounded-lg text-sm font-serif italic font-bold text-gray-800 shadow-inner">
                                                {item.time}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Request Test Version Card */}
                        <div className="bg-gray-50 border border-gray-100 rounded-2xl p-4 shadow-sm mb-6">
                            <p className="text-gray-600 text-sm mb-4 leading-relaxed">
                                💗 Please note that the phone-call reminder feature is only available on iOS or Android. If you are interested, you can click below to request a test version, and the developer will send you an email.
                            </p>

                            {testRequestSent ? (
                                <div className="w-full bg-green-50 border border-green-200 text-green-700 font-serif italic font-bold text-sm py-3 rounded-xl text-center">
                                    Request Sent! We'll contact you soon.
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {!isLoggedIn && (
                                        <input
                                            type="email"
                                            value={testEmail}
                                            onChange={(e) => setTestEmail(e.target.value)}
                                            placeholder="Enter your email"
                                            className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-brand-blue/20 bg-white text-sm"
                                        />
                                    )}
                                    <button
                                        onClick={handleRequestTestVersion}
                                        disabled={isSubmittingTest}
                                        className="w-full bg-white border border-gray-200 text-brand-darkBlue font-serif italic font-bold text-sm py-3 rounded-xl shadow-sm hover:bg-gray-100 transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isSubmittingTest ? 'Submitting...' : 'Request Test Version'}
                                    </button>
                                </div>
                            )}
                        </div>
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
