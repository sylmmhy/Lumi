/**
 * useFocusTimer - 专注计时 Hook
 * 
 * 功能：
 * - 记录专注开始时间
 * - 计算已专注时长
 * - 格式化时间显示
 */

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseFocusTimerReturn {
  /** 是否正在计时 */
  isRunning: boolean;
  /** 已专注秒数 */
  elapsedSeconds: number;
  /** 格式化的时间字符串 (HH:MM:SS 或 MM:SS) */
  formattedTime: string;
  /** 开始计时 */
  start: () => void;
  /** 停止计时 */
  stop: () => void;
  /** 重置计时 */
  reset: () => void;
  /** 获取开始时间戳 */
  getStartTime: () => number | null;
}

/**
 * 格式化秒数为时间字符串
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

export function useFocusTimer(): UseFocusTimerReturn {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  // 更新已过时间
  const updateElapsed = useCallback(() => {
    if (startTimeRef.current) {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);
    }
  }, []);

  // 开始计时
  const start = useCallback(() => {
    if (isRunning) return;

    startTimeRef.current = Date.now();
    setIsRunning(true);
    setElapsedSeconds(0);

    // 每秒更新
    intervalRef.current = window.setInterval(updateElapsed, 1000);
  }, [isRunning, updateElapsed]);

  // 停止计时
  const stop = useCallback(() => {
    if (!isRunning) return;

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // 最后更新一次
    updateElapsed();
    setIsRunning(false);
  }, [isRunning, updateElapsed]);

  // 重置计时
  const reset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    startTimeRef.current = null;
    setIsRunning(false);
    setElapsedSeconds(0);
  }, []);

  // 获取开始时间
  const getStartTime = useCallback(() => {
    return startTimeRef.current;
  }, []);

  // 清理
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    isRunning,
    elapsedSeconds,
    formattedTime: formatTime(elapsedSeconds),
    start,
    stop,
    reset,
    getStartTime,
  };
}

export default useFocusTimer;
