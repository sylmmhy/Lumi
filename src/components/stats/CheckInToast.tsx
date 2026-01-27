/**
 * CheckInToast - 打卡成功 Toast 组件
 *
 * 设计理念：
 * - 每次打卡成功后给予正向激励
 * - 随机文案增加趣味性
 * - 简洁不打扰的动画效果
 */

import React, { useEffect, useState } from 'react';

/** 激励文案池 */
const TOAST_MESSAGES = [
    "You showed up! That's a win.",
    "Nice one!",
    "又积攒了一次!",
    "Keep going!",
    "一步一步，稳稳前进",
    "坚持就是胜利",
    "Great job!",
    "Way to go!",
    "做得好!",
    "继续保持!",
];

interface CheckInToastProps {
    /** Toast 消息，为 null 时隐藏 */
    message: string | null;
    /** 显示持续时间（毫秒），默认 2000 */
    duration?: number;
    /** 关闭回调 */
    onClose?: () => void;
}

/**
 * 打卡成功 Toast 组件
 *
 * 功能：
 * 1. 从顶部滑入的 Toast 动画
 * 2. duration 毫秒后自动消失
 * 3. 可自定义消息或使用随机激励文案
 */
export const CheckInToast: React.FC<CheckInToastProps> = ({
    message,
    duration = 2000,
    onClose,
}) => {
    const [visible, setVisible] = useState(false);
    const [displayMessage, setDisplayMessage] = useState<string | null>(null);

    /* eslint-disable react-hooks/set-state-in-effect -- Toast 显示逻辑需要同步外部 message */
    useEffect(() => {
        if (message) {
            setDisplayMessage(message);
            setVisible(true);

            const timer = setTimeout(() => {
                setVisible(false);
                setTimeout(() => {
                    setDisplayMessage(null);
                    onClose?.();
                }, 300); // 等待退出动画完成
            }, duration);

            return () => clearTimeout(timer);
        }
    }, [message, duration, onClose]);
    /* eslint-enable react-hooks/set-state-in-effect */

    if (!displayMessage) return null;

    return (
        <div
            className={`
                fixed top-20 left-1/2 -translate-x-1/2 z-[200]
                px-6 py-3 rounded-full
                bg-brand-goldBorder text-white font-medium
                shadow-lg shadow-brand-goldBorder/30
                transition-all duration-300 ease-out
                ${visible
                    ? 'opacity-100 translate-y-0'
                    : 'opacity-0 -translate-y-4'
                }
            `}
            style={{ fontFamily: "'Quicksand', sans-serif" }}
        >
            {displayMessage}
        </div>
    );
};

/**
 * 获取随机激励文案
 * @returns 随机选取的激励文案
 */
// eslint-disable-next-line react-refresh/only-export-components -- 工具函数与组件紧密相关
export function getRandomToastMessage(): string {
    return TOAST_MESSAGES[Math.floor(Math.random() * TOAST_MESSAGES.length)];
}

/**
 * Hook: 管理 Toast 状态
 *
 * @example
 * const { toastMessage, showToast } = useCheckInToast();
 * // 打卡成功时调用
 * showToast(); // 显示随机文案
 * showToast("Custom message"); // 显示自定义文案
 */
// eslint-disable-next-line react-refresh/only-export-components -- Hook 与组件配套使用
export function useCheckInToast() {
    const [toastMessage, setToastMessage] = useState<string | null>(null);

    const showToast = (customMessage?: string) => {
        setToastMessage(customMessage || getRandomToastMessage());
    };

    const hideToast = () => {
        setToastMessage(null);
    };

    return {
        toastMessage,
        showToast,
        hideToast,
    };
}

export default CheckInToast;
