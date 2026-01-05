import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface CustomHabitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (habitName: string) => void;
  initialValue?: string;
}

/**
 * 自定义习惯输入模态框
 */
export function CustomHabitModal({
  isOpen,
  onClose,
  onConfirm,
  initialValue = '',
}: CustomHabitModalProps) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时聚焦输入框
  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialValue]);

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (trimmed) {
      onConfirm(trimmed);
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 模态框 */}
      <div className="relative bg-white rounded-2xl shadow-xl w-[90%] max-w-md mx-4 overflow-hidden">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">
            Enter your habit
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="p-5">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., Drink water, Meditate..."
            maxLength={50}
            className="w-full px-4 py-3 text-lg border border-gray-200 rounded-xl
                       focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                       placeholder:text-gray-400"
          />
          <p className="mt-2 text-sm text-gray-400 text-right">
            {value.length}/50
          </p>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="flex-1 py-3 px-4 text-gray-700 font-medium
                       bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className="flex-1 py-3 px-4 text-white font-medium
                       bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
                       rounded-full transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
