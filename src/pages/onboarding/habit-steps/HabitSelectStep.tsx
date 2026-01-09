import { useState } from 'react';
import { HabitButton } from '../../../components/onboarding/HabitButton';
import { CustomHabitModal } from '../../../components/onboarding/CustomHabitModal';
import { PRESET_HABITS, type PresetHabit } from '../../../types/habit';
import { useTranslation } from '../../../hooks/useTranslation';

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
  const { t } = useTranslation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // 习惯 ID 到翻译 key 的映射
  const habitTranslationKeys: Record<string, string> = {
    bedtime: 'habitOnboarding.habitSelect.bedtime',
    wakeup: 'habitOnboarding.habitSelect.wakeup',
    exercise: 'habitOnboarding.habitSelect.exercise',
    study: 'habitOnboarding.habitSelect.study',
    eat: 'habitOnboarding.habitSelect.eat',
    custom: 'habitOnboarding.habitSelect.custom',
  };

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

  // 获取显示的习惯列表，使用翻译后的名称
  const displayHabits = PRESET_HABITS.map(habit => {
    if (habit.id === 'custom' && customHabitName) {
      return { ...habit, name: customHabitName };
    }
    const translationKey = habitTranslationKeys[habit.id];
    return { ...habit, name: translationKey ? t(translationKey) : habit.name };
  });

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* 标题 */}
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 text-center mt-4 sm:mt-8 mb-6 sm:mb-10 shrink-0">
        {t('habitOnboarding.habitSelect.title')}
      </h1>

      {/* 习惯选项列表 - 可滚动区域 */}
      <div
        className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0 pb-2"
        data-scrollable
      >
        {displayHabits.map((habit) => (
          <HabitButton
            key={habit.id}
            habit={habit}
            isSelected={selectedHabitId === habit.id}
            onClick={() => handleHabitClick(habit)}
          />
        ))}
      </div>

      {/* 下一步按钮 - 固定在底部 */}
      <div className="mt-4 mb-2 sm:mt-6 sm:mb-4 shrink-0">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                     disabled:bg-gray-300 disabled:cursor-not-allowed
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md"
        >
          {t('habitOnboarding.habitSelect.next')}
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
