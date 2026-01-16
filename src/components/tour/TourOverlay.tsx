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
  // 目标元素位置
  const [targetRect, setTargetRect] = useState<TargetRect>({
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    found: false,
  });

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
  }, [step.targetSelector]);

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
    // 如果未找到目标元素，设置 MutationObserver 监听
    if (!targetRect.found) {
      observerRef.current = new MutationObserver(() => {
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
      });

      observerRef.current.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [step.targetSelector, targetRect.found]);

  // 监听窗口大小变化和滚动
  useEffect(() => {
    const handleChange = () => {
      // 不滚动，只更新位置
      const rect = getTargetRect(step.targetSelector, false);
      setTargetRect(rect);
    };

    window.addEventListener('resize', handleChange);
    window.addEventListener('scroll', handleChange, true);

    return () => {
      window.removeEventListener('resize', handleChange);
      window.removeEventListener('scroll', handleChange, true);
    };
  }, [step.targetSelector]);

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
   * 获取高亮区域的样式
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

  // Portal 容器
  const portalContainer = document.getElementById('root') || document.body;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* 蒙层背景（如果是 center 位置或未找到目标） */}
      {(step.position === 'center' || !targetRect.found) && (
        <div
          className="fixed inset-0 bg-black/70"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* 高亮区域（挖洞效果） */}
      {step.position !== 'center' && targetRect.found && (
        <div style={getHighlightStyle()} />
      )}

      {/* 跳过按钮（右上角） */}
      <button
        onClick={onSkip}
        className="fixed top-12 right-4 z-[10000] px-4 py-2 text-white/80 hover:text-white text-sm font-medium transition-colors"
      >
        跳过
      </button>

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
