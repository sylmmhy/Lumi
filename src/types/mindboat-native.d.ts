/**
 * mindboat-native.d.ts - 全局类型声明
 *
 * 扩展 Window 和 DocumentEventMap 接口，
 * 为 iOS/Android WebView 桥接和自定义事件提供类型支持。
 */

declare global {
  interface Window {
    MindBoatNativeAuth?: import('../context/AuthContextDefinition').NativeAuthPayload;
    __MindBoatAuthReady?: boolean;
    refreshTasks?: () => void;
    AndroidBridge?: {
      // Permission-related methods (from PermissionsStep)
      isAndroid?: () => boolean;
      hasNotificationPermission?: () => boolean;
      hasMicrophonePermission?: () => boolean;
      hasCameraPermission?: () => boolean;
      requestNotificationPermission?: () => void;
      requestMicrophonePermission?: () => void;
      requestCameraPermission?: () => void;
      openAppSettings?: () => void;
      // Task-related methods
      onTaskCreated?: (taskJson: string) => void;
      cancelTaskReminder?: (taskId: string) => void;
      logMessage?: (message: string) => void;
      // Onboarding-related methods
      onOnboardingCompleted?: () => void;
      // Auth-related methods
      logout?: () => void;
      triggerGoogleSignIn?: () => void;
      isLoggedIn?: () => boolean;
      getUserInfo?: () => string;
      getIdToken?: () => string;
      // FCM Token 上传相关
      getFcmToken?: () => string;
      uploadFcmToken?: () => void;
      // Ringtone settings
      setRingtoneType?: (type: string) => void;
      getRingtoneType?: () => string;
      onWebLoginSuccess?: (
        accessToken: string,
        refreshToken: string,
        userId: string,
        email: string,
        displayName: string
      ) => void;
    };
    webkit?: {
      messageHandlers?: {
        userLogin?: { postMessage: (message: unknown) => void };
        userLogout?: { postMessage: (message: unknown) => void };
        authConfirmed?: { postMessage: (message: { success: boolean; reason: string }) => void };
        requestNativeAuth?: { postMessage: (message: Record<string, never>) => void };
        taskChanged?: { postMessage: (message: unknown) => void };
        nativeApp?: { postMessage: (message: unknown) => void };
        // Permission-related handlers (iOS WebView)
        requestNotificationPermission?: { postMessage: (message: unknown) => void };
        requestMicrophonePermission?: { postMessage: (message: unknown) => void };
        requestCameraPermission?: { postMessage: (message: unknown) => void };
        hasNotificationPermission?: { postMessage: (message: unknown) => void };
        hasMicrophonePermission?: { postMessage: (message: unknown) => void };
        hasCameraPermission?: { postMessage: (message: unknown) => void };
        openAppSettings?: { postMessage: (message: unknown) => void };
        openSleepFocusSettings?: { postMessage: (message: unknown) => void };
        // Onboarding-related handlers (iOS WebView)
        onboardingCompleted?: { postMessage: (message: Record<string, never>) => void };
        // Ringtone settings
        setRingtoneType?: { postMessage: (message: { type: string }) => void };
        // Screen Time handler
        screenTime?: { postMessage: (message: unknown) => void };
        // CallKit 诊断 handler（Web → iOS 强制结束 CallKit 通话）
        forceEndCallKit?: { postMessage: (message: { reason: string }) => void };
        // HomeKit handlers
        isHomeKitAvailable?: { postMessage: (message: unknown) => void };
        requestHomeKitAccess?: { postMessage: (message: unknown) => void };
        getHomeKitDevices?: { postMessage: (message: unknown) => void };
        getHomeKitLights?: { postMessage: (message: unknown) => void };
        controlHomeKitLight?: { postMessage: (message: unknown) => void };
        getHomeKitScenes?: { postMessage: (message: unknown) => void };
        executeHomeKitScene?: { postMessage: (message: unknown) => void };
        // Sleep Music handlers
        playSleepMusic?: { postMessage: (message: unknown) => void };
        stopSleepMusic?: { postMessage: (message: unknown) => void };
        setSleepMusicVolume?: { postMessage: (message: unknown) => void };
        showAirPlayPicker?: { postMessage: (message: unknown) => void };
        getSleepMusicState?: { postMessage: (message: unknown) => void };
        getSleepMusicTracks?: { postMessage: (message: unknown) => void };
      };
    };
  }

  interface WindowEventMap {
    'callKitDiagnostic': CustomEvent<Record<string, unknown>>;
  }

  interface DocumentEventMap {
    'mindboat:nativeLogin': CustomEvent<import('../context/AuthContextDefinition').NativeAuthPayload>;
    'mindboat:nativeLogout': CustomEvent<void>;
    'mindboat:taskCreated': CustomEvent<{ task: unknown }>;
    'mindboat:taskDeleted': CustomEvent<{ taskId: string }>;
  }
}

export {};
