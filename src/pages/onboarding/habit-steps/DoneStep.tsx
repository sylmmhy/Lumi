import { useEffect, useState } from 'react';
import { ConfettiEffect } from '../../../components/effects/ConfettiEffect';

interface DoneStepProps {
  onFinish: () => void;
  isLoading?: boolean;
}

/**
 * Step 6: Done
 * 完成页面，带彩纸庆祝动画
 */
export function DoneStep({ onFinish, isLoading = false }: DoneStepProps) {
  const [showConfetti, setShowConfetti] = useState(false);

  // 延迟显示彩纸效果
  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(true), 300);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      {/* 彩纸效果 */}
      {showConfetti && <ConfettiEffect duration={4000} />}

      {/* 庆祝图标 */}
      <div className="text-8xl mb-8 animate-bounce">
        🎉
      </div>

      {/* 标题 */}
      <h1 className="text-4xl font-bold text-gray-900 mb-4">
        All set!
      </h1>

      {/* 副标题 */}
      <p className="text-lg text-gray-600 mb-12">
        Your habit is ready. Let's go!
      </p>

      {/* 完成按钮 */}
      <div className="w-full mt-auto mb-4">
        <button
          onClick={onFinish}
          disabled={isLoading}
          className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                     disabled:bg-blue-400 disabled:cursor-wait
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md"
        >
          {isLoading ? 'Saving...' : "Let's go!"}
        </button>
      </div>
    </div>
  );
}
