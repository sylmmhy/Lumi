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
 * 获取目标元素的位置
 */
function getTargetRect(selector: string): TargetRect {
  const element = document.querySelector(selector);
  if (!element) {
    return { top: 0, left: 0, width: 0, height: 0, found: false };
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

  // 重新计算目标位置的计数器（用于触发重新定位）
  const [recalcCounter, setRecalcCounter] = useState(0);
  const observerRef = useRef<MutationObserver | null>(null);

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
  const updateTargetRect = useCallback(() => {
    const rect = getTargetRect(step.targetSelector);
    setTargetRect(rect);
  }, [step.targetSelector]);

  // 初次渲染和步骤变化时更新位置
  useEffect(() => {
    // 延迟一点再计算，确保 DOM 已渲染
    const timer = setTimeout(() => {
      updateTargetRect();
    }, 100);

    return () => clearTimeout(timer);
  }, [step.targetSelector, recalcCounter, updateTargetRect]);

  // 监听 DOM 变化（如元素延迟加载）
  useEffect(() => {
    // 如果未找到目标元素，设置 MutationObserver 监听
    if (!targetRect.found) {
      observerRef.current = new MutationObserver(() => {
        const rect = getTargetRect(step.targetSelector);
        if (rect.found) {
          setTargetRect(rect);
          observerRef.current?.disconnect();
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

  // 监听窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      setRecalcCounter((c) => c + 1);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('scroll', handleResize, true);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize, true);
    };
  }, []);

  /**
   * 计算 Tooltip 位置
   */
  const getTooltipStyle = useCallback((): React.CSSProperties => {
    const padding = 16; // 与目标元素的间距
    const tooltipWidth = 280;

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

    switch (step.position) {
      case 'top':
        return {
          position: 'fixed',
          bottom: window.innerHeight - top + padding,
          left: Math.max(padding, Math.min(left + width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding)),
          width: tooltipWidth,
        };
      case 'bottom':
        return {
          position: 'fixed',
          top: top + height + padding,
          left: Math.max(padding, Math.min(left + width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - padding)),
          width: tooltipWidth,
        };
      case 'left':
        return {
          position: 'fixed',
          top: top + height / 2,
          right: window.innerWidth - left + padding,
          transform: 'translateY(-50%)',
          width: tooltipWidth,
        };
      case 'right':
        return {
          position: 'fixed',
          top: top + height / 2,
          left: left + width + padding,
          transform: 'translateY(-50%)',
          width: tooltipWidth,
        };
      default:
        return {
          position: 'fixed',
          top: top + height + padding,
          left: Math.max(padding, left + width / 2 - tooltipWidth / 2),
          width: tooltipWidth,
        };
    }
  }, [step.position, targetRect]);

  /**
   * 生成蒙层的 box-shadow 样式（实现挖洞效果）
   */
  const getOverlayShadow = useCallback((): string => {
    // 如果是 center 位置或未找到目标，不需要挖洞
    if (step.position === 'center' || !targetRect.found) {
      return 'rgba(0, 0, 0, 0.7) 0 0 0 9999px';
    }

    // 使用 box-shadow 实现挖洞效果
    return 'rgba(0, 0, 0, 0.7) 0 0 0 9999px';
  }, [step.position, targetRect.found]);

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
      boxShadow: getOverlayShadow(),
      pointerEvents: 'none',
      zIndex: 9998,
    };
  }, [step.position, targetRect, getOverlayShadow]);

  // Portal 容器
  const portalContainer = document.getElementById('root') || document.body;

  return createPortal(
    <div className="fixed inset-0 z-[9999]">
      {/* 蒙层背景（如果是 center 位置） */}
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
