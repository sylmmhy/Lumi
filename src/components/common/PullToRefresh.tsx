/**
 * PullToRefresh - 下拉刷新组件
 *
 * 在移动端 WebView 中实现下拉刷新功能。
 * 当页面滚动到顶部后继续下拉，显示刷新提示，松手后触发刷新。
 */

import { useState, useRef, useCallback, type ReactNode, type TouchEvent, type UIEvent } from 'react'

interface PullToRefreshProps {
  /** 子内容 */
  children: ReactNode
  /** 刷新回调函数 */
  onRefresh: () => Promise<void> | void
  /** 触发刷新的下拉距离阈值（默认 80px） */
  threshold?: number
  /** 是否禁用下拉刷新 */
  disabled?: boolean
  /** 自定义下拉提示文字 */
  pullText?: string
  /** 自定义释放提示文字 */
  releaseText?: string
  /** 自定义刷新中文字 */
  refreshingText?: string
  /** 自定义类名 */
  className?: string
  /** 滚动位置变化回调 */
  onScrollChange?: (scrollTop: number) => void
}

export function PullToRefresh({
  children,
  onRefresh,
  threshold = 80,
  disabled = false,
  pullText = 'Pull to refresh',
  releaseText = 'Release to refresh',
  refreshingText = 'Refreshing...',
  className = '',
  onScrollChange,
}: PullToRefreshProps) {
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startYRef = useRef(0)
  const isPullingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (disabled || isRefreshing) return

    // 检查是否在页面顶部
    const scrollTop = containerRef.current?.scrollTop ?? 0
    if (scrollTop <= 0) {
      startYRef.current = e.touches[0].clientY
      isPullingRef.current = true
    }
  }, [disabled, isRefreshing])

  const handleTouchMove = useCallback((e: TouchEvent<HTMLDivElement>) => {
    if (disabled || isRefreshing || !isPullingRef.current) return

    const scrollTop = containerRef.current?.scrollTop ?? 0

    // 只有在顶部才允许下拉
    if (scrollTop > 0) {
      isPullingRef.current = false
      setPullDistance(0)
      return
    }

    const currentY = e.touches[0].clientY
    const distance = currentY - startYRef.current

    // 只处理向下拉（distance > 0）
    if (distance > 0) {
      // 阻止默认的弹性滚动
      e.preventDefault()
      // 使用阻尼效果，下拉越远阻力越大
      const dampedDistance = Math.min(distance * 0.5, threshold * 1.5)
      setPullDistance(dampedDistance)
    }
  }, [disabled, isRefreshing, threshold])

  const handleTouchEnd = useCallback(async () => {
    if (disabled || isRefreshing || !isPullingRef.current) return

    isPullingRef.current = false

    if (pullDistance >= threshold) {
      // 达到阈值，触发刷新
      setIsRefreshing(true)
      setPullDistance(threshold) // 保持在刷新位置

      try {
        await onRefresh()
      } catch (error) {
        console.error('Refresh failed:', error)
      } finally {
        setIsRefreshing(false)
        setPullDistance(0)
      }
    } else {
      // 未达到阈值，回弹
      setPullDistance(0)
    }
  }, [disabled, isRefreshing, pullDistance, threshold, onRefresh])

  // 处理滚动事件
  const handleScroll = useCallback((e: UIEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop
    onScrollChange?.(scrollTop)
  }, [onScrollChange])

  // 计算提示文字
  const getHintText = () => {
    if (isRefreshing) return refreshingText
    if (pullDistance >= threshold) return releaseText
    return pullText
  }

  // 计算旋转角度（用于箭头动画）
  const rotation = pullDistance >= threshold ? 180 : 0

  return (
    <div
      ref={containerRef}
      className={`h-full overflow-auto ${className}`}
      style={{
        overscrollBehavior: 'none', // 禁用浏览器默认的弹性滚动
        WebkitOverflowScrolling: 'touch',
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onScroll={handleScroll}
    >
      {/* 下拉提示区域 */}
      <div
        className="flex items-center justify-center overflow-hidden transition-all duration-200 ease-out"
        style={{
          height: pullDistance > 0 ? `${pullDistance}px` : '0px',
          opacity: pullDistance > 20 ? 1 : 0,
        }}
      >
        <div className="flex items-center gap-2 text-gray-500 text-sm">
          {isRefreshing ? (
            // 刷新中的加载动画
            <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          ) : (
            // 箭头图标
            <svg
              className="w-5 h-5 transition-transform duration-200"
              style={{ transform: `rotate(${rotation}deg)` }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
          )}
          <span>{getHintText()}</span>
        </div>
      </div>

      {/* 子内容 */}
      {children}
    </div>
  )
}
