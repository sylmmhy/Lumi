import { useState, useEffect } from 'react';

/**
 * CoinCounter - 金币计数动画组件
 * 
 * 可用于：
 * - 任务完成奖励
 * - 打卡奖励
 * - 成就解锁奖励
 * - 任何需要显示金币增加的场景
 */

export interface CoinCounterProps {
  /** 目标金币数量 */
  targetCoins: number;
  /** 是否开始动画 */
  animate: boolean;
  /** 动画持续时间（毫秒），默认 1500 */
  duration?: number;
  /** 前缀符号，默认 "+" */
  prefix?: string;
  /** 金币图标 URL */
  coinIconUrl?: string;
  /** 字体大小，默认 "40px" */
  fontSize?: string;
  /** 动画完成回调 */
  onAnimationComplete?: () => void;
  /** 自定义样式 */
  className?: string;
}

export function CoinCounter({
  targetCoins,
  animate,
  duration = 1500,
  prefix = '+',
  coinIconUrl = '/coin.png',
  fontSize = '40px',
  onAnimationComplete,
  className = '',
}: CoinCounterProps) {
  const [displayCoins, setDisplayCoins] = useState(0);

  useEffect(() => {
    if (!animate) {
      setDisplayCoins(0);
      return;
    }

    const frameRate = 60;
    const totalFrames = (duration / 1000) * frameRate;
    const increment = targetCoins / totalFrames;

    let currentFrame = 0;
    const timer = setInterval(() => {
      currentFrame++;
      if (currentFrame >= totalFrames) {
        setDisplayCoins(targetCoins);
        clearInterval(timer);
        onAnimationComplete?.();
      } else {
        setDisplayCoins(Math.floor(increment * currentFrame));
      }
    }, 1000 / frameRate);

    return () => clearInterval(timer);
  }, [animate, targetCoins, duration, onAnimationComplete]);

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <span
        style={{
          fontFamily: 'Sansita, sans-serif',
          fontSize,
          fontWeight: 400,
          letterSpacing: '1.6px',
          background: 'linear-gradient(to bottom, #FAF078, #FFC92A)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {prefix}{displayCoins}
      </span>
      <img
        src={coinIconUrl}
        alt="Coin"
        style={{ width: '50px', height: '50px' }}
      />
    </div>
  );
}

/**
 * 静态金币显示组件（无动画）
 */
export interface StaticCoinDisplayProps {
  /** 金币数量 */
  coins: number;
  /** 前缀符号 */
  prefix?: string;
  /** 金币图标 URL */
  coinIconUrl?: string;
  /** 字体大小 */
  fontSize?: string;
  /** 自定义样式 */
  className?: string;
}

export function StaticCoinDisplay({
  coins,
  prefix = '',
  coinIconUrl = '/coin.png',
  fontSize = '24px',
  className = '',
}: StaticCoinDisplayProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <img
        src={coinIconUrl}
        alt="Coin"
        style={{ width: '24px', height: '24px' }}
      />
      <span
        style={{
          fontFamily: 'Sansita, sans-serif',
          fontSize,
          fontWeight: 400,
          color: '#FFC92A',
        }}
      >
        {prefix}{coins}
      </span>
    </div>
  );
}

