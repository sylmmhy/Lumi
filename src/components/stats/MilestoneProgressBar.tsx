/**
 * MilestoneProgressBar - 里程碑进度条组件
 *
 * 设计理念：
 * - 展示累计完成次数，永不清零
 * - 给用户"积累"的正向反馈
 * - 里程碑提供阶段性成就感
 */

import React from 'react';

/** 默认里程碑数组 */
const DEFAULT_MILESTONES = [10, 30, 60, 100, 200, 500];

interface MilestoneProgressBarProps {
    /** 累计完成次数（永不清零） */
    totalCount: number;
    /** 自定义里程碑数组 */
    milestones?: number[];
    /** 主题颜色：gold | blue | pink */
    theme?: 'gold' | 'blue' | 'pink';
}

/**
 * 计算当前所在的里程碑区间和进度
 *
 * @param totalCount - 累计完成次数
 * @param milestones - 里程碑数组
 * @returns { progress, prevMilestone, nextMilestone }
 */
function getMilestoneProgress(totalCount: number, milestones: number[] = DEFAULT_MILESTONES) {
    let prevMilestone = 0;
    let nextMilestone = milestones[0];

    for (let i = 0; i < milestones.length; i++) {
        if (totalCount < milestones[i]) {
            nextMilestone = milestones[i];
            prevMilestone = i > 0 ? milestones[i - 1] : 0;
            break;
        }
        // 超过最高里程碑
        if (i === milestones.length - 1) {
            prevMilestone = milestones[i];
            nextMilestone = milestones[i]; // 满格
        }
    }

    // 计算进度百分比
    const range = nextMilestone - prevMilestone;
    const progress = range > 0 ? (totalCount - prevMilestone) / range : 1;

    return {
        progress: Math.min(progress, 1),
        prevMilestone,
        nextMilestone,
    };
}

/**
 * 主题颜色映射
 */
const themeColors = {
    gold: {
        bg: 'bg-brand-goldBorder',
        bgLight: 'bg-brand-goldBorder/20',
        text: 'text-brand-goldBorder',
    },
    blue: {
        bg: 'bg-brand-heatmapBlue',
        bgLight: 'bg-brand-heatmapBlue/20',
        text: 'text-brand-heatmapBlue',
    },
    pink: {
        bg: 'bg-brand-heatmapPink',
        bgLight: 'bg-brand-heatmapPink/20',
        text: 'text-brand-heatmapPink',
    },
};

/**
 * 里程碑进度条组件
 *
 * 功能：
 * 1. 显示当前进度条（从上一个里程碑到下一个里程碑）
 * 2. 进度条右侧显示 "当前数 / 下一里程碑"
 * 3. 超过最高里程碑时显示满格
 */
export const MilestoneProgressBar: React.FC<MilestoneProgressBarProps> = ({
    totalCount,
    milestones = DEFAULT_MILESTONES,
    theme = 'gold',
}) => {
    const { progress, nextMilestone } = getMilestoneProgress(totalCount, milestones);
    const colors = themeColors[theme];

    // 检查是否超过所有里程碑
    const isMaxed = totalCount >= milestones[milestones.length - 1];

    return (
        <div className="flex items-center gap-2 mt-3">
            {/* 进度条容器 */}
            <div className={`flex-1 h-2 rounded-full ${colors.bgLight} overflow-hidden`}>
                {/* 进度条填充 */}
                <div
                    className={`h-full rounded-full transition-all duration-500 ease-out ${colors.bg}`}
                    style={{ width: `${progress * 100}%` }}
                />
            </div>

            {/* 数字显示 */}
            <span className={`text-xs font-medium ${colors.text} min-w-[50px] text-right`}>
                {isMaxed ? (
                    <>
                        {totalCount} <span className="opacity-60">MAX</span>
                    </>
                ) : (
                    `${totalCount}/${nextMilestone}`
                )}
            </span>
        </div>
    );
};

export default MilestoneProgressBar;
