import { useState } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import { REFERRAL_SOURCES, ReferralSourceId } from '../../../types/habit';

interface ReferralSourceStepProps {
  /** 当前选中的来源 */
  selectedSource: ReferralSourceId | null;
  /** 如果选择"其他"，用户填写的具体来源 */
  otherSourceText: string;
  /** 选择来源的回调 */
  onSelectSource: (sourceId: ReferralSourceId) => void;
  /** 设置"其他"来源文本的回调 */
  onSetOtherSourceText: (text: string) => void;
  /** 点击下一步的回调 */
  onNext: () => void;
}

/**
 * Onboarding Step 10: Referral Source
 * 询问用户是从哪个渠道知道 Lumi 的
 */
export function ReferralSourceStep({
  selectedSource,
  otherSourceText,
  onSelectSource,
  onSetOtherSourceText,
  onNext,
}: ReferralSourceStepProps) {
  const { t } = useTranslation();
  const [showOtherInput, setShowOtherInput] = useState(selectedSource === 'other');

  /**
   * 处理选择来源
   * 如果选择"其他"，显示输入框
   */
  const handleSelectSource = (sourceId: ReferralSourceId) => {
    onSelectSource(sourceId);
    if (sourceId === 'other') {
      setShowOtherInput(true);
    } else {
      setShowOtherInput(false);
      onSetOtherSourceText(''); // 清空"其他"输入
    }
  };

  /**
   * 判断是否可以继续
   * - 必须选择一个来源
   * - 如果选择"其他"，必须填写内容（可选，为了用户体验可以不强制）
   */
  const canProceed = selectedSource !== null;

  return (
    <div className="flex-1 flex flex-col">
      {/* 标题 */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2 text-center">
        {t('habitOnboarding.referralSource.title')}
      </h1>

      {/* 副标题 */}
      <p className="text-gray-500 mb-6 text-center">
        {t('habitOnboarding.referralSource.subtitle')}
      </p>

      {/* 来源选项网格 */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {REFERRAL_SOURCES.map((source) => {
          const isSelected = selectedSource === source.id;
          return (
            <button
              key={source.id}
              onClick={() => handleSelectSource(source.id)}
              className={`
                flex flex-col items-center justify-center
                py-4 px-2 rounded-xl border-2 transition-all
                ${isSelected
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
                }
              `}
            >
              <span className="text-2xl mb-1">{source.emoji}</span>
              <span className={`text-sm font-medium ${isSelected ? 'text-blue-600' : 'text-gray-700'}`}>
                {t(source.labelKey)}
              </span>
            </button>
          );
        })}
      </div>

      {/* "其他"输入框 */}
      {showOtherInput && (
        <div className="mb-6">
          <input
            type="text"
            value={otherSourceText}
            onChange={(e) => onSetOtherSourceText(e.target.value)}
            placeholder={t('habitOnboarding.referralSource.otherPlaceholder')}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       text-gray-900 placeholder-gray-400"
            autoFocus
          />
        </div>
      )}

      {/* 底部按钮 */}
      <div className="mt-auto mb-4">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className={`
            w-full py-4 px-8 rounded-full text-lg font-medium
            transition-colors shadow-md
            ${canProceed
              ? 'bg-blue-600 hover:bg-blue-700 text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }
          `}
        >
          {t('habitOnboarding.referralSource.next')}
        </button>
      </div>
    </div>
  );
}
