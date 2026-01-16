import { useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  APP_TOUR_STEPS,
  TOUR_TOTAL_STEPS,
  type TourStep,
  type TourContext,
} from '../constants/appTourSteps';
import { useAuth } from './useAuth';
import { notifyNativeOnboardingCompleted } from '../utils/nativeTaskEvents';

/**
 * useProductTour 的返回类型
 */
export interface UseProductTourReturn {
  /** Tour 是否激活 */
  isActive: boolean;
  /** 当前步骤配置 */
  currentStep: TourStep | null;
  /** 当前步骤号 (1-4) */
  stepNumber: number;
  /** 总步骤数 */
  totalSteps: number;

  /** 开始 Tour */
  startTour: () => void;
  /** 下一步 */
  nextStep: () => void;
  /** 跳过 Tour */
  skipTour: () => void;
  /** 完成 Tour */
  completeTour: () => void;

  /** 动态内容所需的上下文 */
  context: TourContext;
  /** 设置上下文（如提醒时间） */
  setContext: (ctx: Partial<TourContext>) => void;
}

/**
 * Product Tour 状态管理 Hook
 *
 * 功能：
 * 1. 从 URL 参数读取当前步骤
 * 2. 管理 Tour 的开始、下一步、跳过、完成操作
 * 3. 完成后更新数据库 users.has_completed_habit_onboarding 字段
 *
 * @returns {UseProductTourReturn} Tour 状态和操作方法
 */
export function useProductTour(): UseProductTourReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // 从 AuthContext 获取 onboarding 完成状态
  const { hasCompletedHabitOnboarding, markHabitOnboardingCompleted } = useAuth();

  // 从 URL 参数读取步骤号
  const tourParam = searchParams.get('tour');
  const stepNumber = tourParam ? parseInt(tourParam, 10) : 0;

  // Tour 完成状态直接使用数据库的 hasCompletedHabitOnboarding 字段
  // 本地状态用于 UI 立即响应（避免等待数据库更新）
  const [localCompleted, setLocalCompleted] = useState(false);
  const hasCompleted = hasCompletedHabitOnboarding || localCompleted;

  // 动态上下文（如提醒时间）
  const [context, setContextState] = useState<TourContext>({});

  /**
   * Tour 是否激活
   * 条件：有 URL 参数 tour=1~4 且未完成过
   */
  const isActive = useMemo(() => {
    const result = stepNumber >= 1 && stepNumber <= TOUR_TOTAL_STEPS && !hasCompleted;

    // 🔍 调试日志：追踪 tour 激活状态
    console.log('🎯 [useProductTour] isActive 计算:', {
      tourParam,
      stepNumber,
      hasCompletedHabitOnboarding,
      localCompleted,
      hasCompleted,
      TOUR_TOTAL_STEPS,
      isActive: result,
      location: location.pathname + location.search,
    });

    return result;
  }, [stepNumber, hasCompleted, tourParam, hasCompletedHabitOnboarding, localCompleted, location.pathname, location.search]);

  /**
   * 当前步骤配置
   */
  const currentStep = useMemo<TourStep | null>(() => {
    if (!isActive) return null;
    return APP_TOUR_STEPS.find((s) => s.step === stepNumber) || null;
  }, [isActive, stepNumber]);

  /**
   * 设置上下文
   */
  const setContext = useCallback((ctx: Partial<TourContext>) => {
    setContextState((prev) => ({ ...prev, ...ctx }));
  }, []);

  /**
   * 开始 Tour（跳转到 ?tour=1）
   */
  const startTour = useCallback(() => {
    navigate('/app/home?tour=1', { replace: true });
  }, [navigate]);

  /**
   * 下一步
   * - 如果 nextRoute 不为空，跳转到下一个路由
   * - 否则在同页面更新 tour 参数
   */
  const nextStep = useCallback(async () => {
    if (!currentStep) return;

    const nextStepNumber = stepNumber + 1;

    // 最后一步，完成 Tour
    if (currentStep.isLast) {
      // 立即更新本地状态（UI 响应）
      setLocalCompleted(true);

      // 🔍 调试日志
      console.log('🎯 [useProductTour] nextStep: Tour 完成，准备更新数据库和通知原生端');

      // 异步更新数据库
      // 注意：markHabitOnboardingCompleted 返回 { error: string | null }，不会 throw
      markHabitOnboardingCompleted().then((result) => {
        if (result.error) {
          console.error('❌ [useProductTour] nextStep: 更新 habit onboarding 状态失败:', result.error);
        } else {
          console.log('✅ [useProductTour] nextStep: 数据库已更新 has_completed_habit_onboarding = true');
        }
      }).catch((err) => {
        console.error('❌ [useProductTour] nextStep: 更新时发生异常:', err);
      });

      // 通知原生端：整个新手流程（Habit Onboarding + Product Tour）已完成
      // 原生端收到后可以决定下一步操作
      console.log('🎯 [useProductTour] nextStep: 通知原生端 onboardingCompleted');
      notifyNativeOnboardingCompleted();

      // 移除 URL 参数，保持在当前页面
      const newUrl = location.pathname;
      navigate(newUrl, { replace: true });
      return;
    }

    // 如果有 nextRoute，跳转到下一个路由
    if (currentStep.nextRoute) {
      navigate(currentStep.nextRoute, { replace: true });
    } else {
      // 同页面，更新 tour 参数
      const newUrl = `${location.pathname}?tour=${nextStepNumber}`;
      navigate(newUrl, { replace: true });
    }
  }, [currentStep, stepNumber, navigate, location.pathname, markHabitOnboardingCompleted]);

  /**
   * 跳过 Tour（已移除跳过按钮，保留函数以兼容接口）
   */
  const skipTour = useCallback(async () => {
    // 立即更新本地状态（UI 响应）
    setLocalCompleted(true);

    // 🔍 调试日志
    console.log('🎯 [useProductTour] skipTour: Tour 跳过，准备更新数据库和通知原生端');

    // 异步更新数据库
    // 注意：markHabitOnboardingCompleted 返回 { error: string | null }，不会 throw
    markHabitOnboardingCompleted().then((result) => {
      if (result.error) {
        console.error('❌ [useProductTour] skipTour: 更新 habit onboarding 状态失败:', result.error);
      } else {
        console.log('✅ [useProductTour] skipTour: 数据库已更新 has_completed_habit_onboarding = true');
      }
    }).catch((err) => {
      console.error('❌ [useProductTour] skipTour: 更新时发生异常:', err);
    });

    // 通知原生端：整个新手流程（Habit Onboarding + Product Tour）已完成
    console.log('🎯 [useProductTour] skipTour: 通知原生端 onboardingCompleted');
    notifyNativeOnboardingCompleted();

    // 移除 URL 参数，保持在当前页面
    const newUrl = location.pathname;
    navigate(newUrl, { replace: true });
  }, [navigate, location.pathname, markHabitOnboardingCompleted]);

  /**
   * 完成 Tour（与 skipTour 相同，但语义不同）
   */
  const completeTour = skipTour;

  return {
    isActive,
    currentStep,
    stepNumber,
    totalSteps: TOUR_TOTAL_STEPS,
    startTour,
    nextStep,
    skipTour,
    completeTour,
    context,
    setContext,
  };
}
