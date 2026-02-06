/**
 * AI Coach Session - 倒计时定时器 Hook
 *
 * 封装倒计时的全部状态和逻辑：
 * - timeRemaining / isTimerRunning 状态
 * - setInterval 管理
 * - 归零时触发 onComplete 回调
 * - taskStartTime（计时开始的时间戳，供外部系统使用）
 *
 * onComplete 通过 ref 存储，避免 interval 回调拿到过时闭包。
 */
import { useState, useRef, useCallback, useEffect } from 'react';

interface UseSessionTimerOptions {
  /** 初始倒计时秒数 */
  initialTime: number;
  /** 倒计时归零时调用（内部用 ref 存储，不会导致 interval 重建） */
  onComplete: () => void;
}

export interface UseSessionTimerReturn {
  /** 剩余秒数 */
  timeRemaining: number;
  /** 是否正在计时 */
  isTimerRunning: boolean;
  /** 计时开始的时间戳（Date.now()），0 表示未开始 */
  taskStartTime: number;
  /** 开始倒计时（同时设置 taskStartTime） */
  startTimer: () => void;
  /** 停止倒计时（不重置时间） */
  stopTimer: () => void;
  /** 停止倒计时并重置为 initialTime，清空 taskStartTime */
  resetTimer: () => void;
  /** 仅清理 interval（用于组件卸载，不触发状态更新） */
  cleanupTimer: () => void;
}

/**
 * 倒计时定时器 Hook
 *
 * @example
 * const timer = useSessionTimer({
 *   initialTime: 300,
 *   onComplete: () => { saveMemory(); cleanup(); },
 * });
 * // timer.startTimer()  → 开始
 * // timer.stopTimer()   → 暂停
 * // timer.resetTimer()  → 重置
 */
export function useSessionTimer({ initialTime, onComplete }: UseSessionTimerOptions): UseSessionTimerReturn {
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [taskStartTime, setTaskStartTime] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 用 ref 存储 onComplete，避免 interval 回调捕获旧闭包。
   * 调用方传入的 onComplete 可能依赖外部 state（如 cleanup），
   * 这个 ref 确保归零时总是调用最新版本。
   */
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  /** 开始倒计时 */
  const startTimer = useCallback(() => {
    setIsTimerRunning(true);
    setTaskStartTime(Date.now());
  }, []);

  /** 停止倒计时（不重置剩余时间） */
  const stopTimer = useCallback(() => {
    setIsTimerRunning(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  /** 停止并重置为初始时间 */
  const resetTimer = useCallback(() => {
    stopTimer();
    setTimeRemaining(initialTime);
    setTaskStartTime(0);
  }, [initialTime, stopTimer]);

  /**
   * 倒计时核心 effect
   *
   * 依赖 [isTimerRunning] —— 只有开始/停止时才重建 interval。
   * 归零时在 microtask 之后（setTimeout(0)）触发 onComplete，
   * 避免在 setState updater 内部调用外部 side effect。
   */
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;

          if (newTime <= 0) {
            // 先清 interval，防止多次触发
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            // 延迟触发，避免在 setState updater 里产生 side effect
            setTimeout(() => {
              setIsTimerRunning(false);
              onCompleteRef.current();
            }, 0);
            return 0;
          }

          return newTime;
        });
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
    timeRemaining,
    isTimerRunning,
    taskStartTime,
    startTimer,
    stopTimer,
    resetTimer,
    cleanupTimer,
  };
}
