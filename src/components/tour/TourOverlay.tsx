import React, { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { TourStep, TourContext } from '../../constants/appTourSteps';

/**
 * TourOverlay Props
 */
interface TourOverlayProps {
  /** 当前步骤配置 */
  step: TourStep;
  /** 当前步骤号 (1-4) */
  stepNumber: number;
  /** 总步骤数 */
  totalSteps: number;
  /** 动态上下文 */
  context: TourContext;
  /** 下一步回调 */
  onNext: () => void;
  /** 跳过回调 */
  onSkip: () => void;
}

/**
 * 目标元素的位置和尺寸
 */
interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  /** 是否找到目标元素 */
  found: boolean;
}

/**
 * 获取目标元素的位置，并尝试滚动到可视区域
 */
function getTargetRect(selector: string, shouldScroll: boolean = false): TargetRect {
  const element = document.querySelector(selector);
  if (!element) {
    return { top: 0, left: 0, width: 0, height: 0, found: false };
  }

  // 先滚动到目标元素，确保它在可视区域
  if (shouldScroll) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    found: true,
  };
}

/**
 * 获取多个目标元素的位置
 */
function getMultipleTargetRects(selectors: string[], shouldScroll: boolean = false): TargetRect[] {
  return selectors.map((selector, index) => {
    // 只对第一个元素执行滚动
    return getTargetRect(selector, shouldScroll && index === 0);
  });
}

/**
 * Product Tour 蒙层组件
 *
 * 功能：
 * 1. 全屏半透明黑色蒙层
 * 2. 目标元素区域"挖洞"高亮
 * 3. Tooltip 气泡指向目标元素
 * 4. 支持跳过、下一步操作
 */
export const TourOverlay: React.FC<TourOverlayProps> = ({
  step,
  stepNumber,
  totalSteps,
  context,
  onNext,
  onSkip,
}) => {
  // 目标元素位置（单个）
  const [targetRect, setTargetRect] = useState<TargetRect>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    found: false,
  });

  // 多个目标元素位置（用于多高亮区域）
  const [targetRects, setTargetRects] = useState<TargetRect[]>([]);

  // 是否使用多目标模式
  const useMultipleTargets = step.targetSelectors && step.targetSelectors.length > 0;

  const observerRef = useRef<MutationObserver | null>(null);
  const scrollTimeoutRef = useRef<number | null>(null);

  /**
   * 获取步骤内容（支持动态函数）
   */
  const getStepContent = useCallback(() => {
    if (typeof step.content === 'function') {
      return step.content(context);
    }
    return step.content;
  }, [step.content, context]);

  /**
   * 更新目标元素位置
   */
  const updateTargetRect = useCallback((shouldScroll: boolean = false) => {
    // 多目标模式
    if (useMultipleTargets && step.targetSelectors) {
      const rects = getMultipleTargetRects(step.targetSelectors, shouldScroll);
      setTargetRects(rects);
      // 同时更新单个目标（用于 tooltip 定位，使用第一个目标）
      if (rects.length > 0) {
        setTargetRect(rects[0]);
      }

      // 如果滚动了，等待滚动完成后再次更新位置
      const anyFound = rects.some(r => r.found);
      if (shouldScroll && anyFound) {
        if (scrollTimeoutRef.current) {
          window.clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = window.setTimeout(() => {
          const newRects = getMultipleTargetRects(step.targetSelectors!, false);
          setTargetRects(newRects);
          if (newRects.length > 0) {
            setTargetRect(newRects[0]);
          }
        }, 500);
      }
    } else {
      // 单目标模式（原有逻辑）
      const rect = getTargetRect(step.targetSelector, shouldScroll);
      setTargetRect(rect);

      // 如果滚动了，等待滚动完成后再次更新位置
      if (shouldScroll && rect.found) {
        if (scrollTimeoutRef.current) {
          window.clearTimeout(scrollTimeoutRef.current);
        }
        scrollTimeoutRef.current = window.setTimeout(() => {
          const newRect = getTargetRect(step.targetSelector, false);
          setTargetRect(newRect);
        }, 500);
      }
    }
  }, [step.targetSelector, step.targetSelectors, useMultipleTargets]);

  // 初次渲染和步骤变化时更新位置，并滚动到目标
  useEffect(() => {
    // 首次延迟滚动到目标元素
    const timer = setTimeout(() => {
      updateTargetRect(true);
    }, 200);

    return () => {
      clearTimeout(timer);
      if (scrollTimeoutRef.current) {
        window.clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [step.targetSelector, updateTargetRect]);

  // 监听 DOM 变化（如元素延迟加载）
  useEffect(() => {
    // 检查是否所有目标都已找到
    const allFound = useMultipleTargets
      ? targetRects.length > 0 && targetRects.every(r => r.found)
      : targetRect.found;

    // 如果未找到目标元素，设置 MutationObserver 监听
    if (!allFound) {
      observerRef.current = new MutationObserver(() => {
        if (useMultipleTargets && step.targetSelectors) {
          const rects = getMultipleTargetRects(step.targetSelectors, true);
          const anyFound = rects.some(r => r.found);
          if (anyFound) {
            setTargetRects(rects);
            if (rects.length > 0) {
              setTargetRect(rects[0]);
            }
            // 如果全部找到，断开监听
            if (rects.every(r => r.found)) {
              observerRef.current?.disconnect();
            }
            // 滚动后再次更新位置
            setTimeout(() => {
              const newRects = getMultipleTargetRects(step.targetSelectors!, false);
              setTargetRects(newRects);
              if (newRects.length > 0) {
                setTargetRect(newRects[0]);
              }
            }, 500);
          }
        } else {
          const rect = getTargetRect(step.targetSelector, true);
          if (rect.found) {
            setTargetRect(rect);
            observerRef.current?.disconnect();
            // 滚动后再次更新位置
            setTimeout(() => {
              const newRect = getTargetRect(step.targetSelector, false);
              setTargetRect(newRect);
            }, 500);
          }
        }
      });

      observerRef.current.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [step.targetSelector, step.targetSelectors, targetRect.found, targetRects, useMultipleTargets]);

  // 监听窗口大小变化和滚动
  useEffect(() => {
    const handleChange = () => {
      // 不滚动，只更新位置
      if (useMultipleTargets && step.targetSelectors) {
        const rects = getMultipleTargetRects(step.targetSelectors, false);
        setTargetRects(rects);
        if (rects.length > 0) {
          setTargetRect(rects[0]);
        }
      } else {
        const rect = getTargetRect(step.targetSelector, false);
        setTargetRect(rect);
      }
    };

    window.addEventListener('resize', handleChange);
    window.addEventListener('scroll', handleChange, true);

    return () => {
      window.removeEventListener('resize', handleChange);
      window.removeEventListener('scroll', handleChange, true);
    };
  }, [step.targetSelector, step.targetSelectors, useMultipleTargets]);

  /**
   * 计算 Tooltip 的实际显示位置
   * 会自动调整以确保在可视区域内
   */
  const getTooltipStyle = useCallback((): React.CSSProperties => {
    const tooltipWidth = 280;
    const tooltipHeight = 180; // 估算高度
    const padding = 16;
    const safeMargin = 20; // 距离屏幕边缘的安全距离

    // 如果是 center 位置，居中显示
    if (step.position === 'center') {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: tooltipWidth,
      };
    }

    // 如果未找到目标元素，居中显示
    if (!targetRect.found) {
      return {
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: tooltipWidth,
      };
    }

    const { top, left, width, height } = targetRect;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // 计算目标元素中心点
    const targetCenterX = left + width / 2;
    const targetCenterY = top + height / 2;

    // 计算 Tooltip 的水平位置（居中于目标，但不超出屏幕）
    let tooltipLeft = Math.max(
      safeMargin,
      Math.min(targetCenterX - tooltipWidth / 2, viewportWidth - tooltipWidth - safeMargin)
    );

    // 根据 position 计算垂直位置，并自动调整
    let tooltipTop: number;
    let actualPosition = step.position;

    // 检查 bottom 位置是否会超出屏幕
    if (step.position === 'bottom') {
      const bottomPos = top + height + padding;
      if (bottomPos + tooltipHeight > viewportHeight - safeMargin) {
        // 切换到 top
        actualPosition = 'top';
      }
    }

    // 检查 top 位置是否会超出屏幕
    if (step.position === 'top' || actualPosition === 'top') {
      const topPos = top - padding - tooltipHeight;
      if (topPos < safeMargin) {
        // 切换到 bottom
        actualPosition = 'bottom';
      }
    }

    // 计算最终位置
    switch (actualPosition) {
      case 'top':
        tooltipTop = top - padding - tooltipHeight;
        break;
      case 'bottom':
        tooltipTop = top + height + padding;
        break;
      case 'left':
        tooltipTop = targetCenterY - tooltipHeight / 2;
        tooltipLeft = left - padding - tooltipWidth;
        break;
      case 'right':
        tooltipTop = targetCenterY - tooltipHeight / 2;
        tooltipLeft = left + width + padding;
        break;
      default:
        tooltipTop = top + height + padding;
    }

    // 确保不超出屏幕边界
    tooltipTop = Math.max(safeMargin, Math.min(tooltipTop, viewportHeight - tooltipHeight - safeMargin));
    tooltipLeft = Math.max(safeMargin, Math.min(tooltipLeft, viewportWidth - tooltipWidth - safeMargin));

    return {
      position: 'fixed',
      top: tooltipTop,
      left: tooltipLeft,
      width: tooltipWidth,
    };
  }, [step.position, targetRect]);

  /**
   * 获取高亮区域的样式（单目标模式）
   */
  const getHighlightStyle = useCallback((): React.CSSProperties => {
    if (step.position === 'center' || !targetRect.found) {
      return { display: 'none' };
    }

    const highlightPadding = 8; // 高亮区域比目标元素大一点

    return {
      position: 'fixed',
      top: targetRect.top - highlightPadding,
      left: targetRect.left - highlightPadding,
      width: targetRect.width + highlightPadding * 2,
      height: targetRect.height + highlightPadding * 2,
      borderRadius: '16px',
      boxShadow: 'rgba(0, 0, 0, 0.7) 0 0 0 9999px',
      pointerEvents: 'none',
      zIndex: 9998,
    };
  }, [step.position, targetRect]);

  /**
   * 获取单个高亮区域的样式（多目标模式，无阴影）
   */
  const getMultiHighlightStyle = useCallback((rect: TargetRect): React.CSSProperties => {
    if (!rect.found) {
      return { display: 'none' };
    }

    const highlightPadding = 8;

    return {
      position: 'fixed',
      top: rect.top - highlightPadding,
      left: rect.left - highlightPadding,
      width: rect.width + highlightPadding * 2,
      height: rect.height + highlightPadding * 2,
      borderRadius: '16px',
      backgroundColor: 'white',
      pointerEvents: 'none',
    };
  }, []);

  // Portal 容器
  const portalContainer = document.getElementById('root') || document.body;

  // 检查是否有任何高亮区域找到
  const anyTargetFound = useMultipleTargets
    ? targetRects.some(r => r.found)
    : targetRect.found;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* 蒙层背景（如果是 center 位置或未找到目标） */}
      {(step.position === 'center' || !anyTargetFound) && (
        <div
          className="fixed inset-0 bg-black/70"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* 多目标高亮区域（使用 SVG mask 实现多个挖洞） */}
      {useMultipleTargets && step.position !== 'center' && anyTargetFound && (
        <svg
          className="fixed inset-0 w-full h-full pointer-events-none"
          style={{ zIndex: 9998 }}
        >
          <defs>
            <mask id="tour-mask">
              {/* 白色填充整个屏幕 */}
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {/* 黑色区域表示挖洞（透明区域） */}
              {targetRects.map((rect, index) => {
                if (!rect.found) return null;
                const padding = 8;
                return (
                  <rect
                    key={index}
                    x={rect.left - padding}
                    y={rect.top - padding}
                    width={rect.width + padding * 2}
                    height={rect.height + padding * 2}
                    rx="16"
                    ry="16"
                    fill="black"
                  />
                );
              })}
            </mask>
          </defs>
          {/* 使用 mask 的半透明蒙层 */}
          <rect
            x="0"
            y="0"
            width="100%"
            height="100%"
            fill="rgba(0, 0, 0, 0.7)"
            mask="url(#tour-mask)"
          />
        </svg>
      )}

      {/* 单目标高亮区域（原有的 box-shadow 挖洞效果） */}
      {!useMultipleTargets && step.position !== 'center' && targetRect.found && (
        <div style={getHighlightStyle()} />
      )}

      {/* Tooltip 气泡 */}
      <div
        style={getTooltipStyle()}
        className="z-[10000] bg-white rounded-2xl shadow-2xl p-5 animate-fade-in"
      >
        {/* 标题 */}
        <h3 className="text-lg font-bold text-gray-800 mb-2">{step.title}</h3>

        {/* 内容 */}
        <p className="text-gray-600 text-sm mb-4 leading-relaxed">
          {getStepContent()}
        </p>

        {/* 底部：步骤指示器 + 按钮 */}
        <div className="flex items-center justify-between">
          {/* 步骤指示器 */}
          <div className="flex items-center gap-1">
            {Array.from({ length: totalSteps }, (_, i) => (
              <div
                key={i}
                className={`w-2 h-2 rounded-full transition-colors ${
                  i + 1 === stepNumber
                    ? 'bg-brand-blue'
                    : i + 1 < stepNumber
                    ? 'bg-brand-blue/50'
                    : 'bg-gray-200'
                }`}
              />
            ))}
            <span className="text-xs text-gray-400 ml-2">
              {stepNumber}/{totalSteps}
            </span>
          </div>

          {/* 下一步按钮 */}
          <button
            onClick={onNext}
            className="px-6 py-2 bg-brand-blue text-white font-medium rounded-full hover:bg-brand-blue/90 transition-colors text-sm"
          >
            {step.isLast ? '知道了！' : '下一步'}
          </button>
        </div>
      </div>
    </div>,
    portalContainer
  );
};

export default TourOverlay;
