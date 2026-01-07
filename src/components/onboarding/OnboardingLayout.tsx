import { useEffect, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import '../../styles/onboarding.css';

interface OnboardingLayoutProps {
  children: ReactNode;
  currentStep: number; // 1-indexed
  totalSteps: number;
  onBack?: () => void;
  showBackButton?: boolean;
}

/**
 * Onboarding 布局组件
 * 参考设计：分段进度条 + 返回按钮
 */
export function OnboardingLayout({
  children,
  currentStep,
  totalSteps,
  onBack,
  showBackButton = true,
}: OnboardingLayoutProps) {
  // 防止 WebView 中页面滚动/弹性效果
  useEffect(() => {
    // 添加 body class 禁止滚动
    document.body.classList.add('onboarding-active');

    // 阻止 touchmove 默认行为（防止下拉刷新/弹性效果）
    const preventScroll = (e: TouchEvent) => {
      // 只阻止在非可滚动元素上的触摸滚动
      const target = e.target as HTMLElement;
      const isScrollable =
        target.closest('.overflow-auto') ||
        target.closest('.overflow-y-auto') ||
        target.closest('.overflow-scroll') ||
        target.closest('[data-scrollable]');

      if (!isScrollable) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      document.body.classList.remove('onboarding-active');
      document.removeEventListener('touchmove', preventScroll);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-white flex flex-col overflow-hidden"
      style={{
        height: '100dvh',
        touchAction: 'none',
        overscrollBehavior: 'none',
      }}
    >
      {/* 顶部安全区域 - 刘海屏间隙 */}
      <div className="shrink-0 h-16 bg-white" />

      {/* 顶部导航 */}
      <div className="flex items-center px-4 pb-2">
        {/* 返回按钮 */}
        <div className="w-10">
          {showBackButton && onBack && (
            <button
              onClick={onBack}
              className="p-2 -ml-2 text-gray-800 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Go back"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}
        </div>

        {/* 分段进度条 */}
        <div className="flex-1 flex items-center gap-1.5 px-2">
          {Array.from({ length: totalSteps }).map((_, index) => {
            const stepNum = index + 1;
            const isCompleted = stepNum < currentStep;
            const isCurrent = stepNum === currentStep;

            return (
              <div
                key={stepNum}
                className="flex-1 h-1 rounded-full transition-all duration-300"
                style={{
                  backgroundColor: isCompleted || isCurrent ? '#2563EB' : '#E5E7EB',
                  // 未完成的步骤使用虚线效果
                  ...((!isCompleted && !isCurrent) && {
                    background: `repeating-linear-gradient(
                      90deg,
                      #D1D5DB 0px,
                      #D1D5DB 4px,
                      transparent 4px,
                      transparent 8px
                    )`,
                  }),
                }}
              />
            );
          })}
        </div>

        {/* 右侧占位，保持对称 */}
        <div className="w-10" />
      </div>

      {/* 主内容区 */}
      <div
        className="flex-1 flex flex-col px-6 py-4 overflow-hidden"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom, 16px), 16px)',
        }}
      >
        {children}
      </div>
    </div>
  );
}
