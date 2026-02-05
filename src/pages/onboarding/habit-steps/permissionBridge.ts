import { useEffect } from 'react';

/**
 * Onboarding 权限步骤的共享工具
 *
 * 目的：
 * - 把「检测当前权限是否已开」的逻辑从 PermissionsStep / PermissionsStepReview 抽出来
 * - 避免两处维护同一段 Android / iOS / Web 分支逻辑
 *
 * 注意：
 * - iOS 分支的 `has*Permission` 通过 WKWebView messageHandlers 通知原生端查询；
 *   结果需要原生端再通过自定义事件回传（当前步骤组件里会监听 permissionResult）。
 */

export type PermissionType = 'notification' | 'microphone' | 'camera';
export type PermissionStatus = 'pending' | 'granted' | 'denied';

/**
 * 检测是否运行在 Android WebView 中
 */
export function isAndroidWebView(): boolean {
  return !!(window.AndroidBridge?.isAndroid?.());
}

/**
 * 检测是否运行在 iOS WebView (WKWebView) 中
 * iOS WebView 使用 webkit.messageHandlers 与原生端通信
 */
export function isIOSWebView(): boolean {
  return !!(window.webkit?.messageHandlers?.nativeApp);
}

/**
 * iOS Bridge - 通过 WKWebView 向 iOS 原生端发送消息
 */
export const iOSBridge = {
  requestNotificationPermission: () => {
    window.webkit?.messageHandlers?.requestNotificationPermission?.postMessage({});
  },
  requestMicrophonePermission: () => {
    window.webkit?.messageHandlers?.requestMicrophonePermission?.postMessage({});
  },
  requestCameraPermission: () => {
    window.webkit?.messageHandlers?.requestCameraPermission?.postMessage({});
  },
  hasNotificationPermission: () => {
    window.webkit?.messageHandlers?.hasNotificationPermission?.postMessage({});
  },
  hasMicrophonePermission: () => {
    window.webkit?.messageHandlers?.hasMicrophonePermission?.postMessage({});
  },
  hasCameraPermission: () => {
    window.webkit?.messageHandlers?.hasCameraPermission?.postMessage({});
  },
};

/**
 * 获取当前已知的初始权限状态（不会弹系统授权框）
 *
 * - Android：读取 AndroidBridge 的 has*Permission()
 * - iOS：触发原生查询（结果由原生事件回传），这里不直接返回 granted/denied
 * - Web：读取 Notification.permission + navigator.permissions.query()
 *
 * @returns 仅包含需要更新的字段（默认值由调用方提供）
 */
export async function getInitialPermissionStatus(): Promise<Partial<Record<PermissionType, PermissionStatus>>> {
  const updates: Partial<Record<PermissionType, PermissionStatus>> = {};

  if (isAndroidWebView()) {
    if (window.AndroidBridge?.hasNotificationPermission?.()) {
      updates.notification = 'granted';
    }
    if (window.AndroidBridge?.hasMicrophonePermission?.()) {
      updates.microphone = 'granted';
    }
    if (window.AndroidBridge?.hasCameraPermission?.()) {
      updates.camera = 'granted';
    }
    return updates;
  }

  if (isIOSWebView()) {
    // iOS 会通过事件回传结果（由 PermissionsStep / PermissionsStepReview 监听）
    iOSBridge.hasNotificationPermission();
    iOSBridge.hasMicrophonePermission();
    iOSBridge.hasCameraPermission();
    return updates;
  }

  // Web browser
  if ('Notification' in window && Notification.permission === 'granted') {
    updates.notification = 'granted';
  }

  if ('permissions' in navigator) {
    try {
      const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      if (micResult.state === 'granted') {
        updates.microphone = 'granted';
      }
    } catch { /* ignore */ }

    try {
      const camResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
      if (camResult.state === 'granted') {
        updates.camera = 'granted';
      }
    } catch { /* ignore */ }
  }

  return updates;
}

/**
 * 在组件挂载时检查初始权限状态，并把「已知已授权」的结果合并到 state。
 *
 * @param setPermissionStatus - PermissionsStep 内部的 setState
 */
export function useInitialPermissionStatus(
  setPermissionStatus: React.Dispatch<React.SetStateAction<Record<PermissionType, PermissionStatus>>>,
): void {
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const initial = await getInitialPermissionStatus();
      if (cancelled) return;
      if (Object.keys(initial).length === 0) return;
      setPermissionStatus(prev => ({ ...prev, ...initial }));
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [setPermissionStatus]);
}

