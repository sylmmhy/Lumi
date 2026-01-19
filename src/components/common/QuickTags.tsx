import React, { useEffect, useRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

/**
 * 快捷标签的数据定义
 * emoji: 显示的表情符号
 * key: i18n 翻译键
 */
export const QUICK_TAG_KEYS = [
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

/**
 * 快捷标签的样式变体
 * - gray: 灰色背景，用于白色背景页面（如 UrgencyView）
 * - blue: 蓝色背景，用于蓝色背景区域（如 HomeView 的输入区）
 */
export type QuickTagVariant = 'gray' | 'blue';

interface QuickTagProps {
    emoji: string;
    text: string;
    onClick: () => void;
    /** 样式变体，默认 'gray' */
    variant?: QuickTagVariant;
}

/**
 * 单个快捷标签按钮
 *
 * @param props.emoji - 显示的表情符号
 * @param props.text - 标签文字
 * @param props.onClick - 点击回调
 * @param props.variant - 样式变体 ('gray' | 'blue')
 */
export const QuickTag: React.FC<QuickTagProps> = ({ emoji, text, onClick, variant = 'gray' }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex-shrink-0 flex items-center gap-2 px-3 py-2.5 rounded-full transition-all duration-150 active:scale-[0.97] ${
            variant === 'blue'
                ? 'bg-brand-darkBlue/80 text-white hover:bg-brand-darkBlue'
                : 'border border-gray-200 bg-gray-100 text-gray-800 hover:bg-gray-200'
        }`}
    >
        <span className="text-[14px] leading-none">{emoji}</span>
        <span
            className="text-[14px] leading-none whitespace-nowrap"
            style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 500 }}
        >
            {text}
        </span>
    </button>
);

interface QuickTagsRowProps {
    /** 选择标签时的回调，参数为标签文字 */
    onSelect: (text: string) => void;
    /** 样式变体，默认 'gray' */
    variant?: QuickTagVariant;
    /** 容器的最大宽度，如 '345px'，不传则不限制 */
    maxWidth?: string;
    /** 额外的容器类名 */
    className?: string;
}

/**
 * 快捷标签滚动行组件
 *
 * 特性：
 * 1. 自动无限滚动动画
 * 2. 鼠标悬停或触摸时暂停滚动
 * 3. 支持灰色/蓝色两种样式变体
 *
 * @param props.onSelect - 选择标签时的回调
 * @param props.variant - 样式变体 ('gray' | 'blue')
 * @param props.maxWidth - 容器最大宽度
 * @param props.className - 额外的容器类名
 */
export const QuickTagsRow: React.FC<QuickTagsRowProps> = ({
    onSelect,
    variant = 'gray',
    maxWidth,
    className = ''
}) => {
    const { t } = useTranslation();
    const quickTagsScrollRef = useRef<HTMLDivElement | null>(null);
    const quickTagsAnimationRef = useRef<number | null>(null);
    const quickTagsVirtualScrollRef = useRef(0);
    const quickTagsPauseRef = useRef(false);

    // 将标签 key 翻译为当前语言的文字
    const QUICK_TAGS = QUICK_TAG_KEYS.map(tag => ({
        emoji: tag.emoji,
        text: t(tag.key),
    }));

    /** 暂停自动滚动（鼠标悬停或触摸时调用） */
    const pauseQuickTagsAutoScroll = () => {
        quickTagsPauseRef.current = true;
    };

    /** 恢复自动滚动 */
    const resumeQuickTagsAutoScroll = () => {
        quickTagsPauseRef.current = false;
    };

    // 自动滚动动画
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

    // 根据变体决定渐变背景颜色
    const gradientFromColor = variant === 'blue' ? 'from-brand-blue' : 'from-white';

    return (
        <div className={`w-full flex flex-col items-center gap-1 ${className}`}>
            <div
                className="relative w-full"
                style={maxWidth ? { maxWidth } : undefined}
            >
                {/* 左侧渐变遮罩 */}
                <div className={`absolute left-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-r ${gradientFromColor} to-transparent`} />
                {/* 右侧渐变遮罩 */}
                <div className={`absolute right-0 top-0 bottom-0 w-8 z-10 pointer-events-none bg-gradient-to-l ${gradientFromColor} to-transparent`} />

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
                    {/* 渲染两份标签实现无缝循环滚动 */}
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
