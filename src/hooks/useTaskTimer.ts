import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Task Timer Hook - 计时器管理
 * 
 * 职责：
 * - 管理任务倒计时（5分钟）
 * - 管理工作计时（正计时）
 * - 提供计时完成回调
 */

export interface UseTaskTimerOptions {
  /** 初始倒计时时间（秒），默认 300（5分钟）*/
  initialTime?: number;
  /** 倒计时结束时的回调 */
  onCountdownComplete?: () => void;
}

export function useTaskTimer(options: UseTaskTimerOptions = {}) {
  const {
    initialTime = 300,
    onCountdownComplete,
  } = options;

  // 倒计时状态
  const [timeRemaining, setTimeRemaining] = useState(initialTime);
  const [isCountdownRunning, setIsCountdownRunning] = useState(false);

  // 正计时状态（工作时长）
  const [workingSeconds, setWorkingSeconds] = useState(0);
  const [isWorkingTimerRunning, setIsWorkingTimerRunning] = useState(false);

  // 任务开始时间
  const [taskStartTime, setTaskStartTime] = useState<number>(0);

  // Refs
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const workingTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 开始倒计时
   */
  const startCountdown = useCallback(() => {
    setIsCountdownRunning(true);
    setTaskStartTime(Date.now());

    if (import.meta.env.DEV) {
      console.log('⏱️ 倒计时开始');
    }
  }, []);

  /**
   * 停止倒计时
   */
  const stopCountdown = useCallback(() => {
    setIsCountdownRunning(false);
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }

    if (import.meta.env.DEV) {
      console.log('⏱️ 倒计时停止');
    }
  }, []);

  /**
   * 开始工作计时（正计时）
   */
  const startWorkingTimer = useCallback(() => {
    setWorkingSeconds(0);
    setIsWorkingTimerRunning(true);

    if (import.meta.env.DEV) {
      console.log('⏱️ 工作计时开始');
    }
  }, []);

  /**
   * 停止工作计时
   */
  const stopWorkingTimer = useCallback(() => {
    setIsWorkingTimerRunning(false);
    if (workingTimerRef.current) {
      clearInterval(workingTimerRef.current);
      workingTimerRef.current = null;
    }

    if (import.meta.env.DEV) {
      console.log('⏱️ 工作计时停止，时长:', workingSeconds, '秒');
    }
  }, [workingSeconds]);

  /**
   * 重置所有计时器
   */
  const reset = useCallback(() => {
    stopCountdown();
    stopWorkingTimer();
    setTimeRemaining(initialTime);
    setWorkingSeconds(0);
    setTaskStartTime(0);

    if (import.meta.env.DEV) {
      console.log('⏱️ 计时器已重置');
    }
  }, [initialTime, stopCountdown, stopWorkingTimer]);

  /**
   * 获取已用时间（秒）
   */
  const getElapsedSeconds = useCallback(() => {
    if (taskStartTime === 0) return 0;
    return Math.floor((Date.now() - taskStartTime) / 1000);
  }, [taskStartTime]);

  /**
   * 获取已用时间（分钟）
   */
  const getElapsedMinutes = useCallback(() => {
    return Math.floor(getElapsedSeconds() / 60);
  }, [getElapsedSeconds]);

  /**
   * 格式化时间显示 (mm:ss)
   */
  const formatTime = useCallback((seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }, []);

  // 倒计时效果
  useEffect(() => {
    if (isCountdownRunning && timeRemaining > 0) {
      countdownTimerRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;

          // 倒计时结束
          if (newTime <= 0) {
            setIsCountdownRunning(false);
            if (countdownTimerRef.current) {
              clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
            }
            onCountdownComplete?.();
            return 0;
          }

          return newTime;
        });
      }, 1000);

      return () => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
        }
      };
    }
  }, [isCountdownRunning, timeRemaining, onCountdownComplete]);

  // 工作计时效果
  useEffect(() => {
    if (isWorkingTimerRunning) {
      workingTimerRef.current = setInterval(() => {
        setWorkingSeconds(prev => prev + 1);
      }, 1000);

      return () => {
        if (workingTimerRef.current) {
          clearInterval(workingTimerRef.current);
        }
      };
    }
  }, [isWorkingTimerRunning]);

  return {
    // 倒计时状态
    timeRemaining,
    isCountdownRunning,
    formattedTimeRemaining: formatTime(timeRemaining),

    // 工作计时状态
    workingSeconds,
    isWorkingTimerRunning,
    formattedWorkingTime: formatTime(workingSeconds),

    // 任务时间
    taskStartTime,
    getElapsedSeconds,
    getElapsedMinutes,

    // 操作
    startCountdown,
    stopCountdown,
    startWorkingTimer,
    stopWorkingTimer,
    reset,
    formatTime,
  };
}

