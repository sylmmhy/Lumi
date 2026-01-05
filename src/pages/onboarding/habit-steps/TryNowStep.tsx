import { Phone } from 'lucide-react';

interface TryNowStepProps {
  onStartCall: () => void;
  onSkip: () => void;
}

/**
 * Step 5: Try Now
 * 询问是否立即尝试
 */
export function TryNowStep({ onStartCall, onSkip }: TryNowStepProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      {/* 图标 */}
      <div className="w-24 h-24 mb-8 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
        <Phone className="w-12 h-12 text-white" />
      </div>

      {/* 标题 */}
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        Ready to try?
      </h1>

      {/* 描述 */}
      <p className="text-lg text-gray-600 mb-12 px-4">
        I can call you now for a quick 5-minute session.
      </p>

      {/* 按钮组 */}
      <div className="w-full space-y-3 mt-auto mb-4">
        {/* 主按钮 - Call Me Now */}
        <button
          onClick={onStartCall}
          className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md flex items-center justify-center gap-2"
        >
          <Phone className="w-5 h-5" />
          <span>Call Me Now</span>
        </button>

        {/* 次要按钮 - Skip for now */}
        <button
          onClick={onSkip}
          className="w-full py-4 px-8 bg-gray-100 hover:bg-gray-200
                     text-gray-700 text-lg font-medium rounded-full
                     transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
