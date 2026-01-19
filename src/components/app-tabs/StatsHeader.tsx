/**
 * StatsHeader - 统计页面头部组件（能量收集版）
 *
 * 设计理念：
 * - 森系暖绿背景，营造温暖治愈的氛围
 * - 居中标题 + 底部悬挂能量球布局
 * - 物理隐喻：蓄水池/充能球效果
 */

import React from 'react';
import { EnergyBall } from '../stats/EnergyBall';
import { useTranslation } from '../../hooks/useTranslation';

interface StatsHeaderProps {
    /** Tab 切换（保留兼容性，暂时隐藏） */
    activeTab: 'routine' | 'done';
    /** Tab 切换回调 */
    onTabChange: (tab: 'routine' | 'done') => void;
    /** 本周完成数 */
    weeklyCount: number;
    /** 本周目标数 */
    weeklyTarget: number;
    /** 水位上涨动画触发器 */
    triggerRise?: boolean;
}

/**
 * 统计页面头部组件
 *
 * 包含：
 * 1. 森系暖绿纯色背景
 * 2. 居中标语文案
 * 3. 底部悬挂的蓄水池/充能球进度组件
 */
export const StatsHeader: React.FC<StatsHeaderProps> = ({
    weeklyCount,
    weeklyTarget,
    triggerRise = false,
}) => {
    const { t } = useTranslation();

    return (
        <div
            className="relative w-full"
            data-tour="stats-header"
            style={{ backgroundColor: '#429950' }}
        >
            {/* 标题区域 - 居中布局 */}
            <div className="relative z-10 pt-16 pb-16 px-6 flex flex-col items-center text-center">
                <p
                    className="text-white/90 text-xl italic mb-2"
                    style={{ fontFamily: "'Sansita', 'Georgia', serif" }}
                >
                    {t('stats.slogan')}
                </p>
                <h1
                    className="text-white text-3xl font-bold"
                    style={{ fontFamily: "'Noto Sans SC', sans-serif" }}
                >
                    {t('stats.monthlyMission')} ⚡
                </h1>
            </div>

            {/* 底部悬挂的能量球 - 一半在绿色区域，一半在白色区域 */}
            <div className="absolute left-1/2 -translate-x-1/2 bottom-0 translate-y-1/2 z-20">
                <EnergyBall
                    current={weeklyCount}
                    target={weeklyTarget}
                    triggerRise={triggerRise}
                />
            </div>
        </div>
    );
};

export default StatsHeader;
