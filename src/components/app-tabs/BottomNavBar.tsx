import React, { useState } from 'react';
import type { AppTab } from '../../constants/routes';
import { usePermission } from '../../hooks/usePermission';
import { PermissionAlertModal } from '../modals/PermissionAlertModal';
import { useTranslation } from '../../hooks/useTranslation';

interface BottomNavBarProps {
    currentView: AppTab;
    onChange: (view: AppTab) => void;
}

/**
 * 底部导航栏组件，负责在各个 tab 间切换并提供中间的快速 Start 按钮入口。
 *
 * 功能：
 * 1. 四个 Tab 导航（Calls, Progress, Rank, Me）
 * 2. 中间的 Start 按钮
 * 3. Profile (Me) 图标上显示权限提示红点
 * 4. 点击红点时弹出权限提示弹窗
 */
export const BottomNavBar: React.FC<BottomNavBarProps> = ({ currentView, onChange }) => {
    const { t } = useTranslation();
    // 获取权限状态
    const { shouldShowBadge } = usePermission();
    // 控制权限提示弹窗的显示
    const [showPermissionModal, setShowPermissionModal] = useState(false);

    /**
     * 处理 Profile (Me) 图标点击
     * 如果有权限提示红点，先显示弹窗；否则正常切换到 profile 页面
     */
    const handleProfileClick = () => {
        if (shouldShowBadge && currentView !== 'profile') {
            // 有权限提示且不在 profile 页面，显示弹窗
            setShowPermissionModal(true);
        }
        // 无论如何都切换到 profile 页面
        onChange('profile');
    };

    return (
        <>
    <div className="absolute bottom-0 left-0 right-0 bg-white px-6 flex items-center border-t border-gray-100 shadow-[0_-5px_20px_rgba(0,0,0,0.03)] z-[100] pt-2" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}>
        {/* 左侧两个图标，占据一半宽度 */}
        <div className="flex-1 flex justify-around">
            <NavIcon
                icon="fa-phone"
                label={t('nav.calls')}
                active={currentView === 'home'}
                onClick={() => onChange('home')}
            />
            <NavIcon
                icon="fa-chart-line"
                label={t('nav.progress')}
                active={currentView === 'stats'}
                onClick={() => onChange('stats')}
            />
        </div>

        {/* Big Center Button - 固定宽度，真正居中 */}
        {/* 点击后始终跳转到 urgency 页面，开始按钮在页面内 */}
        <div className="relative -top-6 flex-shrink-0" data-tour="start-button">
            <button
                className="w-16 h-16 transform transition-transform hover:scale-105 active:scale-95"
                onClick={() => onChange('urgency')}
            >
                <img
                    src="/lumi.png"
                    alt="Start"
                    className="w-full h-full object-contain drop-shadow-[0_2px_4px_rgba(0,0,0,0.12)]"
                />
            </button>
        </div>

        {/* 右侧两个图标，占据一半宽度 */}
        <div className="flex-1 flex justify-around">
            <NavIcon
                icon="fa-trophy"
                label={t('nav.rank')}
                active={currentView === 'leaderboard'}
                onClick={() => onChange('leaderboard')}
            />
            <NavIcon
                icon="fa-user"
                label={t('nav.me')}
                active={currentView === 'profile'}
                onClick={handleProfileClick}
                showBadge={shouldShowBadge}
            />
        </div>
    </div>

    {/* 权限提示弹窗 */}
    <PermissionAlertModal
        isOpen={showPermissionModal}
        onClose={() => setShowPermissionModal(false)}
    />
        </>
    );
};

/**
 * 导航图标组件
 *
 * @param icon - Font Awesome 图标类名
 * @param label - 图标下方的标签文字
 * @param active - 是否为当前选中状态
 * @param onClick - 点击回调
 * @param showBadge - 是否显示红点提示（iOS 风格）
 */
const NavIcon = ({
    icon,
    label,
    active = false,
    onClick,
    showBadge = false,
}: {
    icon: string;
    label: string;
    active?: boolean;
    onClick?: () => void;
    showBadge?: boolean;
}) => (
    <button
        onClick={onClick}
        className={`relative flex flex-col items-center justify-center gap-1 transition-colors ${active ? 'text-brand-orange' : 'text-gray-300 hover:text-gray-400'}`}
    >
        {/* 图标容器 - 用于定位红点 */}
        <div className="relative">
            <i className={`fa-solid ${icon} text-xl`}></i>
            {/* iOS 风格红点 */}
            {showBadge && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white" />
            )}
        </div>
        <span className="text-[10px] font-medium">{label}</span>
    </button>
);
