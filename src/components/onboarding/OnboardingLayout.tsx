import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

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
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* 顶部导航 - 使用 safe-area-inset-top 避免刘海屏遮挡 */}
      <div
        className="flex items-center px-4 pb-2"
        style={{ paddingTop: 'max(env(safe-area-inset-top, 12px), 12px)' }}
      >
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
      <div className="flex-1 flex flex-col px-6 py-4">
        {children}
      </div>
    </div>
  );
}
