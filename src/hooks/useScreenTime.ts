/**
 * Screen Time Hook
 *
 * 用于与 iOS 原生 Screen Time 功能交互
 * 通过 WebView Bridge 调用原生 API
 */

import { useState, useEffect, useCallback } from 'react';

export interface ScreenTimeStatus {
  status: 'notDetermined' | 'denied' | 'approved' | 'error';
  isAuthorized: boolean;
  appsCount: number;
  categoriesCount: number;
  isLocked: boolean;
  isConfigured: boolean;
}

/**
 * Screen Time 操作事件
 * 从 iOS Shield 界面点击按钮后触发
 */
export interface ScreenTimeActionEvent {
  action: 'start_task' | 'confirm_consequence';
  taskName?: string;
  taskId?: string;
  consequence?: string;
  consequencePledge?: string;
}

interface ScreenTimeCallback {
  action: string;
  status?: string;
  isAuthorized?: boolean;
  appsCount?: number;
  categoriesCount?: number;
  isLocked?: boolean;
  isConfigured?: boolean;
  error?: string;
  message?: string;
}

/**
 * 检查是否在 iOS 原生 App 中运行
 */
export function isIOSNativeApp(): boolean {
  return !!(
    typeof window !== 'undefined' &&
    window.webkit?.messageHandlers?.screenTime
  );
}

/**
 * useScreenTime Hook 配置选项
 */
export interface UseScreenTimeOptions {
  /**
   * Screen Time 操作事件回调
   * 当用户从 Shield 界面点击按钮后触发
   */
  onAction?: (event: ScreenTimeActionEvent) => void;
}

/**
 * Screen Time 功能 Hook
 *
 * 使用方式:
 * ```tsx
 * const { status, requestAuthorization, showAppPicker, isAvailable } = useScreenTime({
 *   onAction: (event) => {
 *     if (event.action === 'start_task') {
 *       // 跳转到 Gemini Live 开始任务
 *     } else if (event.action === 'confirm_consequence') {
 *       // 显示后果确认界面
 *     }
 *   }
 * });
 *
 * if (isAvailable) {
 *   // 显示 Screen Time 设置入口
 * }
 * ```
 */
export function useScreenTime(options: UseScreenTimeOptions = {}) {
  const [status, setStatus] = useState<ScreenTimeStatus>({
    status: 'notDetermined',
    isAuthorized: false,
    appsCount: 0,
    categoriesCount: 0,
    isLocked: false,
    isConfigured: false,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAvailable = isIOSNativeApp();
  const onAction = options.onAction;

  // 设置全局回调函数
  useEffect(() => {
    if (!isAvailable) return;

    // 定义全局回调函数供 Native 调用
    (window as unknown as { onScreenTimeCallback: (data: ScreenTimeCallback) => void }).onScreenTimeCallback = (data: ScreenTimeCallback) => {
      console.log('[ScreenTime] Callback received:', data);
      setIsLoading(false);

      switch (data.action) {
        case 'authorizationChanged':
          setStatus(prev => ({
            ...prev,
            status: data.status as ScreenTimeStatus['status'] || prev.status,
            isAuthorized: data.isAuthorized ?? prev.isAuthorized,
          }));
          if (data.error) {
            setError(data.error);
          }
          break;

        case 'statusUpdate':
          setStatus({
            status: data.status as ScreenTimeStatus['status'] || 'notDetermined',
            isAuthorized: data.isAuthorized ?? false,
            appsCount: data.appsCount ?? 0,
            categoriesCount: data.categoriesCount ?? 0,
            isLocked: data.isLocked ?? false,
            isConfigured: data.isConfigured ?? false,
          });
          break;

        case 'selectionChanged':
          setStatus(prev => ({
            ...prev,
            appsCount: data.appsCount ?? prev.appsCount,
            categoriesCount: data.categoriesCount ?? prev.categoriesCount,
            isConfigured: (data.appsCount ?? 0) > 0 || (data.categoriesCount ?? 0) > 0,
          }));
          break;

        case 'lockStatusChanged':
          setStatus(prev => ({
            ...prev,
            isLocked: data.isLocked ?? prev.isLocked,
          }));
          break;

        case 'consequenceAccepted':
          setStatus(prev => ({
            ...prev,
            isLocked: false,
          }));
          break;

        case 'error':
          setError(data.message || 'Unknown error');
          break;
      }
    };

    // 初始化时获取状态
    // 注意：直接调用 sendMessage 而非 getStatus，避免在声明前访问
    if (window.webkit?.messageHandlers?.screenTime) {
      window.webkit.messageHandlers.screenTime.postMessage({ action: 'getStatus' });
    }

    return () => {
      // 清理全局回调
      delete (window as unknown as { onScreenTimeCallback?: unknown }).onScreenTimeCallback;
    };
  }, [isAvailable]);

  // 监听 iOS 发送的 screenTimeAction 事件
  useEffect(() => {
    const handleScreenTimeAction = (event: Event) => {
      const customEvent = event as CustomEvent<ScreenTimeActionEvent>;
      console.log('[ScreenTime] Action event received:', customEvent.detail);

      if (onAction) {
        onAction(customEvent.detail);
      }
    };

    window.addEventListener('screenTimeAction', handleScreenTimeAction);

    return () => {
      window.removeEventListener('screenTimeAction', handleScreenTimeAction);
    };
  }, [onAction]);

  /**
   * 发送消息到 Native
   */
  const sendMessage = useCallback((action: string, payload: Record<string, unknown> = {}) => {
    if (!isAvailable) {
      console.warn('[ScreenTime] Not available in this environment');
      return;
    }

    const message = { action, ...payload };
    console.log('[ScreenTime] Sending message:', message);

    window.webkit?.messageHandlers?.screenTime?.postMessage(message);
  }, [isAvailable]);

  /**
   * 请求 Screen Time 授权
   */
  const requestAuthorization = useCallback(() => {
    setIsLoading(true);
    setError(null);
    sendMessage('requestAuthorization');
  }, [sendMessage]);

  /**
   * 获取当前状态
   */
  const getStatus = useCallback(() => {
    sendMessage('getStatus');
  }, [sendMessage]);

  /**
   * 显示应用选择器
   */
  const showAppPicker = useCallback(() => {
    if (!status.isAuthorized) {
      setError('Please authorize Screen Time first');
      return;
    }
    sendMessage('showAppPicker');
  }, [sendMessage, status.isAuthorized]);

  /**
   * 手动锁定应用（测试用）
   */
  const lockApps = useCallback((reason: string, consequence: string, callRecordId?: string) => {
    sendMessage('lockApps', { reason, consequence, callRecordId });
  }, [sendMessage]);

  /**
   * 手动解锁应用
   */
  const unlockApps = useCallback(() => {
    sendMessage('unlockApps');
  }, [sendMessage]);

  /**
   * 接受后果并解锁
   */
  const acceptConsequence = useCallback((consequenceId?: string) => {
    sendMessage('acceptConsequence', { consequenceId });
  }, [sendMessage]);

  return {
    // 状态
    status,
    isLoading,
    error,
    isAvailable,

    // 方法
    requestAuthorization,
    getStatus,
    showAppPicker,
    lockApps,
    unlockApps,
    acceptConsequence,
  };
}

// Window.webkit 类型定义在 src/context/AuthContext.tsx 中统一管理

export default useScreenTime;
