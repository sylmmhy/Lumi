/**
 * 统计模块导出
 * 集中导出所有统计相关的组件、类型和辅助函数
 */

// 组件
export { StatsCard } from './StatsCard';
export { DoneHistoryView } from './DoneHistoryView';
export { HeatmapDetailOverlay } from './HeatmapDetailOverlay';
export { EnergyBall } from './EnergyBall';
export { MilestoneProgressBar } from './MilestoneProgressBar';
export { CheckInToast, getRandomToastMessage, useCheckInToast } from './CheckInToast';
export { CoinRewardToast, useCoinRewardToast } from './CoinRewardToast';

// 类型
export type { Habit, HabitTheme, HeatmapDay, MonthLabel, CalendarDay, WeeklyProgress } from './types';
export { themeColorMap, taskToHabit } from './types';

// 辅助函数
export {
    getFixedHeatmapData,
    calculateCurrentStreak,
    getCalendarData,
    buildExampleHistory,
    buildDenseHistoryWithGaps,
} from './heatmapHelpers';
