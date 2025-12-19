import React from 'react';
import headerBg from '../../assets/stats-header-bg.png';
import streakCircle from '../../assets/stats-streak-circle.png';
import headerDecoration from '../../assets/stats-header-decoration.png';

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
                
                {/* Streak Section */}
                <div className="flex items-center gap-10 mb-0 w-full max-w-sm mx-auto">
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
                    <div className="flex-1 pt-2">
                        <img 
                            src={headerDecoration} 
                            alt="Header Decoration" 
                            className="h-auto w-auto max-h-12 object-contain drop-shadow-sm -translate-y-3"
                        />
                    </div>
                </div>

                {/* Tabs Section */}
                <div className="flex gap-4 w-full max-w-sm justify-end pb-6">
                    <button
                        onClick={() => onTabChange('routine')}
                        className={`
                            px-8 py-2.5 rounded-full text-base font-bold italic font-serif transition-all shadow-sm
                            ${activeTab === 'routine' 
                                ? 'bg-[#388444] text-white border border-[#e4e4e4]/20' 
                                : 'bg-[#f5f0f0] text-[#b9b8ac] border border-[#e4e4e4]'}
                        `}
                    >
                        Routine
                    </button>
                    <button
                        onClick={() => onTabChange('done')}
                        className={`
                            px-8 py-2.5 rounded-full text-base font-bold italic font-serif transition-all shadow-sm
                            ${activeTab === 'done' 
                                ? 'bg-[#388444] text-white border border-[#e4e4e4]/20' 
                                : 'bg-[#f5f0f0] text-[#b9b8ac] border border-[#e4e4e4]'}
                        `}
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};
