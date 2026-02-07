/**
 * StatsHeader - 统计页面头部组件（能量收集版）
 *
 * 设计理念：
 * - 森系暖绿背景，营造温暖治愈的氛围
 * - 居中标题布局
 * - EnergyBall 已移至 StatsView 以便控制层级
 */

import { forwardRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface StatsHeaderProps {
    /** Tab 切换（保留兼容性，暂时隐藏） */
    activeTab: 'routine' | 'done';
    /** Tab 切换回调 */
    onTabChange: (tab: 'routine' | 'done') => void;
    /** 当前显示的周标签（如 "This Week" 或 "Jan 27 - Feb 2"） */
    weekLabel?: string;
    /** 切换到上一周 */
    onPrevWeek?: () => void;
    /** 切换到下一周 */
    onNextWeek?: () => void;
    /** 是否可以向后（更近的周）切换 */
    canGoNext?: boolean;
}

/**
 * 统计页面头部组件
 *
 * 包含：
 * 1. 森系暖绿纯色背景
 * 2. 居中标语文案
 */
export const StatsHeader = forwardRef<HTMLDivElement, StatsHeaderProps>(({ weekLabel, onPrevWeek, onNextWeek, canGoNext }, ref) => {
    const { t } = useTranslation();

    return (
        <div
            ref={ref}
            className="relative w-full sticky top-0 z-30"
            data-tour="stats-header"
            style={{ backgroundColor: '#429950' }}
        >
            {/* 标题区域 - 居中布局，增加呼吸感 */}
            <div className="relative z-10 pt-20 pb-14 px-6 flex flex-col items-center text-center">
                <p
                    className="text-white/90 text-xl italic mb-2"
                    style={{ fontFamily: "'Sansita', 'Georgia', serif" }}
                >
                    {t('stats.slogan')}
                </p>
                <h1
                    className="text-white italic font-bold whitespace-nowrap"
                    style={{ fontFamily: "'Sansita', sans-serif", fontSize: 'clamp(28px, 10vw, 44px)' }}
                >
                    {t('stats.weeklyWins')}
                </h1>

                {/* 周切换指示器 */}
                {weekLabel && (
                    <div
                        className="flex items-center gap-3 mt-3"
                        style={{ fontFamily: "'Quicksand', sans-serif" }}
                    >
                        <button
                            onClick={onPrevWeek}
                            className="text-white/70 hover:text-white transition-colors px-1"
                            aria-label="Previous week"
                        >
                            <i className="fa-solid fa-chevron-left text-sm" />
                        </button>
                        <span
                            className={`text-sm font-semibold min-w-[140px] text-center ${
                                canGoNext === false ? 'text-white/90' : 'text-white/60'
                            }`}
                        >
                            {weekLabel}
                        </span>
                        <button
                            onClick={onNextWeek}
                            disabled={canGoNext === false}
                            className={`px-1 transition-colors ${
                                canGoNext === false
                                    ? 'text-white/20 cursor-default'
                                    : 'text-white/70 hover:text-white'
                            }`}
                            aria-label="Next week"
                        >
                            <i className="fa-solid fa-chevron-right text-sm" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
});

StatsHeader.displayName = 'StatsHeader';

export default StatsHeader;
