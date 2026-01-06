import { useState, useCallback } from 'react';
import { Bell, Mic, Camera, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from '../../../hooks/useTranslation';

interface PermissionsStepProps {
  onNext: () => void;
}

type PermissionStatus = 'pending' | 'granted' | 'denied';

interface PermissionState {
  notification: PermissionStatus;
  microphone: PermissionStatus;
  camera: PermissionStatus;
}

/**
 * Step 5: Permissions
 * Request notification, microphone, and camera permissions
 */
export function PermissionsStep({ onNext }: PermissionsStepProps) {
  const { t } = useTranslation();
  const [permissions, setPermissions] = useState<PermissionState>({
    notification: 'pending',
    microphone: 'pending',
    camera: 'pending',
  });
  const [isRequesting, setIsRequesting] = useState(false);

  // Request all permissions
  const requestPermissions = useCallback(async () => {
    setIsRequesting(true);

    try {
      // 1. Request notification permission
      if ('Notification' in window) {
        const notifResult = await Notification.requestPermission();
        setPermissions(prev => ({
          ...prev,
          notification: notifResult === 'granted' ? 'granted' : 'denied',
        }));
      }

      // 2. Request microphone and camera permissions
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        // Stop all tracks immediately after getting permission
        stream.getTracks().forEach(track => track.stop());

        setPermissions(prev => ({
          ...prev,
          microphone: 'granted',
          camera: 'granted',
        }));
      } catch {
        // Try microphone only
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioStream.getTracks().forEach(track => track.stop());
          setPermissions(prev => ({ ...prev, microphone: 'granted' }));
        } catch {
          setPermissions(prev => ({ ...prev, microphone: 'denied' }));
        }

        // Try camera only
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          videoStream.getTracks().forEach(track => track.stop());
          setPermissions(prev => ({ ...prev, camera: 'granted' }));
        } catch {
          setPermissions(prev => ({ ...prev, camera: 'denied' }));
        }
      }
    } finally {
      setIsRequesting(false);
    }
  }, []);

  const allGranted =
    permissions.notification === 'granted' &&
    permissions.microphone === 'granted' &&
    permissions.camera === 'granted';

  const anyRequested =
    permissions.notification !== 'pending' ||
    permissions.microphone !== 'pending' ||
    permissions.camera !== 'pending';

  const getStatusIcon = (status: PermissionStatus) => {
    switch (status) {
      case 'granted':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'denied':
        return <AlertCircle className="w-5 h-5 text-amber-500" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-gray-300" />;
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {t('habitOnboarding.permissions.title')}
        </h1>
        <p className="text-gray-600 text-base leading-relaxed">
          {t('habitOnboarding.permissions.description')}
        </p>
      </div>

      {/* Permission items */}
      <div className="w-full max-w-sm space-y-4 mb-8">
        {/* Notification */}
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
          <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Bell className="w-6 h-6 text-blue-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-gray-900">{t('habitOnboarding.permissions.notifications')}</p>
            <p className="text-sm text-gray-500">{t('habitOnboarding.permissions.notificationsHint')}</p>
          </div>
          {getStatusIcon(permissions.notification)}
        </div>

        {/* Microphone */}
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Mic className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-gray-900">{t('habitOnboarding.permissions.microphone')}</p>
            <p className="text-sm text-gray-500">{t('habitOnboarding.permissions.microphoneHint')}</p>
          </div>
          {getStatusIcon(permissions.microphone)}
        </div>

        {/* Camera */}
        <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
          <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
            <Camera className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="font-medium text-gray-900">{t('habitOnboarding.permissions.camera')}</p>
            <p className="text-sm text-gray-500">{t('habitOnboarding.permissions.cameraHint')}</p>
          </div>
          {getStatusIcon(permissions.camera)}
        </div>
      </div>

      {/* Action buttons */}
      <div className="w-full mt-auto mb-4 space-y-3">
        {!anyRequested ? (
          <button
            onClick={requestPermissions}
            disabled={isRequesting}
            className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                       text-white text-lg font-medium rounded-full
                       transition-colors shadow-md disabled:opacity-50"
          >
            {isRequesting ? t('habitOnboarding.permissions.requesting') : t('habitOnboarding.permissions.allow')}
          </button>
        ) : (
          <button
            onClick={onNext}
            className="w-full py-4 px-8 bg-blue-600 hover:bg-blue-700
                       text-white text-lg font-medium rounded-full
                       transition-colors shadow-md"
          >
            {allGranted ? t('habitOnboarding.permissions.continue') : t('habitOnboarding.permissions.continueAnyway')}
          </button>
        )}

        {!anyRequested && (
          <button
            onClick={onNext}
            className="w-full py-3 text-gray-500 text-base font-medium"
          >
            {t('habitOnboarding.permissions.skip')}
          </button>
        )}
      </div>
    </div>
  );
}
