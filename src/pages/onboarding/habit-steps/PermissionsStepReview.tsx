import { useState, useCallback, useEffect, useRef } from 'react';
import { Phone, Mic, Camera, AlertCircle } from 'lucide-react';

/**
 * Apple App Store Review Version - Permissions Step
 *
 * This version complies with Apple's Guideline 5.1.1:
 * - Button text uses "Continue" instead of "Allow Camera/Microphone"
 * - No "Skip" buttons
 * - System permission dialog appears immediately after tapping "Continue"
 * - English only
 *
 * DO NOT DELETE - This file is required for App Store review submissions.
 * After approval, switch back to the original PermissionsStep.tsx via APPLE_REVIEW_MODE flag.
 */

// AndroidBridge interface is declared in src/context/AuthContext.tsx

interface PermissionsStepReviewProps {
  onNext: () => void;
}

type PermissionType = 'notification' | 'microphone' | 'camera';
type PermissionStatus = 'pending' | 'granted' | 'denied';

/**
 * Check if running in Android WebView
 */
function isAndroidWebView(): boolean {
  return !!(window.AndroidBridge?.isAndroid?.());
}

/**
 * Check if running in iOS WebView (WKWebView)
 */
function isIOSWebView(): boolean {
  return !!(window.webkit?.messageHandlers?.nativeApp);
}

/**
 * iOS Bridge - sends messages to native iOS app via WKWebView
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
};

/**
 * Step 5: Permissions (Apple Review Version)
 * Request notification, microphone, and camera permissions one by one
 * No skip option - user must grant or deny each permission via system dialog
 */
export function PermissionsStepReview({ onNext }: PermissionsStepReviewProps) {
  const [subStep, setSubStep] = useState<1 | 2 | 3>(1);
  const [isRequesting, setIsRequesting] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<Record<PermissionType, PermissionStatus>>({
    notification: 'pending',
    microphone: 'pending',
    camera: 'pending',
  });

  // Keep track of which permission we're waiting for
  const pendingPermissionRef = useRef<PermissionType | null>(null);

  // Check initial permission status on mount
  useEffect(() => {
    const checkInitialPermissions = async () => {
      if (isAndroidWebView()) {
        if (window.AndroidBridge?.hasNotificationPermission?.()) {
          setPermissionStatus(prev => ({ ...prev, notification: 'granted' }));
        }
        if (window.AndroidBridge?.hasMicrophonePermission?.()) {
          setPermissionStatus(prev => ({ ...prev, microphone: 'granted' }));
        }
        if (window.AndroidBridge?.hasCameraPermission?.()) {
          setPermissionStatus(prev => ({ ...prev, camera: 'granted' }));
        }
      } else if (isIOSWebView()) {
        // iOS will respond via events
        iOSBridge.hasNotificationPermission();
        iOSBridge.hasMicrophonePermission();
        iOSBridge.hasCameraPermission();
      } else {
        // Web browser
        if ('Notification' in window && Notification.permission === 'granted') {
          setPermissionStatus(prev => ({ ...prev, notification: 'granted' }));
        }
        if ('permissions' in navigator) {
          try {
            const micResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            if (micResult.state === 'granted') {
              setPermissionStatus(prev => ({ ...prev, microphone: 'granted' }));
            }
          } catch { /* ignore */ }
          try {
            const camResult = await navigator.permissions.query({ name: 'camera' as PermissionName });
            if (camResult.state === 'granted') {
              setPermissionStatus(prev => ({ ...prev, camera: 'granted' }));
            }
          } catch { /* ignore */ }
        }
      }
    };
    checkInitialPermissions();
  }, []);

  // Listen for native permission results (Android and iOS)
  useEffect(() => {
    if (!isAndroidWebView() && !isIOSWebView()) return;

    const handlePermissionResult = (event: CustomEvent<{ type: PermissionType; granted: boolean }>) => {
      const { type, granted } = event.detail;
      console.log(`[PermissionsStepReview] Native permission result: ${type} = ${granted}`);

      // Only handle if this is the permission we're waiting for
      if (pendingPermissionRef.current !== type) return;

      pendingPermissionRef.current = null;
      setIsRequesting(false);

      if (granted) {
        setPermissionStatus(prev => ({ ...prev, [type]: 'granted' }));
      } else {
        setPermissionStatus(prev => ({ ...prev, [type]: 'denied' }));
      }

      // Always move to next step after system dialog (granted or denied)
      if (type === 'notification') {
        setSubStep(2);
      } else if (type === 'microphone') {
        setSubStep(3);
      } else if (type === 'camera') {
        onNext();
      }
    };

    window.addEventListener('permissionResult', handlePermissionResult as EventListener);
    return () => {
      window.removeEventListener('permissionResult', handlePermissionResult as EventListener);
    };
  }, [onNext]);

  // Request notification permission
  const requestNotification = useCallback(async () => {
    setIsRequesting(true);

    if (isAndroidWebView()) {
      if (window.AndroidBridge?.hasNotificationPermission?.()) {
        setPermissionStatus(prev => ({ ...prev, notification: 'granted' }));
        setSubStep(2);
        setIsRequesting(false);
        return;
      }
      pendingPermissionRef.current = 'notification';
      window.AndroidBridge?.requestNotificationPermission?.();
      return;
    }

    if (isIOSWebView()) {
      pendingPermissionRef.current = 'notification';
      iOSBridge.requestNotificationPermission();
      return;
    }

    // Web browser flow
    try {
      if ('Notification' in window) {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
          setPermissionStatus(prev => ({ ...prev, notification: 'granted' }));
        } else {
          setPermissionStatus(prev => ({ ...prev, notification: 'denied' }));
        }
      }
      // Always proceed after system dialog
      setSubStep(2);
    } finally {
      setIsRequesting(false);
    }
  }, []);

  // Request microphone permission
  const requestMicrophone = useCallback(async () => {
    setIsRequesting(true);

    if (isAndroidWebView()) {
      if (window.AndroidBridge?.hasMicrophonePermission?.()) {
        setPermissionStatus(prev => ({ ...prev, microphone: 'granted' }));
        setSubStep(3);
        setIsRequesting(false);
        return;
      }
      pendingPermissionRef.current = 'microphone';
      window.AndroidBridge?.requestMicrophonePermission?.();
      return;
    }

    if (isIOSWebView()) {
      pendingPermissionRef.current = 'microphone';
      iOSBridge.requestMicrophonePermission();
      return;
    }

    // Web browser flow
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus(prev => ({ ...prev, microphone: 'granted' }));
    } catch {
      setPermissionStatus(prev => ({ ...prev, microphone: 'denied' }));
    } finally {
      // Always proceed after system dialog
      setSubStep(3);
      setIsRequesting(false);
    }
  }, []);

  // Request camera permission
  const requestCamera = useCallback(async () => {
    setIsRequesting(true);

    if (isAndroidWebView()) {
      if (window.AndroidBridge?.hasCameraPermission?.()) {
        setPermissionStatus(prev => ({ ...prev, camera: 'granted' }));
        onNext();
        setIsRequesting(false);
        return;
      }
      pendingPermissionRef.current = 'camera';
      window.AndroidBridge?.requestCameraPermission?.();
      return;
    }

    if (isIOSWebView()) {
      pendingPermissionRef.current = 'camera';
      iOSBridge.requestCameraPermission();
      return;
    }

    // Web browser flow
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus(prev => ({ ...prev, camera: 'granted' }));
    } catch {
      setPermissionStatus(prev => ({ ...prev, camera: 'denied' }));
    } finally {
      // Always proceed after system dialog
      onNext();
      setIsRequesting(false);
    }
  }, [onNext]);

  // Handle continue button - if already granted, go to next; otherwise request permission
  const handleContinue = useCallback((permission: PermissionType) => {
    const isGranted = permissionStatus[permission] === 'granted';

    if (permission === 'notification') {
      if (isGranted) {
        setSubStep(2);
      } else {
        requestNotification();
      }
    } else if (permission === 'microphone') {
      if (isGranted) {
        setSubStep(3);
      } else {
        requestMicrophone();
      }
    } else if (permission === 'camera') {
      if (isGranted) {
        onNext();
      } else {
        requestCamera();
      }
    }
  }, [permissionStatus, requestNotification, requestMicrophone, requestCamera, onNext]);

  // Sub-step 1: Notification
  if (subStep === 1) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        {/* Icon */}
        <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center mb-8">
          <Phone className="w-12 h-12 text-blue-600" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Stay Connected
        </h1>

        {/* Description */}
        <p className="text-gray-600 text-lg leading-relaxed max-w-sm">
          Receive reminders for your scheduled calls with your AI coach.
        </p>

        {/* Status indicator */}
        {permissionStatus.notification === 'granted' && (
          <p className="text-green-500 text-sm font-medium mt-2 flex items-center gap-1">
            <i className="fa-solid fa-circle-check"></i>
            Already enabled
          </p>
        )}

        <div className="mb-8"></div>

        {/* Denied message */}
        {permissionStatus.notification === 'denied' && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl mb-6">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">
              Please enable notifications in Settings to receive call reminders.
            </p>
          </div>
        )}

        {/* Action button - Always "Continue" */}
        <div className="w-full mt-auto mb-4">
          <button
            onClick={() => handleContinue('notification')}
            disabled={isRequesting}
            className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                       text-white text-lg font-medium rounded-full
                       transition-colors shadow-md disabled:opacity-50"
          >
            {isRequesting ? 'Requesting...' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  // Sub-step 2: Microphone
  if (subStep === 2) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
        {/* Icon */}
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-8">
          <Mic className="w-12 h-12 text-green-600" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          Voice Conversations
        </h1>

        {/* Description */}
        <p className="text-gray-600 text-lg leading-relaxed max-w-sm">
          Talk with your AI coach using your voice for a more natural experience.
        </p>

        {/* Status indicator */}
        {permissionStatus.microphone === 'granted' && (
          <p className="text-green-500 text-sm font-medium mt-2 flex items-center gap-1">
            <i className="fa-solid fa-circle-check"></i>
            Already enabled
          </p>
        )}

        <div className="mb-8"></div>

        {/* Denied message */}
        {permissionStatus.microphone === 'denied' && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl mb-6">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">
              Please enable microphone in Settings to have voice conversations.
            </p>
          </div>
        )}

        {/* Action button - Always "Continue" */}
        <div className="w-full mt-auto mb-4">
          <button
            onClick={() => handleContinue('microphone')}
            disabled={isRequesting}
            className="w-full py-4 px-8 bg-green-600 hover:bg-green-700
                       text-white text-lg font-medium rounded-full
                       transition-colors shadow-md disabled:opacity-50"
          >
            {isRequesting ? 'Requesting...' : 'Continue'}
          </button>
        </div>
      </div>
    );
  }

  // Sub-step 3: Camera
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
      {/* Icon */}
      <div className="w-24 h-24 bg-purple-100 rounded-full flex items-center justify-center mb-8">
        <Camera className="w-12 h-12 text-purple-600" />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-900 mb-4">
        Video Calls
      </h1>

      {/* Description */}
      <p className="text-gray-600 text-lg leading-relaxed max-w-sm">
        Enable video to have face-to-face conversations with your AI coach.
      </p>

      {/* Status indicator */}
      {permissionStatus.camera === 'granted' && (
        <p className="text-green-500 text-sm font-medium mt-2 flex items-center gap-1">
          <i className="fa-solid fa-circle-check"></i>
          Already enabled
        </p>
      )}

      <div className="mb-8"></div>

      {/* Denied message */}
      {permissionStatus.camera === 'denied' && (
        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl mb-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">
            Please enable camera in Settings to have video calls.
          </p>
        </div>
      )}

      {/* Action button - Always "Continue" */}
      <div className="w-full mt-auto mb-4">
        <button
          onClick={() => handleContinue('camera')}
          disabled={isRequesting}
          className="w-full py-4 px-8 bg-purple-600 hover:bg-purple-700
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md disabled:opacity-50"
        >
          {isRequesting ? 'Requesting...' : 'Continue'}
        </button>
      </div>
    </div>
  );
}
