import { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
  APP_TOUR_STEPS,
  TOUR_COMPLETED_KEY,
  TOUR_TOTAL_STEPS,
  type TourStep,
  type TourContext,
} from '../constants/appTourSteps';

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
 * 3. 完成后标记 localStorage，下次不再显示
 *
 * @returns {UseProductTourReturn} Tour 状态和操作方法
 */
export function useProductTour(): UseProductTourReturn {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // 从 URL 参数读取步骤号
  const tourParam = searchParams.get('tour');
  const resetParam = searchParams.get('reset'); // ?reset=1 强制重置
  const stepNumber = tourParam ? parseInt(tourParam, 10) : 0;

  // 检查 Tour 是否已完成（localStorage）
  // 如果有 reset=1 参数，清除已完成标记
  const [hasCompleted, setHasCompleted] = useState(() => {
    try {
      if (resetParam === '1') {
        localStorage.removeItem(TOUR_COMPLETED_KEY);
        return false;
      }
      return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // 动态上下文（如提醒时间）
  const [context, setContextState] = useState<TourContext>({});

  /**
   * Tour 是否激活
   * 条件：有 URL 参数 tour=1~4 且未完成过
   */
  const isActive = useMemo(() => {
    return stepNumber >= 1 && stepNumber <= TOUR_TOTAL_STEPS && !hasCompleted;
  }, [stepNumber, hasCompleted]);

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
  const nextStep = useCallback(() => {
    if (!currentStep) return;

    const nextStepNumber = stepNumber + 1;

    // 最后一步，完成 Tour
    if (currentStep.isLast) {
      // 标记完成
      try {
        localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
      } catch {
        // ignore
      }
      setHasCompleted(true);

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
  }, [currentStep, stepNumber, navigate, location.pathname]);

  /**
   * 跳过 Tour
   */
  const skipTour = useCallback(() => {
    try {
      localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    } catch {
      // ignore
    }
    setHasCompleted(true);

    // 移除 URL 参数，保持在当前页面
    const newUrl = location.pathname;
    navigate(newUrl, { replace: true });
  }, [navigate, location.pathname]);

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
