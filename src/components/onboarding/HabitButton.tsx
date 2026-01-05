import type { PresetHabit } from '../../types/habit';

interface HabitButtonProps {
  habit: PresetHabit;
  isSelected: boolean;
  onClick: () => void;
}

/**
 * 习惯选择按钮组件
 * 参考设计：胶囊形状，选中蓝底白字，未选浅灰底黑字
 */
export function HabitButton({ habit, isSelected, onClick }: HabitButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full py-4 px-6 rounded-full text-lg font-medium
        transition-all duration-200 ease-out
        ${isSelected
          ? 'bg-blue-600 text-white shadow-md'
          : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
        }
      `}
    >
      <span className="mr-2">{habit.emoji}</span>
      <span>{habit.name}</span>
    </button>
  );
}
