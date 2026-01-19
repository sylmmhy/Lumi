import React from 'react';
import type { AppTab } from '../../constants/routes';

interface BottomNavBarProps {
    currentView: AppTab;
    onChange: (view: AppTab) => void;
    onStart?: () => void;
}

/**
 * 底部导航栏组件，负责在各个 tab 间切换并提供中间的快速 Start 按钮入口。
 */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({ currentView, onChange, onStart }) => (
    <div className="absolute bottom-0 left-0 right-0 bg-white h-20 px-6 flex items-center justify-around rounded-b-[40px] border-t border-gray-100 shadow-[0_-5px_20px_rgba(0,0,0,0.03)] z-[100]">
        <NavIcon
            icon="fa-phone"
            label="Calls"
            active={currentView === 'home'}
            onClick={() => onChange('home')}
        />
        <NavIcon
            icon="fa-chart-line"
            label="Progress"
            active={currentView === 'stats'}
            onClick={() => onChange('stats')}
        />

        {/* Big Center Button */}
        <div className="relative -top-5" data-tour="start-button">
            <button
                className="w-20 h-20 transform transition-transform hover:scale-105 active:scale-95"
                onClick={() => (onStart ? onStart() : onChange('urgency'))}
            >
                <img
                    src="/lumi.png"
                    alt="Start"
                    className="w-full h-full object-contain drop-shadow-[0_4px_10px_rgba(0,0,0,0.15)]"
                />
            </button>
        </div>

        <NavIcon
            icon="fa-trophy"
            label="Rank"
            active={currentView === 'leaderboard'}
            onClick={() => onChange('leaderboard')}
        />
        <NavIcon
            icon="fa-user"
            label="Me"
            active={currentView === 'profile'}
            onClick={() => onChange('profile')}
        />
    </div>
);

const NavIcon = ({ icon, label, active = false, onClick }: { icon: string, label: string, active?: boolean, onClick?: () => void }) => (
    <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-1 transition-colors ${active ? 'text-brand-orange' : 'text-gray-300 hover:text-gray-400'}`}
    >
        <i className={`fa-solid ${icon} text-xl`}></i>
        <span className="text-[10px] font-medium">{label}</span>
    </button>
);
