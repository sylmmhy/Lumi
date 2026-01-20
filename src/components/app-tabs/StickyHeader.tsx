import React from 'react';

interface StickyHeaderProps {
    /** 标题文字 */
    title: string;
    /** 背景颜色 (Tailwind class 或 CSS 颜色值) */
    bgColor: string;
    /** 是否显示 */
    visible: boolean;
}

/**
 * 通用的 Sticky 顶部栏组件
 * 当页面滚动时渐显，显示当前页面标题
 *
 * @example
 * <StickyHeader
 *   title="Setting Call"
 *   bgColor="bg-brand-blue"
 *   visible={scrollTop > 80}
 * />
 */
export const StickyHeader: React.FC<StickyHeaderProps> = ({ title, bgColor, visible }) => {
    // 判断 bgColor 是 Tailwind class 还是 CSS 颜色值
    const isTailwindClass = bgColor.startsWith('bg-');

    return (
        <div
            className={`
                absolute top-0 left-0 right-0 z-50
                flex items-end justify-start px-6 pb-3 pt-[59px]
                shadow-sm transition-opacity duration-500
                ${isTailwindClass ? bgColor : ''}
                ${visible ? 'opacity-100' : 'opacity-0 pointer-events-none'}
            `}
            style={isTailwindClass ? undefined : { backgroundColor: bgColor }}
        >
            <span
                className="text-[24px] text-white"
                style={{ fontFamily: "'Quicksand', sans-serif", fontWeight: 600 }}
            >
                {title}
            </span>
        </div>
    );
};
