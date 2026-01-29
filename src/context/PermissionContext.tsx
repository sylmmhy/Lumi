/**
 * Permission Context Provider
 *
 * 全局共享权限状态的 Provider
 * 支持 Android、iOS WebView 和 Web 浏览器三端
 *
 * 使用方法：
 * 1. 在 App 顶层包裹 <PermissionProvider>
 * 2. 在组件中使用 usePermission() 获取权限状态
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  PermissionContext,
  type PermissionType,
  type PermissionStatus,
  type PermissionRecord,
} from './PermissionContextDefinition';

/** localStorage key: 用户是否跳过了权限提示 */
const PERMISSION_DISMISSED_KEY = 'permission_alert_dismissed';

/** localStorage key: 用户是否已配置睡眠模式免打扰 */
const SLEEP_FOCUS_CONFIGURED_KEY = 'sleep_focus_configured';

/**
 * 检测是否在 Android WebView 中运行
 */
function isAndroidWebView(): boolean {
  return !!(window.AndroidBridge?.isAndroid?.());
}

/**
 * 检测是否在 iOS WebView (WKWebView) 中运行
 */
function isIOSWebView(): boolean {
  const handlers = window.webkit?.messageHandlers;
  if (!handlers) return false;
  return !!(
    handlers.nativeApp ||
    handlers.requestMicrophonePermission ||
    handlers.requestCameraPermission ||
    handlers.requestNotificationPermission
  );
}

/**
 * iOS Bridge - 通过 WKWebView 向 iOS 原生端发送消息
 */
const iOSBridge = {
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
  openAppSettings: () => {
    window.webkit?.messageHandlers?.openAppSettings?.postMessage({});
  },
  openSleepFocusSettings: () => {
    window.webkit?.messageHandlers?.openSleepFocusSettings?.postMessage({});
  },
};

interface PermissionProviderProps {
  children: React.ReactNode;
}

/**
 * Permission Provider 组件
 *
 * 在 App 启动时检测权限状态，并通过 Context 共享给所有子组件
 */
export function PermissionProvider({ children }: PermissionProviderProps) {
  const [permissions, setPermissions] = useState<PermissionRecord>({
    notification: 'unknown',
    microphone: 'unknown',
    camera: 'unknown',
    sleepFocus: 'unknown',
  });
  const [isRequesting, setIsRequesting] = useState<PermissionType | null>(null);
  const [isDismissed, setIsDismissed] = useState<boolean>(() => {
    // 初始化时从 localStorage 读取用户是否跳过
    return localStorage.getItem(PERMISSION_DISMISSED_KEY) === 'true';
  });
  // 追踪用户是否已看过睡眠模式教程（用于触发重新渲染）
  const [sleepFocusSeen, setSleepFocusSeen] = useState<boolean>(() => {
    return localStorage.getItem(SLEEP_FOCUS_CONFIGURED_KEY) === 'true';
  });
  const pendingPermissionRef = useRef<PermissionType | null>(null);

  /** 防抖：上次检查权限的时间戳 */
  const lastCheckTimeRef = useRef<number>(0);
  /** 防抖间隔（毫秒）- 在此时间内不重复检查 */
  const CHECK_DEBOUNCE_MS = 500;

  /**
   * 获取睡眠模式的显示状态
   * 由于 iOS 没有 API 检测睡眠模式免打扰状态，
   * iOS 上始终返回 'prompt' 让按钮保持可点击（用户可反复查看教程）
   * 红点的显示由 sleepFocusSeen 状态控制，而非此函数
   */
  const getSleepFocusStatus = useCallback((): PermissionStatus => {
    // 只在 iOS WebView 中才需要配置睡眠模式
    if (!isIOSWebView()) {
      return 'granted'; // 非 iOS 设备默认为已授权（不显示此选项）
    }
    // iOS 上始终返回 prompt，让按钮保持可点击
    return 'prompt';
  }, []);

  /**
   * 检查所有权限状态
   * 内置防抖逻辑，避免短时间内重复查询原生端
   */
  const checkAllPermissions = useCallback(async () => {
    // 防抖检查：如果距离上次检查不足 500ms，跳过
    const now = Date.now();
    if (now - lastCheckTimeRef.current < CHECK_DEBOUNCE_MS) {
      console.debug('[PermissionContext] 跳过权限检查（防抖）');
      return;
    }
    lastCheckTimeRef.current = now;

    // Android WebView - 直接调用同步方法
    if (isAndroidWebView()) {
      const notifGranted = window.AndroidBridge?.hasNotificationPermission?.();
      const micGranted = window.AndroidBridge?.hasMicrophonePermission?.();
      const camGranted = window.AndroidBridge?.hasCameraPermission?.();
      setPermissions({
        notification: notifGranted ? 'granted' : 'prompt',
        microphone: micGranted ? 'granted' : 'prompt',
        camera: camGranted ? 'granted' : 'prompt',
        sleepFocus: 'granted', // Android 不需要配置睡眠模式
      });
      return;
    }

    // iOS WebView - 通过事件返回权限状态
    if (isIOSWebView()) {
      iOSBridge.hasNotificationPermission();
      iOSBridge.hasMicrophonePermission();
      iOSBridge.hasCameraPermission();
      // 睡眠模式状态从 localStorage 读取
      setPermissions(prev => ({
        ...prev,
        sleepFocus: getSleepFocusStatus(),
      }));
      return;
    }

    // Web 浏览器 - 使用 Permissions API
    const newPermissions: PermissionRecord = {
      notification: 'unknown',
      microphone: 'unknown',
      camera: 'unknown',
      sleepFocus: 'granted', // Web 浏览器不需要配置睡眠模式
    };

    // 检查通知权限
    if ('Notification' in window) {
      const status = Notification.permission;
      newPermissions.notification = status === 'granted' ? 'granted'
        : status === 'denied' ? 'denied' : 'prompt';
    }

    // 检查麦克风和摄像头权限
    if ('permissions' in navigator) {
      try {
        const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        newPermissions.microphone = micResult.state === 'granted' ? 'granted'
          : micResult.state === 'denied' ? 'denied' : 'prompt';
      } catch {
        newPermissions.microphone = 'prompt';
      }

      try {
        const camResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
        newPermissions.camera = camResult.state === 'granted' ? 'granted'
          : camResult.state === 'denied' ? 'denied' : 'prompt';
      } catch {
        newPermissions.camera = 'prompt';
      }
    }

    setPermissions(newPermissions);
  }, [getSleepFocusStatus]);

  // 组件挂载时检测权限
  useEffect(() => {
    checkAllPermissions();
  }, [checkAllPermissions]);

  // 监听原生端权限结果事件（Android 和 iOS）
  useEffect(() => {
    if (!isAndroidWebView() && !isIOSWebView()) return;

    const handlePermissionResult = (event: CustomEvent<{ type: PermissionType; granted: boolean; status?: string }>) => {
      const { type, granted, status } = event.detail;

      // 根据返回值确定权限状态
      let permissionStatus: PermissionStatus;
      if (status) {
        permissionStatus = status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'prompt';
      } else {
        permissionStatus = granted ? 'granted' : 'denied';
      }

      setPermissions(prev => ({ ...prev, [type]: permissionStatus }));

      // 如果是我们正在等待的权限请求结果，重置请求状态
      if (pendingPermissionRef.current === type) {
        pendingPermissionRef.current = null;
        setIsRequesting(null);
      }
    };

    window.addEventListener('permissionResult', handlePermissionResult as EventListener);
    return () => {
      window.removeEventListener('permissionResult', handlePermissionResult as EventListener);
    };
  }, []);

  /**
   * 打开系统设置页面（让用户手动开启权限）
   */
  const openAppSettings = useCallback(() => {
    if (isAndroidWebView()) {
      window.AndroidBridge?.openAppSettings?.();
      return;
    }

    if (isIOSWebView()) {
      iOSBridge.openAppSettings();
      return;
    }
  }, []);

  /**
   * 请求单个权限
   * 如果权限之前被拒绝，则打开系统设置
   */
  const requestPermission = useCallback(async (type: PermissionType) => {
    setIsRequesting(type);

    // 特殊处理：睡眠模式免打扰（仅 iOS）
    if (type === 'sleepFocus') {
      if (isIOSWebView()) {
        // 打开睡眠模式设置引导
        iOSBridge.openSleepFocusSettings();
        // 标记用户已看过教程（仅用于隐藏红点，不代表已授权）
        localStorage.setItem(SLEEP_FOCUS_CONFIGURED_KEY, 'true');
        setSleepFocusSeen(true);
        // 注意：不设置为 granted，保持 prompt 状态让按钮始终可点击
      }
      setIsRequesting(null);
      return;
    }

    // 如果权限被拒绝，打开系统设置
    if (permissions[type] === 'denied') {
      openAppSettings();
      setIsRequesting(null);
      return;
    }

    // Android WebView
    if (isAndroidWebView()) {
      pendingPermissionRef.current = type;
      if (type === 'notification') {
        window.AndroidBridge?.requestNotificationPermission?.();
      } else if (type === 'microphone') {
        window.AndroidBridge?.requestMicrophonePermission?.();
      } else if (type === 'camera') {
        window.AndroidBridge?.requestCameraPermission?.();
      }
      return;
    }

    // iOS WebView
    if (isIOSWebView()) {
      pendingPermissionRef.current = type;
      if (type === 'notification') {
        iOSBridge.requestNotificationPermission();
      } else if (type === 'microphone') {
        iOSBridge.requestMicrophonePermission();
      } else if (type === 'camera') {
        iOSBridge.requestCameraPermission();
      }
      return;
    }

    // Web 浏览器
    try {
      if (type === 'notification') {
        if ('Notification' in window) {
          const result = await Notification.requestPermission();
          setPermissions(prev => ({
            ...prev,
            notification: result === 'granted' ? 'granted' : 'denied'
          }));
        }
      } else if (type === 'microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        setPermissions(prev => ({ ...prev, microphone: 'granted' }));
      } else if (type === 'camera') {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        setPermissions(prev => ({ ...prev, camera: 'granted' }));
      }
    } catch {
      setPermissions(prev => ({ ...prev, [type]: 'denied' }));
    } finally {
      setIsRequesting(null);
    }
  }, [permissions, openAppSettings]);

  /**
   * 用户点击"跳过"时调用，记录到 localStorage
   */
  const dismissAlert = useCallback(() => {
    localStorage.setItem(PERMISSION_DISMISSED_KEY, 'true');
    setIsDismissed(true);
  }, []);

  /**
   * 重置"跳过"状态（下次会再次显示提示）
   */
  const resetDismissed = useCallback(() => {
    localStorage.removeItem(PERMISSION_DISMISSED_KEY);
    setIsDismissed(false);
  }, []);

  // 计算派生状态（使用 useMemo 避免重复计算）
  const derivedState = useMemo(() => {
    // 只计算可检测的基础权限（notification, microphone, camera）
    // sleepFocus 无法检测是否真的授权，用 localStorage 判断是否看过教程
    const basePermissions = [
      permissions.notification,
      permissions.microphone,
      permissions.camera,
    ];
    const grantedCount = basePermissions.filter(s => s === 'granted').length;
    const totalCount = basePermissions.length;
    const baseAllGranted = grantedCount === totalCount;

    // iOS 上检查用户是否已看过睡眠模式教程（使用 state 而非直接读取 localStorage）
    const hasSleepFocusMissing = isIOSWebView() && !sleepFocusSeen;

    // 只有基础权限全部授权且（非 iOS 或已看过睡眠教程）才算全部完成
    const allGranted = baseAllGranted && !hasSleepFocusMissing;
    const hasMissingPermissions = !allGranted;

    // 是否应该显示红点：有缺失权限 且 用户没有跳过
    const shouldShowBadge = hasMissingPermissions && !isDismissed;

    // 获取缺失的权限列表
    const missingPermissions: PermissionType[] = [];
    if (permissions.notification !== 'granted') missingPermissions.push('notification');
    if (permissions.microphone !== 'granted') missingPermissions.push('microphone');
    if (permissions.camera !== 'granted') missingPermissions.push('camera');
    if (hasSleepFocusMissing) missingPermissions.push('sleepFocus');

    return {
      grantedCount,
      allGranted,
      hasMissingPermissions,
      shouldShowBadge,
      missingPermissions,
    };
  }, [permissions, isDismissed, sleepFocusSeen]);

  // 构建 Context value
  const value = useMemo(() => ({
    permissions,
    isRequesting,
    isDismissed,
    ...derivedState,
    checkAllPermissions,
    requestPermission,
    openAppSettings,
    dismissAlert,
    resetDismissed,
    isInNativeApp: isAndroidWebView() || isIOSWebView(),
  }), [
    permissions,
    isRequesting,
    isDismissed,
    derivedState,
    checkAllPermissions,
    requestPermission,
    openAppSettings,
    dismissAlert,
    resetDismissed,
  ]);

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}
