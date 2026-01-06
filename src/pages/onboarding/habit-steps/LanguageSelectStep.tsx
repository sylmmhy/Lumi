import { useState } from 'react';
import { SUPPORTED_LANGUAGES, getPreferredLanguages, setPreferredLanguages } from '../../../lib/language';
import { useTranslation } from '../../../hooks/useTranslation';
import lumiHappy from '../../../assets/Lumi-happy.png';

interface LanguageSelectStepProps {
  onNext: () => void;
}

/**
 * Step 7: Language Selection
 * 让用户选择希望 Lumi 用什么语言互动（可多选）
 */
export function LanguageSelectStep({ onNext }: LanguageSelectStepProps) {
  const { t } = useTranslation();
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>(() => getPreferredLanguages());

  /**
   * 切换语言的选中状态（多选）
   */
  const handleToggleLanguage = (code: string) => {
    setSelectedLanguages(prev => {
      if (prev.includes(code)) {
        return prev.filter(c => c !== code);
      } else {
        return [...prev, code];
      }
    });
  };

  /**
   * 保存并继续
   */
  const handleContinue = () => {
    // 保存语言偏好（空数组表示自动检测）
    setPreferredLanguages(selectedLanguages.length > 0 ? selectedLanguages : null);
    onNext();
  };

  return (
    <div className="flex-1 flex flex-col items-center text-center px-4 pt-4 pb-6 overflow-hidden">
      {/* Lumi 头像 */}
      <img
        src={lumiHappy}
        alt="Lumi"
        className="w-24 h-24 mb-4 object-contain flex-shrink-0"
      />

      {/* 标题 */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2 flex-shrink-0">
        {t('habitOnboarding.languageSelect.title')}
      </h1>

      {/* 次标题 */}
      <p className="text-gray-500 mb-6 flex-shrink-0">
        {t('habitOnboarding.languageSelect.subtitle')}
      </p>

      {/* 语言列表 - 可滚动区域 */}
      <div className="w-full max-w-md flex-1 overflow-y-auto -mx-2 px-2 mb-4">
        <div className="grid grid-cols-2 gap-3">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const isSelected = selectedLanguages.includes(lang.code);
            return (
              <button
                key={lang.code}
                onClick={() => handleToggleLanguage(lang.code)}
                className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                }`}
              >
                <span className="font-medium text-sm truncate">{lang.nativeName}</span>
                {isSelected && (
                  <i className="fa-solid fa-check text-sm ml-2 flex-shrink-0"></i>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 按钮区域 */}
      <div className="w-full max-w-xs flex-shrink-0">
        <button
          onClick={handleContinue}
          className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md"
        >
          {t('habitOnboarding.languageSelect.continue')}
          {selectedLanguages.length > 0 && (
            <span className="ml-2 bg-white/20 px-2 py-0.5 rounded-full text-sm">
              {selectedLanguages.length}
            </span>
          )}
        </button>

        {/* 提示：如果没有选择，则自动检测 */}
        {selectedLanguages.length === 0 && (
          <p className="text-gray-400 text-sm mt-3">
            {t('habitOnboarding.languageSelect.skipHint')}
          </p>
        )}
      </div>
    </div>
  );
}
