interface WelcomeStepProps {
  onNext: () => void;
}

/**
 * Step 1: Welcome
 * Lumi 介绍欢迎页
 */
export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      {/* Lumi 头像 */}
      <div className="w-32 h-32 mb-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg">
        <span className="text-6xl">👋</span>
      </div>

      {/* 标题 */}
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        Hi, I'm Lumi
      </h1>

      {/* 副标题 */}
      <p className="text-xl text-gray-600 mb-12">
        Let's build your first habit today.
      </p>

      {/* 下一步按钮 */}
      <button
        onClick={onNext}
        className="w-full max-w-xs py-4 px-8 bg-blue-600 hover:bg-blue-700
                   text-white text-lg font-medium rounded-full
                   transition-colors shadow-md"
      >
        Get Started
      </button>
    </div>
  );
}
