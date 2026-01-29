/**
 * usePendingReflections Hook
 *
 * 检查并管理待填写的反思表单
 *
 * 功能：
 * - 应用启动时检查是否有待显示的反思表单
 * - 提供表单数据和操作方法（提交、跳过、删除）
 * - 自动处理表单状态更新
 *
 * @example
 * ```tsx
 * const {
 *   hasPending,
 *   pendingForm,
 *   isLoading,
 *   submitReflection,
 *   skipReflection,
 *   deleteReflection,
 * } = usePendingReflections();
 *
 * if (hasPending && pendingForm) {
 *   // 显示反思表单
 * }
 * ```
 */

import { useState, useEffect, useCallback, useContext } from 'react';
import { getSupabaseClient } from '../lib/supabase';
import { AuthContext } from '../context/AuthContextDefinition';

// =====================================================
// 类型定义
// =====================================================

/** 待显示的反思表单 */
export interface PendingReflectionForm {
  /** 表单 ID */
  id: string;
  /** 关联的事件 ID */
  blockEventId: string;
  /** 被阻止应用的 Bundle ID */
  blockedAppId: string;
  /** 应用显示名称 */
  blockedAppName?: string;
  /** 突破事件发生时间 */
  eventCreatedAt: string;
  /** 已显示次数 */
  showCount: number;
  /** 已跳过次数 */
  skipCount: number;
}

/** 提交反思的参数 */
export interface SubmitReflectionParams {
  /** 情绪评分 0-5，支持 0.5 间隔 */
  emotionRating?: number;
  /** 任务影响评分 0-5，支持 0.5 间隔 */
  taskImpactRating?: number;
  /** 反思文本 */
  reflectionText?: string;
  /** 是否保存为后果记忆 */
  saveAsConsequence?: boolean;
}

/** Hook 返回类型 */
export interface UsePendingReflectionsReturn {
  /** 是否有待显示的表单 */
  hasPending: boolean;
  /** 待显示的表单数据 */
  pendingForm: PendingReflectionForm | null;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否正在提交 */
  isSubmitting: boolean;
  /** 错误信息 */
  error: string | null;
  /** 提交反思表单 */
  submitReflection: (params: SubmitReflectionParams) => Promise<boolean>;
  /** 跳过反思表单 */
  skipReflection: () => Promise<boolean>;
  /** 删除反思表单 */
  deleteReflection: () => Promise<boolean>;
  /** 重新检查待显示表单 */
  refresh: () => Promise<void>;
  /** 清除当前表单（用于关闭表单后） */
  clearForm: () => void;
}

// =====================================================
// Hook 实现
// =====================================================

/**
 * 待填写反思表单管理 Hook
 *
 * @returns 表单状态和操作方法
 */
export function usePendingReflections(): UsePendingReflectionsReturn {
  const auth = useContext(AuthContext);
  const [hasPending, setHasPending] = useState(false);
  const [pendingForm, setPendingForm] = useState<PendingReflectionForm | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * 检查待显示的反思表单
   */
  const checkPendingReflections = useCallback(async () => {
    // 未登录时跳过
    if (!auth?.isLoggedIn) {
      setIsLoading(false);
      setHasPending(false);
      setPendingForm(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase 未配置');
      }

      const { data, error: fetchError } = await supabase.functions.invoke('get-pending-reflections', {
        body: {},
      });

      if (fetchError) {
        throw fetchError;
      }

      if (data?.hasPending && data?.form) {
        setHasPending(true);
        setPendingForm(data.form);
        console.log('📬 [usePendingReflections] 发现待显示表单:', data.form.id);
      } else {
        setHasPending(false);
        setPendingForm(null);
        console.log('📭 [usePendingReflections] 无待显示表单');
      }
    } catch (err) {
      console.error('[usePendingReflections] 检查失败:', err);
      setError(err instanceof Error ? err.message : '检查失败');
      setHasPending(false);
      setPendingForm(null);
    } finally {
      setIsLoading(false);
    }
  }, [auth?.isLoggedIn]);

  // 组件挂载时检查
  useEffect(() => {
    checkPendingReflections();
  }, [checkPendingReflections]);

  /**
   * 提交反思表单
   */
  const submitReflection = useCallback(async (params: SubmitReflectionParams): Promise<boolean> => {
    if (!pendingForm) {
      console.error('[usePendingReflections] 没有待提交的表单');
      return false;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase 未配置');
      }

      const { data, error: submitError } = await supabase.functions.invoke('submit-reflection', {
        body: {
          formId: pendingForm.id,
          emotionRating: params.emotionRating,
          taskImpactRating: params.taskImpactRating,
          reflectionText: params.reflectionText,
          saveAsConsequence: params.saveAsConsequence,
        },
      });

      if (submitError) {
        throw submitError;
      }

      if (!data?.success) {
        throw new Error(data?.error || '提交失败');
      }

      console.log('✅ [usePendingReflections] 提交成功');

      // 清除当前表单
      setHasPending(false);
      setPendingForm(null);

      return true;
    } catch (err) {
      console.error('[usePendingReflections] 提交失败:', err);
      setError(err instanceof Error ? err.message : '提交失败');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingForm]);

  /**
   * 跳过反思表单
   */
  const skipReflection = useCallback(async (): Promise<boolean> => {
    if (!pendingForm) {
      console.error('[usePendingReflections] 没有待跳过的表单');
      return false;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase 未配置');
      }

      const { data, error: skipError } = await supabase.functions.invoke('skip-reflection', {
        body: {
          formId: pendingForm.id,
          action: 'skip',
        },
      });

      if (skipError) {
        throw skipError;
      }

      if (!data?.success) {
        throw new Error(data?.error || '跳过失败');
      }

      console.log('⏭️ [usePendingReflections] 跳过成功，下次显示:', data.nextShowAfter);

      // 清除当前表单
      setHasPending(false);
      setPendingForm(null);

      return true;
    } catch (err) {
      console.error('[usePendingReflections] 跳过失败:', err);
      setError(err instanceof Error ? err.message : '跳过失败');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingForm]);

  /**
   * 删除反思表单（永久忽略）
   */
  const deleteReflection = useCallback(async (): Promise<boolean> => {
    if (!pendingForm) {
      console.error('[usePendingReflections] 没有待删除的表单');
      return false;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const supabase = getSupabaseClient();
      if (!supabase) {
        throw new Error('Supabase 未配置');
      }

      const { data, error: deleteError } = await supabase.functions.invoke('skip-reflection', {
        body: {
          formId: pendingForm.id,
          action: 'delete',
        },
      });

      if (deleteError) {
        throw deleteError;
      }

      if (!data?.success) {
        throw new Error(data?.error || '删除失败');
      }

      console.log('🗑️ [usePendingReflections] 删除成功');

      // 清除当前表单
      setHasPending(false);
      setPendingForm(null);

      return true;
    } catch (err) {
      console.error('[usePendingReflections] 删除失败:', err);
      setError(err instanceof Error ? err.message : '删除失败');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [pendingForm]);

  /**
   * 清除当前表单（不调用 API）
   */
  const clearForm = useCallback(() => {
    setHasPending(false);
    setPendingForm(null);
  }, []);

  return {
    hasPending,
    pendingForm,
    isLoading,
    isSubmitting,
    error,
    submitReflection,
    skipReflection,
    deleteReflection,
    refresh: checkPendingReflections,
    clearForm,
  };
}
