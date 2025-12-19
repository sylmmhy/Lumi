import { useState, useEffect } from 'react';

// 导入动画样式
import './effects.css';

/**
 * LevelProgressBar - 等级进度条组件
 * 
 * 可用于：
 * - 用户等级进度
 * - 任务完成进度
 * - 成就解锁进度
 * - 任何需要显示进度的场景
 */

export interface LevelProgressBarProps {
  /** 当前进度百分比 (0-100) */
  progress: number;
  /** 是否播放填充动画 */
  animate?: boolean;
  /** 动画持续时间（毫秒），默认 1500 */
  animationDuration?: number;
  /** 等级文字，如 "LEVEL:1" */
  levelText?: string;
  /** 右侧图标 URL */
  iconUrl?: string;
  /** 右侧图标 alt 文字 */
  iconAlt?: string;
  /** 进度条高度，默认 "16px" */
  barHeight?: string;
  /** 进度条背景色，默认 "#E5E5E5" */
  backgroundColor?: string;
  /** 进度条填充渐变起始色 */
  gradientStart?: string;
  /** 进度条填充渐变结束色 */
  gradientEnd?: string;
  /** 是否显示闪光效果 */
  showShimmer?: boolean;
  /** 动画完成回调 */
  onAnimationComplete?: () => void;
  /** 自定义样式 */
  className?: string;
}

export function LevelProgressBar({
  progress,
  animate = false,
  animationDuration = 1500,
  levelText = 'LEVEL:1',
  iconUrl = '/Crow.png',
  iconAlt = 'Crown',
  barHeight = '16px',
  backgroundColor = '#E5E5E5',
  gradientStart = '#FFD700',
  gradientEnd = '#FFA500',
  showShimmer = true,
  onAnimationComplete,
  className = '',
}: LevelProgressBarProps) {
  const [displayProgress, setDisplayProgress] = useState(animate ? 0 : progress);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (!animate) {
      setDisplayProgress(progress);
      return;
    }

    setIsAnimating(true);
    const frameRate = 60;
    const totalFrames = (animationDuration / 1000) * frameRate;
    const increment = progress / totalFrames;

    let currentFrame = 0;
    const timer = setInterval(() => {
      currentFrame++;
      if (currentFrame >= totalFrames) {
        setDisplayProgress(progress);
        setIsAnimating(false);
        clearInterval(timer);
        onAnimationComplete?.();
      } else {
        setDisplayProgress(Math.floor(increment * currentFrame));
      }
    }, 1000 / frameRate);

    return () => clearInterval(timer);
  }, [animate, progress, animationDuration, onAnimationComplete]);

  return (
    <div
      className={`flex items-center justify-between ${className}`}
      style={{
        width: '100%',
        maxWidth: '323px',
        padding: '12px',
        borderRadius: '16px',
        backgroundColor: '#2E2B28',
      }}
    >
      <div className="flex flex-col gap-2" style={{ flex: 1, marginRight: '12px' }}>
        {/* 等级标签 */}
        <p
          style={{
            fontFamily: 'Sansita, sans-serif',
            fontSize: '18px',
            fontWeight: 400,
            color: '#FFFFFF',
            textTransform: 'uppercase',
            margin: 0,
          }}
        >
          {levelText}
        </p>
        
        {/* 进度条 */}
        <div
          style={{
            width: '100%',
            height: barHeight,
            borderRadius: '8px',
            backgroundColor,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* 填充部分 */}
          <div
            style={{
              width: `${displayProgress}%`,
              height: '100%',
              background: `linear-gradient(to right, ${gradientStart}, ${gradientEnd})`,
              borderRadius: '8px',
              position: 'absolute',
              top: 0,
              left: 0,
              transition: animate ? 'none' : 'width 0.3s ease',
            }}
          />
          
          {/* 闪光效果 */}
          {showShimmer && isAnimating && displayProgress < progress && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '25%',
                height: '100%',
                background: 'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0) 100%)',
                animation: 'shimmer 1.5s ease-in-out forwards',
                pointerEvents: 'none',
              }}
            />
          )}
        </div>
      </div>
      
      {/* 右侧图标 */}
      {iconUrl && (
        <img
          src={iconUrl}
          alt={iconAlt}
          style={{ width: '38px', height: '36px', flexShrink: 0 }}
        />
      )}
    </div>
  );
}

/**
 * 简化版进度条（无等级标签和图标）
 */
export interface SimpleProgressBarProps {
  /** 当前进度百分比 (0-100) */
  progress: number;
  /** 进度条高度 */
  height?: string;
  /** 进度条宽度 */
  width?: string;
  /** 背景色 */
  backgroundColor?: string;
  /** 填充色（单色） */
  fillColor?: string;
  /** 或使用渐变 */
  gradientStart?: string;
  gradientEnd?: string;
  /** 是否显示百分比文字 */
  showPercentage?: boolean;
  /** 圆角 */
  borderRadius?: string;
  /** 自定义样式 */
  className?: string;
}

export function SimpleProgressBar({
  progress,
  height = '8px',
  width = '100%',
  backgroundColor = '#E5E5E5',
  fillColor,
  gradientStart = '#FFD700',
  gradientEnd = '#FFA500',
  showPercentage = false,
  borderRadius = '4px',
  className = '',
}: SimpleProgressBarProps) {
  const fillStyle = fillColor
    ? { backgroundColor: fillColor }
    : { background: `linear-gradient(to right, ${gradientStart}, ${gradientEnd})` };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        style={{
          width,
          height,
          borderRadius,
          backgroundColor,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            height: '100%',
            borderRadius,
            position: 'absolute',
            top: 0,
            left: 0,
            transition: 'width 0.3s ease',
            ...fillStyle,
          }}
        />
      </div>
      {showPercentage && (
        <span
          style={{
            fontFamily: 'Inter, sans-serif',
            fontSize: '12px',
            color: '#888',
            minWidth: '36px',
          }}
        >
          {Math.round(progress)}%
        </span>
      )}
    </div>
  );
}

