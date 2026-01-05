import { useState } from 'react';
import { HabitButton } from '../../../components/onboarding/HabitButton';
import { CustomHabitModal } from '../../../components/onboarding/CustomHabitModal';
import { PRESET_HABITS, type PresetHabit } from '../../../types/habit';

interface HabitSelectStepProps {
  selectedHabitId: string | null;
  customHabitName: string;
  onSelectHabit: (habitId: string) => void;
  onSetCustomName: (name: string) => void;
  onNext: () => void;
  canProceed: boolean;
}

/**
 * Step 2: Choose Habit
 * 选择习惯页面
 */
export function HabitSelectStep({
  selectedHabitId,
  customHabitName,
  onSelectHabit,
  onSetCustomName,
  onNext,
  canProceed,
}: HabitSelectStepProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleHabitClick = (habit: PresetHabit) => {
    if (habit.id === 'custom') {
      // 打开自定义输入模态框
      setIsModalOpen(true);
    } else {
      onSelectHabit(habit.id);
    }
  };

  const handleCustomConfirm = (name: string) => {
    onSetCustomName(name);
    onSelectHabit('custom');
  };

  // 获取显示的习惯列表，如果已有自定义名称，替换 "Other" 的显示
  const displayHabits = PRESET_HABITS.map(habit => {
    if (habit.id === 'custom' && customHabitName) {
      return { ...habit, name: customHabitName };
    }
    return habit;
  });

  return (
    <div className="flex-1 flex flex-col">
      {/* 标题 */}
      <h1 className="text-3xl font-bold text-gray-900 text-center mt-8 mb-10">
        What habit do you want to start?
      </h1>

      {/* 习惯选项列表 */}
      <div className="flex-1 flex flex-col gap-3">
        {displayHabits.map((habit) => (
          <HabitButton
            key={habit.id}
            habit={habit}
            isSelected={selectedHabitId === habit.id}
            onClick={() => handleHabitClick(habit)}
          />
        ))}
      </div>

      {/* 下一步按钮 */}
      <div className="mt-6 mb-4">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                     disabled:bg-gray-300 disabled:cursor-not-allowed
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md"
        >
          Next
        </button>
      </div>

      {/* 自定义习惯模态框 */}
      <CustomHabitModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onConfirm={handleCustomConfirm}
        initialValue={customHabitName}
      />
    </div>
  );
}
