/**
 * CoinRewardToast - 任务完成金币奖励 Toast
 *
 * 在 out-of-session（HomeView 手动勾选）完成任务后显示 "+N coins" 浮动提示。
 * 设计风格：白色圆角胶囊 + 金色边框 + 金币图标，与 CheckInToast 一致的动画模式。
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';

interface CoinRewardToastProps {
  /** 显示的金币数量，null 时隐藏 */
  coins: number | null;
  /** 关闭回调 */
  onClose?: () => void;
}

/**
 * 金币奖励浮动 Toast 组件
 *
 * - Fixed 定位，水平居中，top: 380px（在 CheckInToast 440px 上方）
 * - 白色圆角胶囊 + 金色边框
 * - 自动 2.5s 后消失
 */
export const CoinRewardToast: React.FC<CoinRewardToastProps> = ({
  coins,
  onClose,
}) => {
  const [visible, setVisible] = useState(false);
  const [displayCoins, setDisplayCoins] = useState<number | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /* eslint-disable react-hooks/set-state-in-effect -- Toast 显示逻辑需要同步外部 coins */
  useEffect(() => {
    if (coins !== null) {
      setDisplayCoins(coins);
      setVisible(true);

      // 播放金币音效
      const audio = new Audio('/coin-drop-sound.wav');
      audio.volume = 0.7;
      audio.play().catch((err) => {
        console.log('CoinRewardToast 音效播放失败:', err);
      });

      const dismissTimer = setTimeout(() => {
        setVisible(false);
        const cleanupTimer = setTimeout(() => {
          setDisplayCoins(null);
          onClose?.();
        }, 300); // 等待退出动画完成
        timersRef.current.push(cleanupTimer);
      }, 2500);
      timersRef.current.push(dismissTimer);

      return () => {
        timersRef.current.forEach(clearTimeout);
        timersRef.current = [];
        audio.pause();
        audio.src = '';
      };
    }
  }, [coins, onClose]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (displayCoins === null) return null;

  return (
    <div
      className={`
        fixed left-1/2 -translate-x-1/2 z-[200]
        px-5 py-2.5 rounded-full
        bg-white border border-brand-goldBorder
        shadow-lg shadow-brand-goldBorder/20
        flex items-center gap-2
        transition-all duration-300 ease-out
        ${visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-4'
        }
      `}
      style={{ top: 380 }}
    >
      <img src="/coin.png" alt="coin" className="w-5 h-5" />
      <span
        style={{
          fontFamily: "'Sansita', sans-serif",
          fontSize: '18px',
          fontWeight: 700,
          background: 'linear-gradient(to bottom, #FAF078, #FFC92A)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        +{displayCoins}
      </span>
    </div>
  );
};

/**
 * Hook: 管理金币奖励 Toast 状态
 *
 * @example
 * const { coins, showCoinToast, hideCoinToast } = useCoinRewardToast();
 * showCoinToast(100); // 显示 "+100" 金币 Toast
 */
// eslint-disable-next-line react-refresh/only-export-components -- Hook 与组件配套使用
export function useCoinRewardToast() {
  const [coins, setCoins] = useState<number | null>(null);

  const showCoinToast = useCallback((amount: number) => {
    setCoins(amount);
  }, []);

  const hideCoinToast = useCallback(() => {
    setCoins(null);
  }, []);

  return {
    coins,
    showCoinToast,
    hideCoinToast,
  };
}

export default CoinRewardToast;
