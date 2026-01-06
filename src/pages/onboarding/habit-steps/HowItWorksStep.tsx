import { Phone, Video } from 'lucide-react';
import { useTranslation } from '../../../hooks/useTranslation';

interface HowItWorksStepProps {
  onNext: () => void;
}

/**
 * Step 4: How It Works
 * 解释工作原理页面
 */
export function HowItWorksStep({ onNext }: HowItWorksStepProps) {
  const { t } = useTranslation();

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      {/* 图标 */}
      <div className="relative w-32 h-32 mb-8">
        <div className="absolute inset-0 bg-blue-100 rounded-full animate-pulse" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
            <Video className="w-10 h-10 text-white" />
          </div>
        </div>
        {/* 小电话图标 */}
        <div className="absolute -right-2 -bottom-2 w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-md">
          <Phone className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* 标题 */}
      <h1 className="text-3xl font-bold text-gray-900 mb-4 px-4">
        {t('habitOnboarding.howItWorks.title')}
      </h1>

      {/* 下一步按钮 */}
      <div className="w-full mt-auto mb-4">
        <button
          onClick={onNext}
          className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md"
        >
          {t('habitOnboarding.howItWorks.button')}
        </button>
      </div>
    </div>
  );
}
