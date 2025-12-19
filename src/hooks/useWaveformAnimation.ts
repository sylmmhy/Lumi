import { useState, useEffect, useRef } from 'react';

/**
 * Waveform Animation Hook - 波形动画
 * 
 * 职责：
 * - 管理 AI 说话时的波形动画
 * - 提供平滑的动画效果
 */

export interface UseWaveformAnimationOptions {
  /** 是否启用动画 */
  enabled: boolean;
  /** AI 是否正在说话 */
  isSpeaking: boolean;
  /** 波形条数量，默认 4 */
  barCount?: number;
  /** 基础高度，默认 10 */
  baseHeight?: number;
  /** 最大高度，默认 50 */
  maxHeight?: number;
}

export function useWaveformAnimation(options: UseWaveformAnimationOptions) {
  const {
    enabled,
    isSpeaking,
    barCount = 4,
    baseHeight = 10,
    maxHeight = 50,
  } = options;

  // 初始化波形高度
  const [heights, setHeights] = useState<number[]>(
    Array(barCount).fill(baseHeight)
  );

  // 方差因子，用于创建自然的波形效果
  const varianceRef = useRef([0.8, 1.0, 0.9, 0.7]);

  useEffect(() => {
    if (!enabled) return;

    let animationFrameId: number;
    let frameCount = 0;

    const updateWaveform = () => {
      frameCount++;

      // 性能优化：每 4 帧更新一次，让动画更平滑优雅
      if (frameCount % 4 === 0) {
        if (isSpeaking) {
          // AI 正在说话：创建戏剧性的动画效果
          const newHeights = varianceRef.current.slice(0, barCount).map((v) => {
            // 极端随机变化 (0.2 到 1.0) 以实现高对比度
            const random = Math.random() * 0.8 + 0.2;
            const intensity = random * v;
            return baseHeight + (maxHeight - baseHeight) * intensity;
          });

          setHeights(newHeights);
        } else {
          // AI 没有说话：快速返回最小高度
          setHeights((prev) =>
            prev.map((h) => Math.max(baseHeight, h - 3))
          );
        }
      }

      animationFrameId = requestAnimationFrame(updateWaveform);
    };

    animationFrameId = requestAnimationFrame(updateWaveform);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [enabled, isSpeaking, barCount, baseHeight, maxHeight]);

  return {
    heights,
  };
}

// 注意：useCelebrationAnimation 已移至独立文件 ./useCelebrationAnimation.ts
// 请从 './useCelebrationAnimation' 或 './index' 导入
