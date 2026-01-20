/**
 * usePermission Hook
 *
 * 方便获取全局权限状态的 Hook
 *
 * 使用方法：
 * ```tsx
 * const { shouldShowBadge, missingPermissions, openAppSettings } = usePermission();
 * ```
 */

import { useContext } from 'react';
import { PermissionContext } from '../context/PermissionContextDefinition';

/**
 * 获取全局权限状态的 Hook
 *
 * @returns 权限状态和操作方法
 */
export function usePermission() {
  return useContext(PermissionContext);
}
