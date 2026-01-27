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

export const TOTAL_ONBOARDING_STEPS = 11;

/**
 * 用户来源选项
 * 用于追踪用户从哪个渠道知道 Lumi
 */
export const REFERRAL_SOURCES = [
  { id: 'tiktok', emoji: '🎵', labelKey: 'habitOnboarding.referralSource.tiktok' },
  { id: 'twitter', emoji: '𝕏', labelKey: 'habitOnboarding.referralSource.twitter' },
  { id: 'linkedin', emoji: '💼', labelKey: 'habitOnboarding.referralSource.linkedin' },
  { id: 'xiaohongshu', emoji: '📕', labelKey: 'habitOnboarding.referralSource.xiaohongshu' },
  { id: 'youtube', emoji: '▶️', labelKey: 'habitOnboarding.referralSource.youtube' },
  { id: 'google', emoji: '🔍', labelKey: 'habitOnboarding.referralSource.google' },
  { id: 'friend', emoji: '👋', labelKey: 'habitOnboarding.referralSource.friend' },
  { id: 'appstore', emoji: '📱', labelKey: 'habitOnboarding.referralSource.appstore' },
  { id: 'other', emoji: '✨', labelKey: 'habitOnboarding.referralSource.other' },
] as const;

export type ReferralSourceId = typeof REFERRAL_SOURCES[number]['id'];
