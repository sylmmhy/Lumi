/**
 * StarRating 组件
 *
 * 评分组件，支持 0-5 分，0.5 间隔
 *
 * 功能：
 * - 点击设置评分
 * - 半星显示
 * - 可选的标签显示
 *
 * @example
 * ```tsx
 * <StarRating
 *   value={3.5}
 *   onChange={(rating) => setRating(rating)}
 *   label="情绪评分"
 *   lowLabel="很差"
 *   highLabel="很好"
 * />
 * ```
 */

import React, { useCallback } from 'react';

// =====================================================
// 类型定义
// =====================================================

export interface StarRatingProps {
  /** 当前评分值 (0-5) */
  value: number;
  /** 评分变化回调 */
  onChange: (rating: number) => void;
  /** 标签文字 */
  label?: string;
  /** 低分端标签 */
  lowLabel?: string;
  /** 高分端标签 */
  highLabel?: string;
  /** 是否只读 */
  readonly?: boolean;
  /** 星星大小（Tailwind class） */
  size?: 'sm' | 'md' | 'lg';
  /** 自定义类名 */
  className?: string;
}

// =====================================================
// 组件实现
// =====================================================

export const StarRating: React.FC<StarRatingProps> = ({
  value,
  onChange,
  label,
  lowLabel,
  highLabel,
  readonly = false,
  size = 'md',
  className = '',
}) => {
  // 星星大小映射
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  /**
   * 处理星星点击
   * 根据点击位置决定是整星还是半星
   */
  const handleStarClick = useCallback(
    (starIndex: number, event: React.MouseEvent<HTMLButtonElement>) => {
      if (readonly) return;

      const button = event.currentTarget;
      const rect = button.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const isLeftHalf = x < rect.width / 2;

      // 计算新评分：左半部分 = 0.5，右半部分 = 1.0
      const newRating = starIndex + (isLeftHalf ? 0.5 : 1);

      // 如果点击的是当前值，允许清零
      if (newRating === value) {
        onChange(0);
      } else {
        onChange(newRating);
      }
    },
    [readonly, value, onChange]
  );

  /**
   * 渲染单个星星
   */
  const renderStar = (index: number) => {
    const starValue = index + 1;
    const isFilled = value >= starValue;
    const isHalf = !isFilled && value >= starValue - 0.5;

    return (
      <button
        key={index}
        type="button"
        onClick={(e) => handleStarClick(index, e)}
        disabled={readonly}
        className={`
          relative focus:outline-none transition-transform
          ${!readonly ? 'hover:scale-110 active:scale-95 cursor-pointer' : 'cursor-default'}
          ${sizeClasses[size]}
        `}
        aria-label={`${starValue} stars`}
      >
        {/* 底层 - 空星 */}
        <i className="fa-regular fa-star text-gray-300"></i>

        {/* 上层 - 填充星（根据状态显示） */}
        {(isFilled || isHalf) && (
          <i
            className={`fa-solid fa-star text-yellow-400 absolute left-0 top-0 ${
              isHalf ? 'clip-half' : ''
            }`}
            style={isHalf ? { clipPath: 'inset(0 50% 0 0)' } : undefined}
          ></i>
        )}
      </button>
    );
  };

  return (
    <div className={`flex flex-col items-center ${className}`}>
      {/* 标签 */}
      {label && (
        <p className="text-gray-700 font-medium mb-2">{label}</p>
      )}

      {/* 星星区域 */}
      <div className="flex items-center gap-1">
        {[0, 1, 2, 3, 4].map((index) => renderStar(index))}
      </div>

      {/* 低/高分标签 */}
      {(lowLabel || highLabel) && (
        <div className="flex justify-between w-full mt-1 px-1">
          <span className="text-xs text-gray-400">{lowLabel}</span>
          <span className="text-xs text-gray-400">{highLabel}</span>
        </div>
      )}

      {/* 当前评分显示 */}
      <p className="text-sm text-gray-500 mt-1">
        {value > 0 ? value.toFixed(1) : '-'} / 5
      </p>
    </div>
  );
};
