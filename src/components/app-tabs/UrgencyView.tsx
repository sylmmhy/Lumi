import React, { useCallback, useEffect, useRef, useState } from 'react';

import type { Task } from '../../remindMe/types';
import { getLocalDateString } from '../../utils/timeUtils';
import { TaskItem } from './TaskItem';
import { useTranslation } from '../../hooks/useTranslation';

// Quick tags with translation keys
const QUICK_TAG_KEYS = [
    { emoji: '💪', key: 'urgency.workout' },
    { emoji: '🛏️', key: 'urgency.getOutOfBed' },
    { emoji: '😴', key: 'urgency.goToSleep' },
    { emoji: '📚', key: 'urgency.startReading' },
    { emoji: '🛁', key: 'urgency.needShower' },
    { emoji: '📝', key: 'urgency.startStudying' },
    { emoji: '✉️', key: 'urgency.replyEmails' },
    { emoji: '📞', key: 'urgency.makeCall' },
    { emoji: '🍳', key: 'urgency.cookDinner' },
    { emoji: '🧹', key: 'urgency.cleanUp' },
];

interface UrgencyViewProps {
    tasks: Task[];
    onStartTask: (task: Task) => void;
    onToggleComplete: (id: string) => void;
    onDeleteTask: (id: string) => void;
    onRegisterHelpMeStart?: (handler: (() => void) | null) => void;
}

interface CustomTaskFormProps {
    title: string;
    value: string;
    onChange: (value: string) => void;
    onSubmit: () => void;
    withBorder?: boolean;
    onQuickFill: (text: string) => void;
    onRegisterSubmit?: (handler: (() => void) | null) => void;
}

const QuickTag = ({ emoji, text, onClick }: { emoji: string; text: string; onClick: () => void }) => (
    <button
        type="button"
        onClick={onClick}
        className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-full border border-gray-200 bg-gray-100 text-gray-800 hover:bg-gray-200 active:scale-[0.97] transition-all duration-150"
    >
        <span className="text-[15px] leading-none">{emoji}</span>
        <span className="text-[15px] leading-none whitespace-nowrap">{text}</span>
    </button>
);

const QuickTagsRow: React.FC<{ onSelect: (text: string) => void }> = ({ onSelect }) => {
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
        <div className="w-full flex flex-col items-center gap-1">
            <div className="relative w-full max-w-[345px]">
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent z-10 pointer-events-none" />
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
                                />
                            </div>
                        ))
                    ))}
                </div>
            </div>
        </div>
    );
};

/**
 * 自定义任务表单，用于输入并立即启动任务，供空列表和列表页底部复用。
 */
const CustomTaskForm: React.FC<CustomTaskFormProps> = ({
    title,
    value,
    onChange,
    onSubmit,
    withBorder = false,
    onQuickFill,
    onRegisterSubmit,
}) => {
    const { t } = useTranslation();
    const [showEmptyWarning, setShowEmptyWarning] = useState(false);

    /**
     * 提交任务输入，空内容时给出提示。
     */
    const handleSubmit = useCallback(() => {
        if (!value.trim()) {
            setShowEmptyWarning(true);
            setTimeout(() => setShowEmptyWarning(false), 3000);
            return;
        }
        onSubmit();
    }, [onSubmit, value]);

    useEffect(() => {
        if (!onRegisterSubmit) return;
        onRegisterSubmit(handleSubmit);
        return () => onRegisterSubmit(null);
    }, [handleSubmit, onRegisterSubmit]);

    return (
        <div className="flex flex-col items-center text-center w-full max-w-[520px] mx-auto">
            <h3 className="text-[20px] font-serif italic text-brand-text font-bold mt-2 mb-8">{title}</h3>

            <div
                className={`w-full max-w-[520px] rounded-2xl p-4 mb-2 border transition-all duration-300 ${
                    showEmptyWarning
                        ? 'border-brand-darkOrange shadow-[0_0_15px_rgba(194,58,34,0.15)]'
                        : (withBorder ? 'border-gray-200' : 'border-transparent')
                }`}
                style={{ backgroundColor: '#F3F4F6' }}
            >
                <textarea
                    value={value}
                    onChange={(e) => {
                        onChange(e.target.value);
                        if (showEmptyWarning) setShowEmptyWarning(false);
                    }}
                    placeholder={t('urgency.placeholder')}
                    rows={1}
                    className="w-full resize-none outline-none text-brand-text placeholder-gray-500 text-lg leading-relaxed bg-transparent"
                />
            </div>

            {showEmptyWarning && (
                <p className="w-full text-left text-brand-darkOrange text-sm font-medium mb-3 px-1 animate-fade-in">
                    {t('urgency.emptyWarning')}
                </p>
            )}

            <div className="w-full mb-6">
                <QuickTagsRow onSelect={onQuickFill} />
            </div>

            {/* 按钮留存逻辑但不展示，如需恢复可去掉注释 */}
            {/* <button
                onClick={handleSubmit}
                className="w-full max-w-[320px] bg-[#fae267] text-[#bc3813] font-sansita italic font-bold text-[20px] px-8 py-3 rounded-[100px] border border-[rgba(190,190,190,0.2)] shadow-lg transform transition-transform hover:scale-105 active:scale-95"
            >
                Help me start
            </button> */}
        </div>
    );
};

/**
 * 紧急启动视图：展示未完成任务、提供快捷标签（与 Onboarding 相同布局），并触发 AI 教练会话。
 *
 * @param {UrgencyViewProps} props - 任务数据与启动回调
 * @returns {JSX.Element} 含快捷标签滚动条、任务列表和自定义输入的视图
 */
export const UrgencyView: React.FC<UrgencyViewProps> = ({ tasks, onStartTask, onToggleComplete, onDeleteTask, onRegisterHelpMeStart }) => {
    const { t } = useTranslation();
    const [customTask, setCustomTask] = useState('');
    const [scrollTop, setScrollTop] = useState(0);
    const showStickyHeader = scrollTop > 80;
    // 显示今天所有未完成的任务（todo + routine_instance），不显示 routine 模板
    // 排除 displayTime === 'Now' 的任务（这些是即时任务，进行中不显示在列表中）
    const filteredTasks = tasks.filter(task => (task.type === 'todo' || task.type === 'routine_instance') && !task.completed && task.displayTime !== 'Now');

    const handleCustomTaskStart = useCallback(() => {
        const trimmed = customTask.trim();
        if (!trimmed) return;

        onStartTask({
            id: Date.now().toString(),
            text: trimmed,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            displayTime: 'Now',
            date: getLocalDateString(),
            completed: false,
            type: 'todo',
            category: 'morning',
            called: false,
        });
        setCustomTask('');
    }, [customTask, onStartTask]);

    return (
        <div
            className="flex-1 bg-transparent flex flex-col h-full relative overflow-y-auto no-scrollbar"
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        >
            {/* Sticky Top Bar (Floating) - 59pt 顶部留白适配 iPhone 刘海 */}
            <div className={`fixed top-0 left-0 right-0 bg-white z-50 flex items-end justify-start px-6 pb-3 pt-[59px] shadow-sm transition-all duration-300 ${showStickyHeader ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-full pointer-events-none'}`}>
                <span className="text-[24px] text-gray-900" style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 600 }}>{t('urgency.startWithLumi')}</span>
            </div>

            {/* Header - non-sticky, scrolls with content */}
            <div className="relative bg-brand-darkOrange pt-16 pb-4 flex flex-col items-center text-center transition-colors duration-500">
                {/* Fire Icon */}
                <div className="relative mb-6 w-32 h-32 flex items-center justify-center">
                    <img
                        src="/fire.png"
                        alt="Fire"
                        className="w-full h-full object-contain drop-shadow-lg"
                    />
                </div>

                <h1 className="w-full text-center text-[35px] text-[#ebebeb] capitalize leading-[38.99px] mb-1" style={{ fontFamily: "'Sansita One', sans-serif" }}>{t('urgency.getYouStart')}</h1>
                <h2 className="w-full text-center text-[58px] text-[#f3fa93] capitalize leading-[60.946px] mb-4" style={{ fontFamily: "'Sansita One', sans-serif" }}>{t('urgency.inFiveMinutes')}</h2>

                {/* SVG Curve Bottom */}
                <div className="absolute bottom-0 left-0 right-0 translate-y-[98%] z-10 overflow-visible">
                    <svg viewBox="0 0 1440 100" className="w-full h-auto block text-brand-darkOrange fill-current overflow-visible" preserveAspectRatio="none">
                        <path d="M0,0 L1440,0 L1440,20 Q720,200 0,20 Z" />
                    </svg>
                </div>
            </div>

            {/* Spacer */}
            <div className="h-14 bg-transparent flex-none"></div>

            {/* Body */}
            <div className="flex-1 px-6 pb-28">
                {/* List */}
                <div className="space-y-4">
                    {filteredTasks.length === 0 ? (
                        <div className="flex flex-col items-center text-center pt-0" data-tour="urgency-input-area">
                            <CustomTaskForm
                                title={t('urgency.enterTaskHere')}
                                value={customTask}
                                onChange={setCustomTask}
                                onSubmit={handleCustomTaskStart}
                                onQuickFill={setCustomTask}
                                onRegisterSubmit={onRegisterHelpMeStart}
                            />
                        </div>
                    ) : (
                        <>
                            <h3 className="text-center font-serif italic text-brand-text text-[20px] font-bold mb-6">{t('urgency.pickOneTask')}</h3>
                            {filteredTasks.map(task => (
                                <TaskItem
                                    key={task.id}
                                    task={task}
                                    mode="urgency"
                                    onToggle={onToggleComplete}
                                    onDelete={onDeleteTask}
                                    onStart={() => onStartTask(task)}
                                />
                            ))}
                        </>
                    )}
                </div>

                {/* Footer: Custom Task Input - Only show if tasks exist */}
                {filteredTasks.length > 0 && (
                    <div className="mt-16 mb-8" data-tour="urgency-input-area">
                        <div className="h-[1px] bg-gray-200 w-full mb-12"></div>
                        <CustomTaskForm
                            title={t('urgency.enterTaskHere')}
                            value={customTask}
                            onChange={setCustomTask}
                            onSubmit={handleCustomTaskStart}
                            withBorder
                            onQuickFill={setCustomTask}
                            onRegisterSubmit={onRegisterHelpMeStart}
                        />
                    </div>
                )}
            </div>
        </div>
    );
};
