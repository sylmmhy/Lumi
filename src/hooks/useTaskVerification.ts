/**
 * useTaskVerification - 任务视觉验证 Hook
 *
 * 调用 verify-task-completion Edge Function，支持：
 * - In-Session 验证（多帧视频）
 * - Out-of-Session 验证（单张照片）
 *
 * 验证是异步的，不阻塞任务完成流程。
 */

import { useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

/** 验证结果 */
export interface VerificationResult {
  verified: boolean;
  confidence: number;
  evidence: string;
  not_visually_verifiable: boolean;
  xp_awarded: number;
  source: 'in_session' | 'photo_upload';
}

interface UseTaskVerificationReturn {
  /** 使用视频帧验证（In-Session） */
  verifyWithFrames: (
    taskId: string,
    taskDescription: string,
    frames: string[],
    userId: string
  ) => Promise<VerificationResult | null>;

  /** 使用照片验证（Out-of-Session） */
  verifyWithPhoto: (
    taskId: string,
    taskDescription: string,
    photoBase64: string,
    userId: string
  ) => Promise<VerificationResult | null>;

  /** 是否正在验证中 */
  isVerifying: boolean;

  /** 最近一次验证结果 */
  result: VerificationResult | null;

  /** 清除结果 */
  clearResult: () => void;
}

/**
 * 任务视觉验证 Hook
 *
 * @example
 * ```ts
 * const { verifyWithFrames, isVerifying, result } = useTaskVerification();
 *
 * // In-Session 验证
 * const frames = frameBuffer.getRecentFrames(5);
 * await verifyWithFrames(taskId, 'Clean desk', frames, userId);
 *
 * // Out-of-Session 验证
 * await verifyWithPhoto(taskId, 'Exercise', photoBase64, userId);
 * ```
 */
export function useTaskVerification(): UseTaskVerificationReturn {
  const [isVerifying, setIsVerifying] = useState(false);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const callVerifyEndpoint = useCallback(async (
    taskId: string,
    taskDescription: string,
    frames: string[],
    userId: string,
    source: 'in_session' | 'photo_upload'
  ): Promise<VerificationResult | null> => {
    if (!supabase) {
      console.error('[useTaskVerification] Supabase not initialized');
      return null;
    }

    // 取消之前的请求
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setIsVerifying(true);

    try {
      const { data, error } = await supabase.functions.invoke('verify-task-completion', {
        body: {
          user_id: userId,
          task_id: taskId,
          task_description: taskDescription,
          frames,
          source,
        },
      });

      if (error) {
        console.error('[useTaskVerification] Error:', error);
        return null;
      }

      const verificationResult = data as VerificationResult;
      setResult(verificationResult);
      return verificationResult;

    } catch (err) {
      // AbortError 是正常的取消，不是错误
      if (err instanceof Error && err.name === 'AbortError') {
        return null;
      }
      console.error('[useTaskVerification] Unexpected error:', err);
      return null;

    } finally {
      setIsVerifying(false);
    }
  }, []);

  const verifyWithFrames = useCallback(async (
    taskId: string,
    taskDescription: string,
    frames: string[],
    userId: string
  ): Promise<VerificationResult | null> => {
    if (frames.length === 0) return null;
    return callVerifyEndpoint(taskId, taskDescription, frames.slice(0, 5), userId, 'in_session');
  }, [callVerifyEndpoint]);

  const verifyWithPhoto = useCallback(async (
    taskId: string,
    taskDescription: string,
    photoBase64: string,
    userId: string
  ): Promise<VerificationResult | null> => {
    return callVerifyEndpoint(taskId, taskDescription, [photoBase64], userId, 'photo_upload');
  }, [callVerifyEndpoint]);

  const clearResult = useCallback(() => {
    setResult(null);
  }, []);

  return {
    verifyWithFrames,
    verifyWithPhoto,
    isVerifying,
    result,
    clearResult,
  };
}
