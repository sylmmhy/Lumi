/**
 * Permission Context Definition
 *
 * 权限状态的类型定义和 Context 创建
 * 用于全局共享权限检测状态，避免重复检测
 */

import { createContext } from 'react';

/**
 * 权限类型枚举
 * - notification: 通知权限
 * - microphone: 麦克风权限
 * - camera: 摄像头权限
 * - sleepFocus: 睡眠模式免打扰权限（仅 iOS）
 */
export type PermissionType = 'notification' | 'microphone' | 'camera' | 'sleepFocus';

/**
 * 权限状态枚举
 * - unknown: 未知状态（初始化中）
 * - granted: 已授权
 * - denied: 已拒绝
 * - prompt: 可以请求（未决定）
 */
export type PermissionStatus = 'unknown' | 'granted' | 'denied' | 'prompt';

/**
 * 权限状态记录类型
 */
export type PermissionRecord = Record<PermissionType, PermissionStatus>;

/**
 * Permission Context 的值类型
 */
export interface PermissionContextType {
  /** 当前权限状态 */
  permissions: PermissionRecord;
  /** 是否正在请求权限 */
  isRequesting: PermissionType | null;
  /** 所有权限是否已授权 */
  allGranted: boolean;
  /** 已授权权限数量 */
  grantedCount: number;
  /** 是否有缺失的权限 */
  hasMissingPermissions: boolean;
  /** 是否应该显示红点提示（有缺失权限 且 用户没有跳过） */
  shouldShowBadge: boolean;
  /** 缺失的权限列表 */
  missingPermissions: PermissionType[];
  /** 用户是否已跳过权限提示 */
  isDismissed: boolean;
  /** 检查所有权限状态 */
  checkAllPermissions: () => Promise<void>;
  /** 请求单个权限 */
  requestPermission: (type: PermissionType) => Promise<void>;
  /** 打开系统设置 */
  openAppSettings: () => void;
  /** 跳过权限提示（会记录到 localStorage） */
  dismissAlert: () => void;
  /** 重置跳过状态 */
  resetDismissed: () => void;
  /** 是否在原生 App 中运行 */
  isInNativeApp: boolean;
}

/**
 * Permission Context
 *
 * 默认值用于在 Provider 外部使用时的兜底
 */
export const PermissionContext = createContext<PermissionContextType>({
  permissions: {
    notification: 'unknown',
    microphone: 'unknown',
    camera: 'unknown',
    sleepFocus: 'unknown',
  },
  isRequesting: null,
  allGranted: false,
  grantedCount: 0,
  hasMissingPermissions: true,
  shouldShowBadge: false,
  missingPermissions: ['notification', 'microphone', 'camera', 'sleepFocus'],
  isDismissed: false,
  checkAllPermissions: async () => {},
  requestPermission: async () => {},
  openAppSettings: () => {},
  dismissAlert: () => {},
  resetDismissed: () => {},
  isInNativeApp: false,
});
