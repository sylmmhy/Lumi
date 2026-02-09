/**
 * CoinFlyAnimation - 金币飞行动画组件
 *
 * 用于任务完成后，显示金币从起点飞向终点的动画效果。
 * 配合音效和金币盒子动画，提供完整的奖励反馈。
 */

import React, { useEffect, useState } from 'react';

interface CoinFlyAnimationProps {
  /** 是否显示动画 */
  visible: boolean;
  /** 起点位置（相对于视口） */
  startPosition?: { x: number; y: number };
  /** 终点位置（相对于视口） */
  endPosition?: { x: number; y: number };
  /** 动画完成回调 */
  onComplete?: () => void;
  /** 金币数量（显示多少个金币） */
  coinCount?: number;
}

/**
 * 金币飞行动画组件
 *
 * 动画流程：
 * 1. 金币从起点放大出现
 * 2. 沿贝塞尔曲线飞向终点
 * 3. 到达终点后缩小消失
 * 4. 触发 onComplete 回调
 */
export const CoinFlyAnimation: React.FC<CoinFlyAnimationProps> = ({
  visible,
  startPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 },
  endPosition = { x: window.innerWidth / 2, y: 100 },
  onComplete,
  coinCount = 1,
}) => {
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    if (!visible) {
      setAnimating(false);
      return;
    }

    setAnimating(true);

    // 动画持续时间：800ms
    // 注意：音效由 StatsView 的 externalCheckInTrigger 统一播放
    const timer = setTimeout(() => {
      setAnimating(false);
      onComplete?.();
    }, 800);

    return () => {
      clearTimeout(timer);
    };
  }, [visible, onComplete]);

  if (!visible && !animating) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* 渲染多个金币（如果 coinCount > 1） */}
      {Array.from({ length: Math.min(coinCount, 5) }).map((_, index) => {
        // 为每个金币添加轻微的延迟和偏移，使动画更自然
        const delay = index * 100;
        const offsetX = (Math.random() - 0.5) * 40;

        return (
          <div
            key={index}
            className="absolute"
            style={{
              left: startPosition.x,
              top: startPosition.y,
              animation: `coin-fly-${index} 800ms cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards`,
              animationDelay: `${delay}ms`,
              ['--start-x' as string]: `${startPosition.x}px`,
              ['--start-y' as string]: `${startPosition.y}px`,
              ['--end-x' as string]: `${endPosition.x + offsetX}px`,
              ['--end-y' as string]: `${endPosition.y}px`,
              ['--offset-x' as string]: `${offsetX}px`,
            }}
          >
            <img
              src="/coins.png"
              alt="coin"
              className="w-12 h-12 object-contain"
              style={{
                filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.3))',
              }}
            />
          </div>
        );
      })}

      {/* CSS 动画定义 */}
      <style>{`
        @keyframes coin-fly-0 {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
          }
          10% {
            transform: translate(-50%, -50%) scale(1.2);
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(
              calc(var(--end-x) - var(--start-x)),
              calc(var(--end-y) - var(--start-y))
            ) scale(0.8);
            opacity: 0;
          }
        }

        @keyframes coin-fly-1 {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
          }
          10% {
            transform: translate(-50%, -50%) scale(1.1);
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(
              calc(var(--end-x) - var(--start-x) + var(--offset-x)),
              calc(var(--end-y) - var(--start-y))
            ) scale(0.8);
            opacity: 0;
          }
        }

        @keyframes coin-fly-2 {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
          }
          10% {
            transform: translate(-50%, -50%) scale(1.15);
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(
              calc(var(--end-x) - var(--start-x) + var(--offset-x)),
              calc(var(--end-y) - var(--start-y))
            ) scale(0.8);
            opacity: 0;
          }
        }

        @keyframes coin-fly-3 {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
          }
          10% {
            transform: translate(-50%, -50%) scale(1.05);
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(
              calc(var(--end-x) - var(--start-x) + var(--offset-x)),
              calc(var(--end-y) - var(--start-y))
            ) scale(0.8);
            opacity: 0;
          }
        }

        @keyframes coin-fly-4 {
          0% {
            transform: translate(-50%, -50%) scale(0.5);
            opacity: 0;
          }
          10% {
            transform: translate(-50%, -50%) scale(1.08);
            opacity: 1;
          }
          90% {
            opacity: 1;
          }
          100% {
            transform: translate(
              calc(var(--end-x) - var(--start-x) + var(--offset-x)),
              calc(var(--end-y) - var(--start-y))
            ) scale(0.8);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default CoinFlyAnimation;
