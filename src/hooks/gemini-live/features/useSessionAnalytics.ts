/**
 * useSessionAnalytics - 会话分析埋点
 *
 * 职责：
 * - 追踪会话开始/结束
 * - 追踪麦克风/摄像头使用情况
 * - 发送埋点事件
 *
 * 设计决策：
 * - 完全独立的副作用模块
 * - 使用 ref 追踪实时状态（避免 React 异步更新问题）
 */

import { useRef, useCallback } from 'react';
import { trackEvent } from '../../../lib/amplitude';
import type { SessionStats } from '../types';

interface UseSessionAnalyticsReturn {
  // State tracking
  micEnabledRef: React.MutableRefObject<boolean>;
  cameraEnabledRef: React.MutableRefObject<boolean>;

  // Actions
  trackConnect: () => void;
  trackDisconnect: () => void;
  trackMicToggle: (enabled: boolean) => void;
  trackCameraToggle: (enabled: boolean) => void;
  resetStats: () => void;

  // Stats access
  getStats: () => SessionStats;
}

export function useSessionAnalytics(): UseSessionAnalyticsReturn {
  // Refs for real-time state tracking
  const micEnabledRef = useRef(false);
  const cameraEnabledRef = useRef(false);
  const sessionStartTimeRef = useRef<number | null>(null);

  // Session stats
  const statsRef = useRef<SessionStats>({
    micEnabledCount: 0,
    micDisabledCount: 0,
    cameraEnabledCount: 0,
    cameraDisabledCount: 0,
    micWasEnabled: false,
    cameraWasEnabled: false,
  });

  /**
   * 重置会话统计
   */
  const resetStats = useCallback(() => {
    statsRef.current = {
      micEnabledCount: 0,
      micDisabledCount: 0,
      cameraEnabledCount: 0,
      cameraDisabledCount: 0,
      micWasEnabled: micEnabledRef.current,
      cameraWasEnabled: cameraEnabledRef.current,
    };
  }, []);

  /**
   * 追踪连接成功
   */
  const trackConnect = useCallback(() => {
    sessionStartTimeRef.current = Date.now();

    trackEvent('gemini_live_connected', {
      mic_enabled_at_start: statsRef.current.micWasEnabled,
      camera_enabled_at_start: statsRef.current.cameraWasEnabled,
    });
  }, []);

  /**
   * 追踪断开连接
   */
  const trackDisconnect = useCallback(() => {
    if (sessionStartTimeRef.current) {
      const durationSeconds = Math.round(
        (Date.now() - sessionStartTimeRef.current) / 1000
      );
      const stats = statsRef.current;

      trackEvent('gemini_live_disconnected', {
        duration_seconds: durationSeconds,
        mic_was_enabled: stats.micWasEnabled,
        mic_enabled_count: stats.micEnabledCount,
        mic_disabled_count: stats.micDisabledCount,
        camera_was_enabled: stats.cameraWasEnabled,
        camera_enabled_count: stats.cameraEnabledCount,
        camera_disabled_count: stats.cameraDisabledCount,
      });

      sessionStartTimeRef.current = null;
    }
  }, []);

  /**
   * 追踪麦克风切换
   */
  const trackMicToggle = useCallback((enabled: boolean) => {
    micEnabledRef.current = enabled;

    if (enabled) {
      statsRef.current.micEnabledCount++;
      statsRef.current.micWasEnabled = true;
    } else {
      statsRef.current.micDisabledCount++;
    }

    trackEvent('gemini_live_mic_toggled', { enabled });
  }, []);

  /**
   * 追踪摄像头切换
   */
  const trackCameraToggle = useCallback((enabled: boolean) => {
    cameraEnabledRef.current = enabled;

    if (enabled) {
      statsRef.current.cameraEnabledCount++;
      statsRef.current.cameraWasEnabled = true;
    } else {
      statsRef.current.cameraDisabledCount++;
    }

    trackEvent('gemini_live_camera_toggled', { enabled });
  }, []);

  /**
   * 获取当前统计
   */
  const getStats = useCallback((): SessionStats => {
    return { ...statsRef.current };
  }, []);

  return {
    // State tracking
    micEnabledRef,
    cameraEnabledRef,

    // Actions
    trackConnect,
    trackDisconnect,
    trackMicToggle,
    trackCameraToggle,
    resetStats,

    // Stats access
    getStats,
  };
}
