import { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';

interface NameInputStepProps {
  onNext: () => void;
}

/**
 * Step 6: Name Input
 * 让用户设置自己的名字，Lumi 将用这个名字称呼用户
 */
export function NameInputStep({ onNext }: NameInputStepProps) {
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
      setError('Please enter your name');
      return;
    }

    if (!userId) {
      setError('User not found');
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
      setError('Failed to save name. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = () => {
    onNext();
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
      {/* Lumi 头像 */}
      <div className="w-24 h-24 mb-6 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg">
        <span className="text-5xl">😊</span>
      </div>

      {/* 标题 */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        What should Lumi call you?
      </h1>

      {/* 副标题 */}
      <p className="text-gray-600 mb-8">
        Enter your preferred name
      </p>

      {/* 名字输入框 */}
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="w-full max-w-xs px-4 py-3 text-lg text-center
                   border-2 border-gray-200 rounded-xl
                   focus:border-blue-500 focus:outline-none
                   transition-colors"
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
      <div className="w-full max-w-xs mt-8 space-y-3">
        {/* 确认按钮 */}
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim()}
          className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                     disabled:bg-gray-300 disabled:cursor-not-allowed
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md"
        >
          {isSaving ? 'Saving...' : 'Continue'}
        </button>

        {/* 跳过按钮 */}
        <button
          onClick={handleSkip}
          disabled={isSaving}
          className="w-full py-3 px-8 text-gray-500 hover:text-gray-700
                     text-base font-medium transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
