import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from '../../hooks/useTranslation';

type PermissionType = 'notification' | 'microphone' | 'camera' | 'sleepFocus';
type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'prompt';

/**
 * Check if running in Android WebView
 */
function isAndroidWebView(): boolean {
  return !!(window.AndroidBridge?.isAndroid?.());
}

/**
 * Check if running in iOS WebView (WKWebView)
 * Check multiple handlers to ensure detection works
 */
function isIOSWebView(): boolean {
  const handlers = window.webkit?.messageHandlers;
  if (!handlers) return false;
  // Check for any of the permission handlers we registered
  return !!(
    handlers.nativeApp ||
    handlers.requestMicrophonePermission ||
    handlers.requestCameraPermission ||
    handlers.requestNotificationPermission
  );
}

/**
 * iOS Bridge - sends messages to native iOS app via WKWebView
 */
const iOSBridge = {
  requestNotificationPermission: () => {
    console.log('[PermissionsSection] iOS: requesting notification permission');
    window.webkit?.messageHandlers?.requestNotificationPermission?.postMessage({});
  },
  requestMicrophonePermission: () => {
    console.log('[PermissionsSection] iOS: requesting microphone permission');
    window.webkit?.messageHandlers?.requestMicrophonePermission?.postMessage({});
  },
  requestCameraPermission: () => {
    console.log('[PermissionsSection] iOS: requesting camera permission');
    window.webkit?.messageHandlers?.requestCameraPermission?.postMessage({});
  },
  hasNotificationPermission: () => {
    console.log('[PermissionsSection] iOS: checking notification permission');
    window.webkit?.messageHandlers?.hasNotificationPermission?.postMessage({});
  },
  hasMicrophonePermission: () => {
    console.log('[PermissionsSection] iOS: checking microphone permission');
    window.webkit?.messageHandlers?.hasMicrophonePermission?.postMessage({});
  },
  hasCameraPermission: () => {
    console.log('[PermissionsSection] iOS: checking camera permission');
    window.webkit?.messageHandlers?.hasCameraPermission?.postMessage({});
  },
  openAppSettings: () => {
    console.log('[PermissionsSection] iOS: opening app settings');
    window.webkit?.messageHandlers?.openAppSettings?.postMessage({});
  },
  openSleepFocusSettings: () => {
    console.log('[PermissionsSection] iOS: opening sleep focus settings guide');
    window.webkit?.messageHandlers?.openSleepFocusSettings?.postMessage({});
  },
};

/**
 * PermissionsSection - Display and manage device permissions in profile
 * Collapsible design - shows as a single row, expands to show details
 */
/** localStorage key: 用户是否已配置睡眠模式免打扰 */
const SLEEP_FOCUS_CONFIGURED_KEY = 'sleep_focus_configured';

export function PermissionsSection() {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [permissions, setPermissions] = useState<Record<PermissionType, PermissionStatus>>({
    notification: 'unknown',
    microphone: 'unknown',
    camera: 'unknown',
    sleepFocus: 'unknown',
  });
  const [isRequesting, setIsRequesting] = useState<PermissionType | 'all' | null>(null);
  const pendingPermissionRef = useRef<PermissionType | null>(null);
  // 追踪用户是否已看过睡眠模式教程（用于触发重新渲染隐藏红点）
  const [sleepFocusSeen, setSleepFocusSeen] = useState<boolean>(() => {
    return localStorage.getItem(SLEEP_FOCUS_CONFIGURED_KEY) === 'true';
  });

  /**
   * 获取睡眠模式的显示状态
   * iOS 上始终返回 'prompt' 让按钮保持可点击（用户可反复查看教程）
   * 红点的显示由 hasSleepFocusSeen 控制，而非此状态
   */
  const getSleepFocusStatus = useCallback((): PermissionStatus => {
    if (!isIOSWebView()) {
      return 'granted'; // 非 iOS 设备默认为已授权（不显示此选项）
    }
    // iOS 上始终返回 prompt，让按钮保持可点击
    return 'prompt';
  }, []);

  // Check current permission status on mount
  useEffect(() => {
    console.log('[PermissionsSection] Mount - isAndroidWebView:', isAndroidWebView(), 'isIOSWebView:', isIOSWebView());
    console.log('[PermissionsSection] window.webkit:', !!window.webkit);
    console.log('[PermissionsSection] window.webkit.messageHandlers:', !!window.webkit?.messageHandlers);
    checkAllPermissions();
  }, []);

  // Listen for native permission results (Android and iOS)
  useEffect(() => {
    if (!isAndroidWebView() && !isIOSWebView()) return;

    const handlePermissionResult = (event: CustomEvent<{ type: PermissionType; granted: boolean; status?: string }>) => {
      const { type, granted, status } = event.detail;
      console.log(`[PermissionsSection] Native permission result: ${type} = ${granted}, status = ${status}`);

      // Use status if available (iOS returns detailed status), otherwise fallback to granted boolean
      let permissionStatus: PermissionStatus;
      if (status) {
        permissionStatus = status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'prompt';
      } else {
        permissionStatus = granted ? 'granted' : 'denied';
      }

      setPermissions(prev => ({ ...prev, [type]: permissionStatus }));

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
   * Check all permission statuses
   */
  const checkAllPermissions = useCallback(async () => {
    // Check notification permission
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

    if (isIOSWebView()) {
      // For iOS, we'll request status checks - results come via events
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

    // Web browser - check using Permissions API where available
    const newPermissions: Record<PermissionType, PermissionStatus> = {
      notification: 'unknown',
      microphone: 'unknown',
      camera: 'unknown',
      sleepFocus: 'granted', // Web 浏览器不需要配置睡眠模式
    };

    // Check notification
    if ('Notification' in window) {
      const status = Notification.permission;
      newPermissions.notification = status === 'granted' ? 'granted'
        : status === 'denied' ? 'denied' : 'prompt';
    }

    // Check microphone and camera using Permissions API
    if ('permissions' in navigator) {
      try {
        const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        newPermissions.microphone = micResult.state === 'granted' ? 'granted'
          : micResult.state === 'denied' ? 'denied' : 'prompt';

        micResult.onchange = () => {
          setPermissions(prev => ({
            ...prev,
            microphone: micResult.state === 'granted' ? 'granted'
              : micResult.state === 'denied' ? 'denied' : 'prompt'
          }));
        };
      } catch {
        // Some browsers don't support microphone permission query
        newPermissions.microphone = 'prompt';
      }

      try {
        const camResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
        newPermissions.camera = camResult.state === 'granted' ? 'granted'
          : camResult.state === 'denied' ? 'denied' : 'prompt';

        camResult.onchange = () => {
          setPermissions(prev => ({
            ...prev,
            camera: camResult.state === 'granted' ? 'granted'
              : camResult.state === 'denied' ? 'denied' : 'prompt'
          }));
        };
      } catch {
        newPermissions.camera = 'prompt';
      }
    }

    setPermissions(newPermissions);
  }, [getSleepFocusStatus]);

  /**
   * Open app settings to let user manually enable permissions
   */
  const openAppSettings = useCallback(() => {
    console.log('[PermissionsSection] openAppSettings called');

    if (isAndroidWebView()) {
      window.AndroidBridge?.openAppSettings?.();
      setIsRequesting(null);
      return;
    }

    if (isIOSWebView()) {
      iOSBridge.openAppSettings();
      setIsRequesting(null);
      return;
    }

    // Web browser - no way to open settings, just reset requesting state
    setIsRequesting(null);
  }, []);

  /**
   * Request a single permission
   * If permission was previously denied, open app settings instead
   */
  const requestPermission = useCallback(async (type: PermissionType) => {
    console.log(`[PermissionsSection] requestPermission called: ${type}`);
    console.log(`[PermissionsSection] Platform: Android=${isAndroidWebView()}, iOS=${isIOSWebView()}`);
    console.log(`[PermissionsSection] Current status: ${permissions[type]}`);
    setIsRequesting(type);

    // 特殊处理：睡眠模式免打扰（仅 iOS）
    // 由于 iOS 无法检测是否真的配置了，所以：
    // 1. 始终可点击打开教程
    // 2. 点击后标记为"已看过"（用于隐藏红点），但不标记为 granted
    if (type === 'sleepFocus') {
      if (isIOSWebView()) {
        // 打开睡眠模式设置引导
        iOSBridge.openSleepFocusSettings();
        // 标记用户已看过教程（用于隐藏红点）
        localStorage.setItem(SLEEP_FOCUS_CONFIGURED_KEY, 'true');
        setSleepFocusSeen(true);
        // 注意：不设置为 granted，保持 prompt 状态让按钮始终可点击
      }
      setIsRequesting(null);
      return;
    }

    // If permission was denied, open app settings instead of requesting again
    // On iOS and Android, once denied, the system won't show the permission dialog again
    if (permissions[type] === 'denied') {
      console.log(`[PermissionsSection] Permission ${type} was denied, opening app settings`);
      openAppSettings();
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

    // Web browser
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
   * Request all permissions at once
   */
  const requestAllPermissions = useCallback(async () => {
    setIsRequesting('all');

    const typesToRequest: PermissionType[] = [];
    if (permissions.notification !== 'granted') typesToRequest.push('notification');
    if (permissions.microphone !== 'granted') typesToRequest.push('microphone');
    if (permissions.camera !== 'granted') typesToRequest.push('camera');
    // 睡眠模式仅在 iOS 上需要请求，且只有在用户未看过教程时才请求
    if (isIOSWebView() && !sleepFocusSeen) typesToRequest.push('sleepFocus');

    for (const type of typesToRequest) {
      await requestPermission(type);
      // Small delay between requests for better UX
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setIsRequesting(null);
  }, [permissions, requestPermission]);

  // 计算权限数量
  // 注意：sleepFocus 不参与计数，因为 iOS 无法检测是否真的授权
  // sleepFocus 只影响红点显示（用户是否看过教程）
  const isIOS = isIOSWebView();
  const totalPermissions = 3; // 只计算可检测的权限：notification, microphone, camera
  const permissionsToCount = [permissions.notification, permissions.microphone, permissions.camera];
  const grantedCount = permissionsToCount.filter(s => s === 'granted').length;
  const allGranted = grantedCount === totalPermissions;

  // iOS 上如果睡眠模式教程未看过，也算有缺失权限（用于显示红点）
  // 使用 state 而非直接读取 localStorage，这样点击后能触发重新渲染
  const hasSleepFocusMissing = isIOS && !sleepFocusSeen;

  const getStatusIcon = (status: PermissionStatus) => {
    switch (status) {
      case 'granted':
        return <i className="fa-solid fa-check text-green-500"></i>;
      case 'denied':
        return <i className="fa-solid fa-xmark text-red-500"></i>;
      default:
        return <i className="fa-solid fa-circle-question text-gray-400"></i>;
    }
  };

  const getStatusText = (status: PermissionStatus) => {
    switch (status) {
      case 'granted':
        return t('profile.permissions.enabled');
      case 'denied':
        return t('profile.permissions.denied');
      default:
        return t('profile.permissions.notSet');
    }
  };

  // 权限项列表（睡眠模式仅在 iOS 上显示）
  const permissionItems = [
    {
      type: 'microphone' as PermissionType,
      icon: 'fa-microphone',
      iconBg: 'bg-green-50',
      iconColor: 'text-green-500',
      title: t('profile.permissions.microphone'),
      description: t('profile.permissions.microphoneDesc'),
    },
    {
      type: 'camera' as PermissionType,
      icon: 'fa-video',
      iconBg: 'bg-purple-50',
      iconColor: 'text-purple-500',
      title: t('profile.permissions.camera'),
      description: t('profile.permissions.cameraDesc'),
    },
    {
      type: 'notification' as PermissionType,
      icon: 'fa-bell',
      iconBg: 'bg-blue-50',
      iconColor: 'text-blue-500',
      title: t('profile.permissions.notifications'),
      description: t('profile.permissions.notificationsDesc'),
    },
    // 睡眠模式免打扰（仅 iOS）
    ...(isIOS ? [{
      type: 'sleepFocus' as PermissionType,
      icon: 'fa-moon',
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-500',
      title: t('profile.permissions.sleepFocus'),
      description: t('profile.permissions.sleepFocusDesc'),
    }] : []),
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
      {/* Main Row - Clickable to expand */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-50 rounded-full flex items-center justify-center">
            <i className="fa-solid fa-shield-halved text-brand-orange"></i>
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">{t('profile.permissions.title')}</p>
            <p className="text-xs text-gray-400">{t('profile.permissions.subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* 只有当所有基础权限都授权且没有睡眠模式缺失提醒时，才显示"全部已开启" */}
          {allGranted && !hasSleepFocusMissing ? (
            <span className="text-xs text-green-500 flex items-center gap-1">
              <i className="fa-solid fa-circle-check"></i>
              {t('profile.permissions.allEnabled')}
            </span>
          ) : (
            <span className="text-xs text-amber-500 flex items-center gap-1">
              <i className="fa-solid fa-triangle-exclamation"></i>
              {grantedCount}/{totalPermissions}
            </span>
          )}
          <i className={`fa-solid fa-chevron-right text-gray-300 text-sm transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}></i>
        </div>
      </button>

      {/* Expandable Content */}
      <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'}`}>
        {/* Divider */}
        <div className="border-t border-gray-100"></div>

        {/* Permission Items */}
        {permissionItems.map((item, index) => {
          const isSleepFocus = item.type === 'sleepFocus';
          // sleepFocus 始终可点击（打开教程），其他权限在已授权时禁用
          const isDisabled = isRequesting !== null || (!isSleepFocus && permissions[item.type] === 'granted');

          return (
            <button
              key={item.type}
              onClick={(e) => {
                e.stopPropagation();
                requestPermission(item.type);
              }}
              disabled={isDisabled}
              className={`w-full flex items-center justify-between p-4 pl-6 hover:bg-gray-50 active:bg-gray-100 transition-colors disabled:hover:bg-white
                ${index < permissionItems.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 ${item.iconBg} rounded-full flex items-center justify-center`}>
                  <i className={`fa-solid ${item.icon} ${item.iconColor} text-sm`}></i>
                </div>
                <div className="text-left">
                  <p className="font-medium text-gray-700 text-sm">{item.title}</p>
                  <p className="text-xs text-gray-400">{item.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isRequesting === item.type ? (
                  <i className="fa-solid fa-spinner fa-spin text-gray-400"></i>
                ) : isSleepFocus ? (
                  // sleepFocus 显示"查看教程"和右箭头
                  <>
                    <span className="text-xs text-indigo-500">
                      {t('profile.permissions.sleepFocusAction')}
                    </span>
                    <i className="fa-solid fa-chevron-right text-gray-300 text-sm"></i>
                  </>
                ) : (
                  // 其他权限显示状态
                  <>
                    <span className={`text-xs ${permissions[item.type] === 'granted' ? 'text-green-500' : permissions[item.type] === 'denied' ? 'text-red-500' : 'text-gray-400'}`}>
                      {getStatusText(permissions[item.type])}
                    </span>
                    {getStatusIcon(permissions[item.type])}
                  </>
                )}
              </div>
            </button>
          );
        })}

        {/* Sleep Focus Special Warning - Only show when user hasn't seen the guide on iOS */}
        {hasSleepFocusMissing && (
          <div className="px-4 py-3 bg-indigo-50 border-t border-indigo-100">
            <div className="flex items-start gap-2">
              <i className="fa-solid fa-moon text-indigo-500 mt-0.5 text-xs"></i>
              <p className="text-xs text-indigo-700">
                {t('profile.permissions.sleepFocusLong')}
              </p>
            </div>
          </div>
        )}

        {/* Warning Message */}
        {!allGranted && (
          <div className="px-4 py-3 bg-amber-50 border-t border-amber-100">
            <div className="flex items-start gap-2">
              <i className="fa-solid fa-triangle-exclamation text-amber-500 mt-0.5 text-xs"></i>
              <p className="text-xs text-amber-700">
                {t('profile.permissions.warning')}
              </p>
            </div>
          </div>
        )}

        {/* Request All Button */}
        {!allGranted && (
          <div className="p-4 border-t border-gray-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                requestAllPermissions();
              }}
              disabled={isRequesting !== null}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-brand-blue to-blue-500 text-white font-medium rounded-xl shadow-sm hover:shadow-md active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
            >
              {isRequesting === 'all' ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin"></i>
                  <span>{t('profile.permissions.requesting')}</span>
                </>
              ) : (
                <>
                  <i className="fa-solid fa-unlock"></i>
                  <span>{t('profile.permissions.enableAll')}</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* All Granted Message */}
        {allGranted && (
          <div className="px-4 py-3 bg-green-50 border-t border-green-100">
            <div className="flex items-center gap-2">
              <i className="fa-solid fa-circle-check text-green-500 text-xs"></i>
              <p className="text-xs text-green-700">
                {t('profile.permissions.allEnabledMessage')}
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
