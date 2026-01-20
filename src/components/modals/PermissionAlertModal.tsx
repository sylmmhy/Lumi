/**
 * PermissionAlertModal - 权限提示弹窗
 *
 * 当用户点击导航栏的红点提示时显示
 * 用户可以逐个开启权限，点击后直接弹出系统授权弹窗
 */

import React, { useEffect } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { usePermission } from '../../hooks/usePermission';
import type { PermissionType } from '../../context/PermissionContextDefinition';

interface PermissionAlertModalProps {
  /** 是否显示弹窗 */
  isOpen: boolean;
  /** 关闭弹窗的回调 */
  onClose: () => void;
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
 * 权限信息配置
 * 使用已有的翻译 key（profile.permissions.*）
 */
const PERMISSION_INFO: Record<PermissionType, {
  icon: string;
  iconBg: string;
  iconColor: string;
  titleKey: string;
  descKey: string;
}> = {
  microphone: {
    icon: 'fa-microphone',
    iconBg: 'bg-green-50',
    iconColor: 'text-green-500',
    titleKey: 'profile.permissions.microphone',
    descKey: 'profile.permissions.microphoneDesc',
  },
  camera: {
    icon: 'fa-video',
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    titleKey: 'profile.permissions.camera',
    descKey: 'profile.permissions.cameraDesc',
  },
  notification: {
    icon: 'fa-bell',
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
    titleKey: 'profile.permissions.notifications',
    descKey: 'profile.permissions.notificationsDesc',
  },
  sleepFocus: {
    icon: 'fa-moon',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-500',
    titleKey: 'profile.permissions.sleepFocus',
    descKey: 'profile.permissions.sleepFocusDesc',
  },
};

/** 获取权限列表顺序（sleepFocus 仅在 iOS 上显示） */
function getPermissionOrder(): PermissionType[] {
  const baseOrder: PermissionType[] = ['microphone', 'camera', 'notification'];
  if (isIOSWebView()) {
    baseOrder.push('sleepFocus');
  }
  return baseOrder;
}

/**
 * 权限提示弹窗组件
 *
 * 显示所有权限，用户可以逐个开启：
 * 1. 点击"开启"按钮 → 弹出系统授权弹窗
 * 2. 如果权限被拒绝 → 点击"去设置"打开系统设置
 * 3. 点击"跳过" → 关闭弹窗，红点不再显示
 */
export const PermissionAlertModal: React.FC<PermissionAlertModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { t } = useTranslation();
  const {
    permissions,
    isRequesting,
    allGranted,
    openAppSettings,
    requestPermission,
    dismissAlert,
  } = usePermission();

  // 当所有权限都开启后，自动关闭弹窗
  useEffect(() => {
    if (isOpen && allGranted) {
      // 延迟一下关闭，让用户看到最后一个权限变成已开启
      const timer = setTimeout(() => {
        onClose();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isOpen, allGranted, onClose]);

  if (!isOpen) return null;

  /**
   * 用户点击"跳过"
   * 记录到 localStorage，红点不再显示
   */
  const handleSkip = () => {
    dismissAlert();
    onClose();
  };

  /**
   * 处理权限按钮点击
   * - 如果权限被拒绝，打开系统设置
   * - 否则请求权限（弹出系统授权弹窗）
   */
  const handlePermissionClick = (type: PermissionType) => {
    if (permissions[type] === 'denied') {
      // 权限被拒绝，需要去系统设置手动开启
      openAppSettings();
    } else {
      // 请求权限，弹出系统授权弹窗
      requestPermission(type);
    }
  };

  /**
   * 获取权限按钮的显示内容
   */
  const getButtonDisplay = (type: PermissionType) => {
    const status = permissions[type];

    if (status === 'granted') {
      return {
        text: t('profile.permissions.enabled'),
        className: 'bg-green-100 text-green-600 cursor-default',
        icon: 'fa-check',
        disabled: true,
      };
    }

    if (status === 'denied') {
      return {
        text: t('permissions.goToSettings'),
        className: 'bg-red-100 text-red-600 hover:bg-red-200 active:scale-95',
        icon: 'fa-gear',
        disabled: false,
      };
    }

    // prompt 或 unknown 状态
    return {
      text: t('permissions.enable'),
      className: 'bg-brand-orange text-white hover:bg-orange-600 active:scale-95',
      icon: 'fa-unlock',
      disabled: false,
    };
  };

  return (
    <div className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-6 relative">
        {/* 关闭按钮 */}
        <button
          type="button"
          aria-label="Close"
          className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full w-8 h-8 flex items-center justify-center transition-colors"
          onClick={onClose}
        >
          <i className="fa-solid fa-xmark"></i>
        </button>

        {/* 标题区域 */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
              <i className="fa-solid fa-shield-halved text-amber-600 text-xl"></i>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {t('permissions.alertTitle')}
              </h2>
              <p className="text-sm text-gray-500">
                {t('permissions.alertSubtitle')}
              </p>
            </div>
          </div>

          {/* 权限列表 - 每个权限都可以单独开启 */}
          <div className="space-y-3">
            {getPermissionOrder().map((type) => {
              const info = PERMISSION_INFO[type];
              const buttonDisplay = getButtonDisplay(type);
              const isCurrentlyRequesting = isRequesting === type;

              return (
                <div
                  key={type}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${info.iconBg} rounded-full flex items-center justify-center`}>
                      <i className={`fa-solid ${info.icon} ${info.iconColor}`}></i>
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-sm">
                        {t(info.titleKey)}
                      </p>
                      <p className="text-xs text-gray-400">
                        {t(info.descKey)}
                      </p>
                    </div>
                  </div>

                  {/* 开启按钮 */}
                  <button
                    type="button"
                    disabled={buttonDisplay.disabled || isCurrentlyRequesting}
                    onClick={() => handlePermissionClick(type)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${buttonDisplay.className} ${isCurrentlyRequesting ? 'opacity-70' : ''}`}
                  >
                    {isCurrentlyRequesting ? (
                      <>
                        <i className="fa-solid fa-spinner fa-spin"></i>
                        <span>{t('common.loading')}</span>
                      </>
                    ) : (
                      <>
                        <i className={`fa-solid ${buttonDisplay.icon}`}></i>
                        <span>{buttonDisplay.text}</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* 提示信息 */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-xl">
            <i className="fa-solid fa-circle-info text-blue-500 mt-0.5"></i>
            <p className="text-sm text-blue-700">
              {t('permissions.alertHintTapEnable')}
            </p>
          </div>

          {/* 跳过按钮 */}
          <button
            type="button"
            className="w-full border border-gray-200 text-gray-500 rounded-xl py-3 font-medium hover:bg-gray-50 transition-colors text-sm"
            onClick={handleSkip}
          >
            {t('permissions.skipForNow')}
          </button>
        </div>
      </div>
    </div>
  );
};
