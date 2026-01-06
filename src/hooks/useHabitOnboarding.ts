import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { createReminder, generateTodayRoutineInstances } from '../remindMe/services/reminderService';
import { PRESET_HABITS, TOTAL_ONBOARDING_STEPS, type PresetHabit } from '../types/habit';

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

interface HabitOnboardingState {
  step: OnboardingStep;
  selectedHabitId: string | null;
  customHabitName: string;
  reminderTime: string;
  trialCallCompleted: boolean;
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
 * 获取今天的日期字符串 (YYYY-MM-DD)
 */
function getTodayDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export function useHabitOnboarding() {
  const navigate = useNavigate();
  const { userId, markHabitOnboardingCompleted } = useAuth();
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
    setState(prev => ({ ...prev, selectedHabitId: habitId, error: null }));
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

  // 保存习惯并完成
  const saveAndFinish = useCallback(async () => {
    if (!userId) {
      setState(prev => ({ ...prev, error: 'Please log in to save your habit' }));
      return;
    }

    setState(prev => ({ ...prev, isSaving: true, error: null }));

    try {
      // 获取习惯名称
      let habitName: string;
      if (state.selectedHabitId === 'custom') {
        habitName = state.customHabitName.trim();
        if (!habitName) {
          setState(prev => ({ ...prev, isSaving: false, error: 'Please enter a habit name' }));
          return;
        }
      } else {
        const preset = PRESET_HABITS.find(h => h.id === state.selectedHabitId);
        habitName = preset?.name || 'My Habit';
      }

      // 创建 routine 类型任务（模板）
      // 🔧 修复：routine 模板不设置 date，由 generateTodayRoutineInstances 统一生成今日实例
      // 这样可以避免时间已过时 pg_cron 立即触发电话
      const result = await createReminder({
        text: habitName,
        time: state.reminderTime,
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

      // 标记习惯引导已完成
      await markHabitOnboardingCompleted();

      // 清除 sessionStorage 中的临时状态
      clearStateFromStorage();

      // 成功，导航到主页
      navigate('/app/urgency');
    } catch (err) {
      console.error('Error saving habit:', err);
      setState(prev => ({
        ...prev,
        isSaving: false,
        error: err instanceof Error ? err.message : 'Failed to save habit',
      }));
    }
  }, [userId, state.selectedHabitId, state.customHabitName, state.reminderTime, navigate, markHabitOnboardingCompleted]);

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
      return state.customHabitName || 'Custom habit';
    }
    const preset = PRESET_HABITS.find(h => h.id === state.selectedHabitId);
    return preset?.name || '';
  }, [state.selectedHabitId, state.customHabitName]);

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
