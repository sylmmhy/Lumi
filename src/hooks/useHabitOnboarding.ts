import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useTranslation } from './useTranslation';
import { createReminder, generateTodayRoutineInstances } from '../remindMe/services/reminderService';
import { PRESET_HABITS, TOTAL_ONBOARDING_STEPS, type PresetHabit } from '../types/habit';
import { DEFAULT_APP_PATH } from '../constants/routes';
import { notifyNativeOnboardingCompleted } from '../utils/nativeTaskEvents';
import { supabase } from '../lib/supabase';

import type { ReferralSourceId } from '../pages/onboarding/habit-steps/ReferralSourceStep';

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

interface HabitOnboardingState {
  step: OnboardingStep;
  selectedHabitId: string | null;
  customHabitName: string;
  reminderTime: string;
  trialCallCompleted: boolean;
  referralSource: ReferralSourceId | null;  // 用户来源渠道
  otherSourceText: string;                   // 如果选择"其他"，用户填写的内容
  isSaving: boolean;
  error: string | null;
}

const STORAGE_KEY = 'habit_onboarding_state';

const INITIAL_STATE: HabitOnboardingState = {
  step: 1,
  selectedHabitId: null,
  customHabitName: '',
  reminderTime: '09:00',
  trialCallCompleted: false,
  referralSource: null,
  otherSourceText: '',
  isSaving: false,
  error: null,
};

/**
 * 从 sessionStorage 恢复状态
 */
function loadStateFromStorage(): HabitOnboardingState {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 恢复时重置 isSaving 和 error，避免卡在保存状态
      return {
        ...INITIAL_STATE,
        ...parsed,
        isSaving: false,
        error: null,
      };
    }
  } catch (e) {
    console.warn('Failed to load onboarding state from storage:', e);
  }
  return INITIAL_STATE;
}

/**
 * 保存状态到 sessionStorage
 */
function saveStateToStorage(state: HabitOnboardingState): void {
  try {
    // 只保存需要持久化的字段，不保存 isSaving 和 error
    const toSave = {
      step: state.step,
      selectedHabitId: state.selectedHabitId,
      customHabitName: state.customHabitName,
      reminderTime: state.reminderTime,
      trialCallCompleted: state.trialCallCompleted,
      referralSource: state.referralSource,
      otherSourceText: state.otherSourceText,
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  } catch (e) {
    console.warn('Failed to save onboarding state to storage:', e);
  }
}

/**
 * 清除存储的状态
 */
function clearStateFromStorage(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn('Failed to clear onboarding state from storage:', e);
  }
}

/**
 * 将 24 小时制时间转换为 12 小时制显示
 */
function formatTo12Hour(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'pm' : 'am';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * 根据时间返回时间分类
 */
function getTimeCategory(time: string): 'morning' | 'afternoon' | 'evening' {
  const hours = parseInt(time.split(':')[0], 10);
  if (hours < 12) return 'morning';
  if (hours < 18) return 'afternoon';
  return 'evening';
}

// 习惯 ID 到翻译 key 的映射
const HABIT_TRANSLATION_KEYS: Record<string, string> = {
  bedtime: 'habitOnboarding.habitSelect.bedtime',
  wakeup: 'habitOnboarding.habitSelect.wakeup',
  exercise: 'habitOnboarding.habitSelect.exercise',
  study: 'habitOnboarding.habitSelect.study',
  eat: 'habitOnboarding.habitSelect.eat',
};

/**
 * 根据习惯类型返回合理的默认提醒时间
 * - bedtime (按时睡觉): 23:00 晚上
 * - wakeup (早起): 08:00 早上
 * - exercise (运动): 09:00 早上
 * - study (学习): 09:00 早上
 * - eat (按时吃饭): 12:00 中午
 * - custom (其他): 09:00 默认
 */
function getDefaultTimeForHabit(habitId: string): string {
  switch (habitId) {
    case 'bedtime':
      return '23:00';
    case 'wakeup':
      return '08:00';
    case 'exercise':
      return '09:00';
    case 'study':
      return '09:00';
    case 'eat':
      return '12:00';
    default:
      return '09:00';
  }
}

export function useHabitOnboarding() {
  const navigate = useNavigate();
  const { userId, markHabitOnboardingCompleted } = useAuth();
  const { t } = useTranslation();
  // 从 sessionStorage 恢复状态，避免来电/刷新后回到第 1 步
  const [state, setState] = useState<HabitOnboardingState>(loadStateFromStorage);

  // 状态变化时自动保存到 sessionStorage
  useEffect(() => {
    saveStateToStorage(state);
  }, [state]);

  // 导航
  const goToStep = useCallback((step: OnboardingStep) => {
    setState(prev => ({ ...prev, step, error: null }));
  }, []);

  const goNext = useCallback(() => {
    setState(prev => {
      const nextStep = Math.min(prev.step + 1, TOTAL_ONBOARDING_STEPS) as OnboardingStep;
      return { ...prev, step: nextStep, error: null };
    });
  }, []);

  const goBack = useCallback(() => {
    setState(prev => {
      const prevStep = Math.max(prev.step - 1, 1) as OnboardingStep;
      return { ...prev, step: prevStep, error: null };
    });
  }, []);

  // 数据设置
  const selectHabit = useCallback((habitId: string) => {
    // 选择习惯时自动设置对应的默认时间，方便用户少滚动
    const defaultTime = getDefaultTimeForHabit(habitId);
    setState(prev => ({
      ...prev,
      selectedHabitId: habitId,
      reminderTime: defaultTime,
      error: null,
    }));
  }, []);

  const setCustomHabitName = useCallback((name: string) => {
    setState(prev => ({ ...prev, customHabitName: name, error: null }));
  }, []);

  const setReminderTime = useCallback((time: string) => {
    setState(prev => ({ ...prev, reminderTime: time, error: null }));
  }, []);

  // 完成试用通话
  const completeTrialCall = useCallback(() => {
    setState(prev => ({ ...prev, trialCallCompleted: true }));
  }, []);

  // 设置用户来源
  const selectReferralSource = useCallback((source: ReferralSourceId) => {
    setState(prev => ({ ...prev, referralSource: source, error: null }));
  }, []);

  // 设置"其他"来源文本
  const setOtherSourceText = useCallback((text: string) => {
    setState(prev => ({ ...prev, otherSourceText: text, error: null }));
  }, []);

  // 保存习惯并完成
  const saveAndFinish = useCallback(async () => {
    if (!userId) {
      setState(prev => ({ ...prev, error: 'Please log in to save your habit' }));
      return;
    }

    setState(prev => ({ ...prev, isSaving: true, error: null }));

    try {
      // 获取习惯名称（使用用户当前语言的翻译）
      let habitName: string;
      if (state.selectedHabitId === 'custom') {
        habitName = state.customHabitName.trim();
        if (!habitName) {
          setState(prev => ({ ...prev, isSaving: false, error: 'Please enter a habit name' }));
          return;
        }
      } else {
        // 使用翻译系统获取当前语言的习惯名称
        const translationKey = HABIT_TRANSLATION_KEYS[state.selectedHabitId || ''];
        if (translationKey) {
          habitName = t(translationKey);
        } else {
          // 如果没有找到翻译 key，回退到预设名称
          const preset = PRESET_HABITS.find(h => h.id === state.selectedHabitId);
          habitName = preset?.name || 'My Habit';
        }
      }

      // 创建 routine 类型任务（模板）
      // 🔧 修复：routine 模板不设置 date，由 generateTodayRoutineInstances 统一生成今日实例
      // 这样可以避免时间已过时 pg_cron 立即触发电话
      const result = await createReminder({
        text: habitName,
        time: state.reminderTime,
        displayTime: formatTo12Hour(state.reminderTime), // 🔧 修复：添加 12 小时制显示时间
        // date 不设置，让 routine 作为纯模板
        type: 'routine',
        isRecurring: true,
        recurrencePattern: 'daily',
        completed: false,
        called: false,
        category: getTimeCategory(state.reminderTime),
      }, userId);

      if (!result) {
        throw new Error('Failed to create habit');
      }

      // 🆕 为今天生成 routine 实例（如果时间未过）
      // generateTodayRoutineInstances 内部会检查 isTimeInFuture，跳过已过时间的任务
      await generateTodayRoutineInstances(userId);

      // 🆕 保存用户来源（如果用户选择了）
      if (state.referralSource) {
        try {
          const { error: referralError } = await supabase
            .from('user_referral_sources')
            .upsert({
              user_id: userId,
              source: state.referralSource,
              other_source: state.referralSource === 'other' ? state.otherSourceText : null,
            }, {
              onConflict: 'user_id',  // 如果已存在则更新
            });

          if (referralError) {
            console.error('❌ [useHabitOnboarding] 保存用户来源失败:', referralError);
          } else {
            console.log('✅ [useHabitOnboarding] 已保存用户来源:', state.referralSource);
          }
        } catch (err) {
          console.error('❌ [useHabitOnboarding] 保存用户来源时发生异常:', err);
        }
      }

      // ✅ 2026-01-18: 在 Habit Onboarding 完成时就标记为已完成
      // Product Tour 功能暂时禁用，所以在这里直接完成整个 onboarding 流程
      // 1. 更新数据库 users.has_completed_habit_onboarding = true
      // 2. 通知原生端（iOS/Android）onboarding 已完成
      try {
        const result = await markHabitOnboardingCompleted();
        if (result.error) {
          console.error('❌ [useHabitOnboarding] 更新 habit onboarding 状态失败:', result.error);
        } else {
          console.log('✅ [useHabitOnboarding] 已标记 habit onboarding 完成');
        }
      } catch (err) {
        console.error('❌ [useHabitOnboarding] 更新时发生异常:', err);
      }

      // 通知原生端：onboarding 已完成
      // 原生端收到后会跳转到主页
      notifyNativeOnboardingCompleted();
      console.log('📱 [useHabitOnboarding] 已通知原生端 onboarding 完成');

      // 清除 sessionStorage 中的临时状态
      clearStateFromStorage();

      // 🔍 调试日志
      console.log('🔍 [useHabitOnboarding] saveAndFinish: Habit Onboarding 完成，导航到主页');
      console.log('🔍 [useHabitOnboarding] saveAndFinish: 目标 URL:', DEFAULT_APP_PATH);

      // 直接导航到主页（不带 ?tour=1 参数，因为 Product Tour 已禁用）
      navigate(DEFAULT_APP_PATH);
    } catch (err) {
      console.error('Error saving habit:', err);
      setState(prev => ({
        ...prev,
        isSaving: false,
        error: err instanceof Error ? err.message : 'Failed to save habit',
      }));
    }
  }, [userId, state.selectedHabitId, state.customHabitName, state.reminderTime, state.referralSource, state.otherSourceText, navigate, t, markHabitOnboardingCompleted]);

  // 计算属性
  const canProceed = useMemo(() => {
    switch (state.step) {
      case 1:
        return true;
      case 2:
        if (state.selectedHabitId === 'custom') {
          return state.customHabitName.trim().length > 0;
        }
        return state.selectedHabitId !== null;
      case 3:
        return state.reminderTime.length > 0;
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
        return true;
      default:
        return false;
    }
  }, [state.step, state.selectedHabitId, state.customHabitName, state.reminderTime]);

  const habitDisplayName = useMemo(() => {
    if (state.selectedHabitId === 'custom') {
      return state.customHabitName || t('habitOnboarding.habitSelect.custom');
    }
    // 使用翻译系统获取习惯显示名称
    const translationKey = HABIT_TRANSLATION_KEYS[state.selectedHabitId || ''];
    if (translationKey) {
      return t(translationKey);
    }
    const preset = PRESET_HABITS.find(h => h.id === state.selectedHabitId);
    return preset?.name || '';
  }, [state.selectedHabitId, state.customHabitName, t]);

  const selectedHabit = useMemo((): PresetHabit | null => {
    if (!state.selectedHabitId) return null;
    return PRESET_HABITS.find(h => h.id === state.selectedHabitId) || null;
  }, [state.selectedHabitId]);

  return {
    // 状态
    step: state.step,
    selectedHabitId: state.selectedHabitId,
    customHabitName: state.customHabitName,
    reminderTime: state.reminderTime,
    trialCallCompleted: state.trialCallCompleted,
    referralSource: state.referralSource,
    otherSourceText: state.otherSourceText,
    isSaving: state.isSaving,
    error: state.error,

    // 导航
    goToStep,
    goNext,
    goBack,

    // 数据设置
    selectHabit,
    setCustomHabitName,
    setReminderTime,
    selectReferralSource,
    setOtherSourceText,

    // 完成
    completeTrialCall,
    saveAndFinish,

    // 计算属性
    canProceed,
    habitDisplayName,
    selectedHabit,
    totalSteps: TOTAL_ONBOARDING_STEPS,

    // 工具函数
    formatTo12Hour,
  };
}
