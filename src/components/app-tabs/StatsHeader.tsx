/**
 * StatsHeader - 统计页面头部组件（能量收集版）
 *
 * 设计理念：
 * - 森系暖绿背景，营造温暖治愈的氛围
 * - 居中标题布局
 * - EnergyBall 已移至 StatsView 以便控制层级
 */

import React, { forwardRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

interface StatsHeaderProps {
    /** Tab 切换（保留兼容性，暂时隐藏） */
    activeTab: 'routine' | 'done';
    /** Tab 切换回调 */
    onTabChange: (tab: 'routine' | 'done') => void;
}

/**
 * 统计页面头部组件
 *
 * 包含：
 * 1. 森系暖绿纯色背景
 * 2. 居中标语文案
 */
export const StatsHeader = forwardRef<HTMLDivElement, StatsHeaderProps>((_props, ref) => {
    const { t } = useTranslation();

    return (
        <div
            ref={ref}
            className="relative w-full sticky top-0 z-30"
            data-tour="stats-header"
            style={{ backgroundColor: '#429950' }}
        >
            {/* 标题区域 - 居中布局，增加呼吸感 */}
            <div className="relative z-10 pt-20 pb-20 px-6 flex flex-col items-center text-center">
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
            </div>
        </div>
    );
});

StatsHeader.displayName = 'StatsHeader';

export default StatsHeader;
