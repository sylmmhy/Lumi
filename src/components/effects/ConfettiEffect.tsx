import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Confetti from 'react-confetti';

/**
 * ConfettiEffect - 彩带/彩纸动画效果组件
 *
 * 可用于：
 * - 任务完成庆祝
 * - 升级庆祝
 * - 打卡成功
 * - 任何需要庆祝的场景
 *
 * 使用方式：
 * 1. 手动控制：传入 active={showConfetti}，自己管理状态
 * 2. 自动控制：传入 trigger={triggerKey}，组件自动在 500ms 后停止发射
 */

export interface ConfettiEffectProps {
  /** 是否显示彩带（手动控制模式） */
  active?: boolean;
  /** 触发器（自动控制模式）：每次值变化时会自动发射 500ms 彩带 */
  trigger?: any;
  /** 彩带发射持续时间（仅在自动模式下生效），默认 500ms */
  duration?: number;
  /** 彩带数量，默认 5000（密集发射） */
  numberOfPieces?: number;
  /** 彩带颜色数组 */
  colors?: string[];
  /** 重力，数值越大下落越快，默认 0.25 */
  gravity?: number;
  /** 是否循环，默认 true */
  recycle?: boolean;
  /** 自定义宽度（默认使用窗口宽度） */
  width?: number;
  /** 自定义高度（默认使用窗口高度） */
  height?: number;
}

/** 默认彩带颜色 */
const DEFAULT_COLORS = ['#FF6B6B', '#4A90E2', '#FFA500', '#FF8C42'];

export function ConfettiEffect({
  active,
  trigger,
  duration = 500,
  numberOfPieces = 5000,
  colors = DEFAULT_COLORS,
  gravity = 0.25,
  recycle = true,
  width,
  height,
}: ConfettiEffectProps) {
  const [autoActive, setAutoActive] = useState(false);
  const isFirstRender = useRef(true);
  const prevTrigger = useRef(trigger);

  // 自动控制模式：监听 trigger 变化（跳过首次渲染）
  useEffect(() => {
    // 跳过首次渲染，避免组件挂载时触发彩带
    if (isFirstRender.current) {
      isFirstRender.current = false;
      prevTrigger.current = trigger;
      return;
    }

    // 只有 trigger 真正变化且不为 0/undefined 时才触发
    if (trigger === undefined || trigger === 0 || trigger === prevTrigger.current) {
      prevTrigger.current = trigger;
      return;
    }

    prevTrigger.current = trigger;

    // 延迟 setState，避免在 effect 中同步调用导致级联渲染
    queueMicrotask(() => {
      setAutoActive(true);
    });
    const timer = setTimeout(() => setAutoActive(false), duration);
    return () => clearTimeout(timer);
  }, [trigger, duration]);

  // 最终的 active 状态：优先使用手动模式，否则使用自动模式
  const isActive = active !== undefined ? active : autoActive;

  // 使用 Portal 渲染到 body，避免被父容器的 overflow 裁剪
  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 99999,
        pointerEvents: 'none',
      }}
    >
      <Confetti
        width={width || window.innerWidth}
        height={height || window.innerHeight}
        numberOfPieces={isActive ? numberOfPieces : 0}
        colors={colors}
        recycle={recycle}
        gravity={gravity}
      />
    </div>,
    document.body
  );
}

