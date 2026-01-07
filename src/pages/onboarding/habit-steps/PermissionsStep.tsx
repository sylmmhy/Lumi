import { useState, useCallback, useEffect, useRef } from 'react';
import { Phone, Mic, Camera, AlertCircle } from 'lucide-react';
import { useTranslation } from '../../../hooks/useTranslation';

// AndroidBridge interface is declared in src/context/AuthContext.tsx

interface PermissionsStepProps {
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
 * iOS WebView uses webkit.messageHandlers for communication
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
 * Step 5: Permissions (3 sub-steps)
 * Request notification, microphone, and camera permissions one by one
 */
export function PermissionsStep({ onNext }: PermissionsStepProps) {
  const { t } = useTranslation();
  const [subStep, setSubStep] = useState<1 | 2 | 3>(1);
  const [isRequesting, setIsRequesting] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState<Record<PermissionType, PermissionStatus>>({
    notification: 'pending',
    microphone: 'pending',
    camera: 'pending',
  });

  // Keep track of which permission we're waiting for
  const pendingPermissionRef = useRef<PermissionType | null>(null);

  // Listen for native permission results (Android and iOS)
  useEffect(() => {
    // This listener works for both Android and iOS WebViews
    // Android uses window.dispatchEvent from AndroidBridge
    // iOS uses window.dispatchEvent from WKWebView's evaluateJavaScript
    if (!isAndroidWebView() && !isIOSWebView()) return;

    const handlePermissionResult = (event: CustomEvent<{ type: PermissionType; granted: boolean }>) => {
      const { type, granted } = event.detail;
      console.log(`[PermissionsStep] Native permission result: ${type} = ${granted}`);

      // Only handle if this is the permission we're waiting for
      if (pendingPermissionRef.current !== type) return;

      pendingPermissionRef.current = null;
      setIsRequesting(false);

      if (granted) {
        setPermissionStatus(prev => ({ ...prev, [type]: 'granted' }));
        // Move to next step
        if (type === 'notification') {
          setSubStep(2);
        } else if (type === 'microphone') {
          setSubStep(3);
        } else if (type === 'camera') {
          onNext();
        }
      } else {
        setPermissionStatus(prev => ({ ...prev, [type]: 'denied' }));
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

    // If in Android WebView, use native permission request
    if (isAndroidWebView()) {
      // Check if already granted
      if (window.AndroidBridge?.hasNotificationPermission?.()) {
        setPermissionStatus(prev => ({ ...prev, notification: 'granted' }));
        setSubStep(2);
        setIsRequesting(false);
        return;
      }
      // Request from Android
      pendingPermissionRef.current = 'notification';
      window.AndroidBridge?.requestNotificationPermission?.();
      return;
    }

    // If in iOS WebView, use native permission request
    if (isIOSWebView()) {
      // Request from iOS - result will come via permissionResult event
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
          setSubStep(2);
        } else {
          setPermissionStatus(prev => ({ ...prev, notification: 'denied' }));
        }
      } else {
        // Notification not supported, skip to next
        setSubStep(2);
      }
    } finally {
      setIsRequesting(false);
    }
  }, []);

  // Request microphone permission
  const requestMicrophone = useCallback(async () => {
    setIsRequesting(true);

    // If in Android WebView, use native permission request
    if (isAndroidWebView()) {
      // Check if already granted
      if (window.AndroidBridge?.hasMicrophonePermission?.()) {
        setPermissionStatus(prev => ({ ...prev, microphone: 'granted' }));
        setSubStep(3);
        setIsRequesting(false);
        return;
      }
      // Request from Android
      pendingPermissionRef.current = 'microphone';
      window.AndroidBridge?.requestMicrophonePermission?.();
      return;
    }

    // If in iOS WebView, use native permission request
    if (isIOSWebView()) {
      // Request from iOS - result will come via permissionResult event
      pendingPermissionRef.current = 'microphone';
      iOSBridge.requestMicrophonePermission();
      return;
    }

    // Web browser flow
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus(prev => ({ ...prev, microphone: 'granted' }));
      setSubStep(3);
    } catch {
      setPermissionStatus(prev => ({ ...prev, microphone: 'denied' }));
    } finally {
      setIsRequesting(false);
    }
  }, []);

  // Request camera permission
  const requestCamera = useCallback(async () => {
    setIsRequesting(true);

    // If in Android WebView, use native permission request
    if (isAndroidWebView()) {
      // Check if already granted
      if (window.AndroidBridge?.hasCameraPermission?.()) {
        setPermissionStatus(prev => ({ ...prev, camera: 'granted' }));
        onNext();
        setIsRequesting(false);
        return;
      }
      // Request from Android
      pendingPermissionRef.current = 'camera';
      window.AndroidBridge?.requestCameraPermission?.();
      return;
    }

    // If in iOS WebView, use native permission request
    if (isIOSWebView()) {
      // Request from iOS - result will come via permissionResult event
      pendingPermissionRef.current = 'camera';
      iOSBridge.requestCameraPermission();
      return;
    }

    // Web browser flow
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(track => track.stop());
      setPermissionStatus(prev => ({ ...prev, camera: 'granted' }));
      // All done, go to next step
      onNext();
    } catch {
      setPermissionStatus(prev => ({ ...prev, camera: 'denied' }));
    } finally {
      setIsRequesting(false);
    }
  }, [onNext]);

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
          {t('permissions.notification.title')}
        </h1>

        {/* Description */}
        <p className="text-gray-600 text-lg leading-relaxed mb-8 max-w-sm">
          {t('permissions.notification.description')}
        </p>

        {/* Denied message */}
        {permissionStatus.notification === 'denied' && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl mb-6">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">
              {t('permissions.notification.denied')}
            </p>
          </div>
        )}

        {/* Action button */}
        <div className="w-full mt-auto mb-4">
          <button
            onClick={requestNotification}
            disabled={isRequesting}
            className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                       text-white text-lg font-medium rounded-full
                       transition-colors shadow-md disabled:opacity-50"
          >
            {isRequesting ? t('permissions.requesting') : t('permissions.notification.button')}
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
          {t('permissions.microphone.title')}
        </h1>

        {/* Description */}
        <p className="text-gray-600 text-lg leading-relaxed mb-8 max-w-sm">
          {t('permissions.microphone.description')}
        </p>

        {/* Denied message */}
        {permissionStatus.microphone === 'denied' && (
          <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl mb-6">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">
              {t('permissions.microphone.denied')}
            </p>
          </div>
        )}

        {/* Action button */}
        <div className="w-full mt-auto mb-4">
          <button
            onClick={requestMicrophone}
            disabled={isRequesting}
            className="w-full py-4 px-8 bg-green-600 hover:bg-green-700
                       text-white text-lg font-medium rounded-full
                       transition-colors shadow-md disabled:opacity-50"
          >
            {isRequesting ? t('permissions.requesting') : t('permissions.microphone.button')}
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
        {t('permissions.camera.title')}
      </h1>

      {/* Description */}
      <p className="text-gray-600 text-lg leading-relaxed mb-8 max-w-sm">
        {t('permissions.camera.description')}
      </p>

      {/* Denied message */}
      {permissionStatus.camera === 'denied' && (
        <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-3 rounded-xl mb-6">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">
            {t('permissions.camera.denied')}
          </p>
        </div>
      )}

      {/* Action button */}
      <div className="w-full mt-auto mb-4">
        <button
          onClick={requestCamera}
          disabled={isRequesting}
          className="w-full py-4 px-8 bg-purple-600 hover:bg-purple-700
                     text-white text-lg font-medium rounded-full
                     transition-colors shadow-md disabled:opacity-50"
        >
          {isRequesting ? t('permissions.requesting') : t('permissions.camera.button')}
        </button>
      </div>
    </div>
  );
}
