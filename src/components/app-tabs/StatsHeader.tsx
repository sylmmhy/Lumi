/**
 * StatsHeader - 统计页面头部组件（蓄水池版）
 *
 * 设计理念：
 * - 去压力化：不展示"连胜/断签"，只展示本周累计
 * - 物理隐喻：蓄水池/充能球效果
 * - 正向激励：每完成一个任务，水位上涨
 */

import React from 'react';
import headerBg from '../../assets/stats-header-bg.png';
import { WaterTankProgress } from '../stats/WaterTankProgress';

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
 * 1. 绿色背景图
 * 2. 蓄水池进度组件（替代原来的连胜圆圈）
 * 3. Routine/Done Tab（暂时隐藏）
 */
export const StatsHeader: React.FC<StatsHeaderProps> = ({
    weeklyCount,
    weeklyTarget,
    triggerRise = false,
}) => {
    return (
        <div className="relative w-full overflow-hidden" data-tour="stats-header">
            {/* 背景图 */}
            <div className="absolute top-0 left-0 w-full h-[220px] z-0">
                <img
                    src={headerBg}
                    alt="Background"
                    className="w-full h-full object-cover align-top"
                />
            </div>

            {/* 内容区域 */}
            <div className="relative z-10 pt-16 pb-8 px-6">
                {/* 蓄水池组件 */}
                <WaterTankProgress
                    current={weeklyCount}
                    target={weeklyTarget}
                    slogan="You're building momentum!"
                    triggerRise={triggerRise}
                />
            </div>
        </div>
    );
};

export default StatsHeader;
