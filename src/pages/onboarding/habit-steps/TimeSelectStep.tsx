import { TimePicker } from '../../../components/onboarding/TimePicker';

interface TimeSelectStepProps {
  reminderTime: string;
  onTimeChange: (time: string) => void;
  onNext: () => void;
}

/**
 * Step 3: Set Time
 * 设置提醒时间页面
 */
export function TimeSelectStep({
  reminderTime,
  onTimeChange,
  onNext,
}: TimeSelectStepProps) {
  return (
    <div className="flex-1 flex flex-col">
      {/* 标题 */}
      <h1 className="text-3xl font-bold text-gray-900 text-center mt-8 mb-4">
        When should I remind you?
      </h1>

      {/* 时间选择器 */}
      <div className="flex-1 flex items-center justify-center">
        <TimePicker value={reminderTime} onChange={onTimeChange} />
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
