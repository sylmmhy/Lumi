import React, { useCallback, useEffect, useState } from 'react';

import type { Task } from '../../remindMe/types';
import { getLocalDateString } from '../../utils/timeUtils';
import { useTranslation } from '../../hooks/useTranslation';
import { QuickTagsRow } from '../common/QuickTags';

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
                <QuickTagsRow onSelect={onQuickFill} maxWidth="345px" />
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
export const UrgencyView: React.FC<UrgencyViewProps> = ({ onStartTask, onRegisterHelpMeStart }) => {
    const { t } = useTranslation();
    const [customTask, setCustomTask] = useState('');
    const [scrollTop, setScrollTop] = useState(0);
    const showStickyHeader = scrollTop > 80;

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
                {/* 只显示输入框，不显示任务列表 */}
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
            </div>
        </div>
    );
};
