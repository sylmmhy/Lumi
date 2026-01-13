import { useEffect, useCallback, useRef } from 'react';
import { trackEvent as trackAmplitudeEvent, setUserId as setAmplitudeUserId, setUserProperties as setAmplitudeUserProperties } from '../lib/amplitude';
import { trackPostHogEvent, setPostHogUserId, setPostHogUserProperties } from '../lib/posthog';

/**
 * 统一的事件追踪函数
 * 同时向 Amplitude 和 PostHog 发送事件
 */
const trackEvent = (eventName: string, properties?: Record<string, unknown>) => {
  trackAmplitudeEvent(eventName, properties);
  trackPostHogEvent(eventName, properties);
}

/**
 * Analytics Hook - 数据埋点封装
 * 
 * 职责：
 * - 初始化用户身份标识
 * - 提供统一的事件追踪接口
 * - 管理 Onboarding 相关的埋点事件
 */

export interface AnalyticsUserInfo {
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  isNewUser: boolean;
}

export interface UseAnalyticsOptions {
  /** 是否在 mount 时追踪页面打开事件 */
  trackPageOpen?: boolean;
  /** 页面名称，用于事件追踪 */
  pageName?: string;
}

export function useAnalytics(options: UseAnalyticsOptions = {}) {
  const {
    trackPageOpen = false,
    pageName = 'unknown',
  } = options;

  const isInitializedRef = useRef(false);

  /**
   * 初始化用户身份标识
   * 必须在发送任何事件之前调用
   */
  const initializeUser = useCallback(async (userInfo: AnalyticsUserInfo) => {
    const { userId, userEmail, userName, isNewUser } = userInfo;

    if (userId && userEmail) {
      // Amplitude Setup
      await setAmplitudeUserId(userId);
      await setAmplitudeUserProperties({
        email: userEmail,
        name: userName || undefined,
        is_new_user: isNewUser,
      });

      // PostHog Setup
      setPostHogUserId(userId);
      setPostHogUserProperties({
        email: userEmail,
        name: userName || undefined,
        is_new_user: isNewUser,
      });

      if (import.meta.env.DEV) {
        console.log('✅ Analytics (Amplitude & PostHog) 用户已标识:', { userId, userEmail, userName });
      }
    }
  }, []);

  /**
   * 追踪页面打开事件
   */
  const trackPageOpened = useCallback((extraProps?: Record<string, unknown>) => {
    const userId = localStorage.getItem('user_id');
    
    trackEvent(`${pageName}_page_opened`, {
      referrer: document.referrer || 'direct',
      page_path: window.location.pathname,
      user_id: userId || 'anonymous',
      is_logged_in: !!userId,
      ...extraProps,
    });
  }, [pageName]);

  /**
   * 追踪任务开始
   */
  const trackTaskStarted = useCallback((taskDescription: string, extraProps?: Record<string, unknown>) => {
    trackEvent(`${pageName}_task_started`, {
      task_description: taskDescription,
      step: 'running',
      ...extraProps,
    });
  }, [pageName]);

  /**
   * 追踪任务完成
   */
  const trackTaskCompleted = useCallback((taskDescription: string, extraProps?: Record<string, unknown>) => {
    trackEvent(`${pageName}_task_completed`, {
      task_description: taskDescription,
      step: 'completed',
      ...extraProps,
    });
  }, [pageName]);

  /**
   * 追踪任务放弃
   */
  const trackTaskAbandoned = useCallback((
    taskDescription: string,
    timeSpentSeconds: number,
    lastStep: string,
    extraProps?: Record<string, unknown>
  ) => {
    trackEvent(`${pageName}_task_abandoned`, {
      task_description: taskDescription,
      time_spent_seconds: timeSpentSeconds,
      last_step: lastStep,
      ...extraProps,
    });
  }, [pageName]);

  /**
   * 通用事件追踪
   */
  const track = useCallback((eventName: string, properties?: Record<string, unknown>) => {
    trackEvent(eventName, properties);
  }, []);

  // 初始化：设置用户身份并追踪页面打开
  useEffect(() => {
    if (isInitializedRef.current) return;
    isInitializedRef.current = true;

    const initializeAnalytics = async () => {
      // 从 localStorage 读取用户信息
      const userId = localStorage.getItem('user_id');
      const userEmail = localStorage.getItem('user_email');
      const userName = localStorage.getItem('user_name');
      const isNewUser = localStorage.getItem('is_new_user') === 'true';

      // 初始化用户身份
      await initializeUser({
        userId,
        userEmail,
        userName,
        isNewUser,
      });

      // 追踪页面打开事件
      if (trackPageOpen) {
        trackPageOpened();
      }
    };

    initializeAnalytics();
  }, [initializeUser, trackPageOpen, trackPageOpened]);

  return {
    track,
    trackPageOpened,
    trackTaskStarted,
    trackTaskCompleted,
    trackTaskAbandoned,
    initializeUser,
  };
}

