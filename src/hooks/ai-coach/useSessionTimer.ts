/**
 * AI Coach Session - 正计时定时器 Hook
 *
 * 封装正计时的全部状态和逻辑：
 * - elapsedSeconds / isTimerRunning 状态
 * - setInterval 管理
 * - taskStartTime（计时开始的时间戳，供外部系统使用）
 *
 * 没有自动结束逻辑，用户手动结束会话。
 */
import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseSessionTimerReturn {
  /** 已用秒数（从 0 开始正计时） */
  elapsedSeconds: number;
  /** 向后兼容：等同于 elapsedSeconds */
  timeRemaining: number;
  /** 是否正在计时 */
  isTimerRunning: boolean;
  /** 计时开始的时间戳（Date.now()），0 表示未开始 */
  taskStartTime: number;
  /** 开始正计时（同时设置 taskStartTime） */
  startTimer: () => void;
  /** 停止计时（不重置时间） */
  stopTimer: () => void;
  /** 停止计时并重置为 0，清空 taskStartTime */
  resetTimer: () => void;
  /** 仅清理 interval（用于组件卸载，不触发状态更新） */
  cleanupTimer: () => void;
}

/**
 * 正计时定时器 Hook
 *
 * @example
 * const timer = useSessionTimer();
 * // timer.startTimer()  → 开始
 * // timer.stopTimer()   → 暂停
 * // timer.resetTimer()  → 重置
 * // timer.elapsedSeconds → 已用秒数
 */
export function useSessionTimer(): UseSessionTimerReturn {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [taskStartTime, setTaskStartTime] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /** 开始正计时 */
  const startTimer = useCallback(() => {
    setIsTimerRunning(true);
    setTaskStartTime(Date.now());
  }, []);

  /** 停止计时（不重置已用时间） */
  const stopTimer = useCallback(() => {
    setIsTimerRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 停止并重置为 0 */
  const resetTimer = useCallback(() => {
    stopTimer();
    setElapsedSeconds(0);
    setTaskStartTime(0);
  }, [stopTimer]);

  /**
   * 正计时核心 effect
   *
   * 依赖 [isTimerRunning] —— 只有开始/停止时才重建 interval。
   * 每秒 +1，无自动结束逻辑。
   */
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds(prev => prev + 1);
      }, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
    }
  }, [isTimerRunning]);

  /** 仅清理 interval 引用（用于组件卸载） */
  const cleanupTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    elapsedSeconds,
    timeRemaining: elapsedSeconds,
    isTimerRunning,
    taskStartTime,
    startTimer,
    stopTimer,
    resetTimer,
    cleanupTimer,
  };
}
