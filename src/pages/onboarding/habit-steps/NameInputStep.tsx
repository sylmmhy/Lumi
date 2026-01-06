import { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useTranslation } from '../../../hooks/useTranslation';
import lumiHappy from '../../../assets/Lumi-happy.png';

interface NameInputStepProps {
  onNext: () => void;
}

/**
 * Step 6: Name Input
 * 让用户设置自己的名字，Lumi 将用这个名字称呼用户
 */
export function NameInputStep({ onNext }: NameInputStepProps) {
  const { t } = useTranslation();
  const { userId, userName, updateProfile } = useAuth();
  const [name, setName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 如果用户已有名字，预填充
  useEffect(() => {
    if (userName) {
      setName(userName);
    }
  }, [userName]);

  const handleSave = async () => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError(t('habitOnboarding.nameInput.errorEmpty'));
      return;
    }

    if (!userId) {
      setError(t('habitOnboarding.nameInput.errorNotFound'));
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const result = await updateProfile({ name: trimmedName });
      if (result.error) {
        setError(result.error);
      } else {
        onNext();
      }
    } catch (err) {
      console.error('Failed to save name:', err);
      setError(t('habitOnboarding.nameInput.errorSave'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center text-center px-4 pt-8">
      {/* Lumi 头像 */}
      <img
        src={lumiHappy}
        alt="Lumi"
        className="w-28 h-28 mb-4 object-contain"
      />

      {/* 标题 */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        {t('habitOnboarding.nameInput.title')}
      </h1>

      {/* 副标题 */}
      <p className="text-gray-600 mb-8">
        {t('habitOnboarding.nameInput.subtitle')}
      </p>

      {/* 名字输入框 */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('habitOnboarding.nameInput.placeholder')}
        className="w-full max-w-xs px-4 py-3 text-lg text-center text-gray-900
                   border-2 border-gray-200 rounded-xl
                   focus:border-blue-500 focus:outline-none
                   transition-colors placeholder:text-gray-400"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter' && name.trim()) {
            handleSave();
          }
        }}
      />

      {/* 错误提示 */}
      {error && (
        <p className="mt-3 text-sm text-red-500">{error}</p>
      )}

      {/* 按钮区域 */}
      <div className="w-full max-w-xs mt-8">
        {/* 确认按钮 */}
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                     disabled:bg-gray-300 disabled:cursor-not-allowed
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md"
        >
          {isSaving ? t('habitOnboarding.nameInput.saving') : t('habitOnboarding.nameInput.continue')}
        </button>
      </div>
    </div>
  );
}
