/**
 * 预设习惯类型定义
 */

export interface PresetHabit {
  id: string;
  emoji: string;
  name: string;
}

export const PRESET_HABITS: PresetHabit[] = [
  { id: 'bedtime', emoji: '🛏️', name: 'Go to bed on time' },
  { id: 'wakeup', emoji: '🌅', name: 'Wake up early' },
  { id: 'exercise', emoji: '🏋️', name: 'Exercise' },
  { id: 'study', emoji: '📚', name: 'Study' },
  { id: 'eat', emoji: '🍽️', name: 'Eat on schedule' },
  { id: 'custom', emoji: '➕', name: 'Other' },
];

export const TOTAL_ONBOARDING_STEPS = 9;
