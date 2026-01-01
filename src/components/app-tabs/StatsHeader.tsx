import React from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import headerBg from '../../assets/stats-header-bg.png';
import streakCircle from '../../assets/stats-streak-circle.png';

interface StatsHeaderProps {
    activeTab: 'routine' | 'done';
    onTabChange: (tab: 'routine' | 'done') => void;
    streak: number;
}

/**
 * 统计页面的头部组件
 * 包含：
 * 1. 绿色背景图
 * 2. 连续打卡天数显示 (Streak)
 * 3. Routine/Done 切换 Tabs
 * 
 * @param props
 */
export const StatsHeader: React.FC<StatsHeaderProps> = ({ activeTab, onTabChange, streak }) => {
    const { t } = useTranslation();

    return (
        <div className="relative w-full overflow-hidden">
            {/* Background Shape */}
            <div className="absolute top-0 left-0 w-full h-[160px] z-0">
                <img 
                    src={headerBg} 
                    alt="Background" 
                    className="w-full h-full object-cover align-top"
                />
            </div>

            {/* Content Container */}
            <div className="relative z-10 pt-20 pb-4 px-6 flex flex-col items-center">
                
                {/* Streak Section - scales proportionally on narrow screens */}
                <div
                    className="flex items-center gap-10 mb-0 origin-center"
                    style={{
                        transform: 'scale(clamp(0.65, calc((100vw - 3rem) / 24rem), 1))',
                    }}
                >
                    {/* Yellow Circle with Number */}
                    <div className="relative w-28 h-28 flex-shrink-0">
                        <img
                            src={streakCircle}
                            alt="Streak Circle"
                            className="w-full h-full object-contain drop-shadow-md scale-110"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[#45a259] text-6xl font-bold italic font-serif tracking-widest pt-0 pl-2">
                                {streak}
                            </span>
                        </div>
                    </div>

                    {/* Text / Decoration */}
                    <div className="flex-shrink-0 pt-2 -translate-y-3">
                        <span
                            className="text-4xl font-extrabold italic text-white whitespace-nowrap"
                            style={{
                                fontFamily: "'Sansita', sans-serif",
                                WebkitTextStroke: '4px #388444',
                                paintOrder: 'stroke fill'
                            }}
                        >
                            {t('stats.dayStreak')}&nbsp;
                            <span className="relative inline-block">
                                <span className="absolute -right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-[#E8C547] rounded-full -z-10"></span>
                                <span className="relative z-10 text-white">!</span>
                            </span>
                        </span>
                    </div>
                </div>

                {/* Tabs Section */}
                <div className="flex gap-4 w-full max-w-sm justify-end pb-6">
                    <button
                        onClick={() => onTabChange('routine')}
                        className={`
                            px-8 py-2.5 rounded-full text-base font-bold italic transition-all shadow-sm
                            ${activeTab === 'routine'
                                ? 'bg-[#388444] text-white border border-[#e4e4e4]/20'
                                : 'bg-[#f5f0f0] text-[#b9b8ac] border border-[#e4e4e4]'}
                        `}
                        style={{ fontFamily: "'Sansita', sans-serif" }}
                    >
                        {t('stats.routineTab')}
                    </button>
                    <button
                        onClick={() => onTabChange('done')}
                        className={`
                            px-8 py-2.5 rounded-full text-base font-bold italic transition-all shadow-sm
                            ${activeTab === 'done'
                                ? 'bg-[#388444] text-white border border-[#e4e4e4]/20'
                                : 'bg-[#f5f0f0] text-[#b9b8ac] border border-[#e4e4e4]'}
                        `}
                        style={{ fontFamily: "'Sansita', sans-serif" }}
                    >
                        {t('stats.doneTab')}
                    </button>
                </div>
            </div>
        </div>
    );
};
