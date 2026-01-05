import { useState } from 'react';
import { TimePicker } from '../../../components/app-tabs/TimePicker';

interface TimeSelectStepProps {
  reminderTime: string;
  onTimeChange: (time: string) => void;
  onNext: () => void;
}

/**
 * Step 3: Set Time
 * 设置提醒时间页面 - 复用 Home 页面的 TimePicker 组件（embedded 模式）
 */
export function TimeSelectStep({
  reminderTime,
  onTimeChange,
  onNext,
}: TimeSelectStepProps) {
  // 日期状态（Onboarding 只关心时间，日期默认为今天）
  const [dateValue, setDateValue] = useState(() => new Date());

  return (
    <div className="flex-1 flex flex-col">
      {/* 标题 */}
      <h1 className="text-3xl font-bold text-gray-900 text-center mt-8 mb-4">
        When should I remind you?
      </h1>

      {/* 时间选择器 - 复用 app-tabs/TimePicker，embedded 模式 */}
      <div className="flex-1 flex items-center justify-center px-4">
        <div className="bg-white rounded-[32px] shadow-lg p-6 w-full max-w-[320px]">
          <TimePicker
            timeValue={reminderTime}
            onTimeChange={onTimeChange}
            dateValue={dateValue}
            onDateChange={setDateValue}
            onClose={() => {}}
            embedded={true}
          />
        </div>
      </div>

      {/* 下一步按钮 */}
      <div className="mt-6 mb-4">
        <button
          onClick={onNext}
          className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md"
        >
          Next
        </button>
      </div>
    </div>
  );
}
