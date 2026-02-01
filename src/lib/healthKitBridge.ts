/**
 * HealthKit Bridge Module
 *
 * 负责与 iOS 原生 App 的 HealthKit 通信
 * 仅 iOS 支持 HealthKit，Android 和 Web 浏览器不支持
 */

// Extend Window interface for HealthKit message handlers
declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        // Existing handlers...
        [key: string]: {
          postMessage: (message: unknown) => void;
        };
        // HealthKit specific handlers
        isHealthKitAvailable?: {
          postMessage: (message: unknown) => void;
        };
        requestHealthKitPermission?: {
          postMessage: (message: unknown) => void;
        };
        hasHealthKitPermission?: {
          postMessage: (message: unknown) => void;
        };
        syncHealthData?: {
          postMessage: (message: unknown) => void;
        };
      };
    };
  }
}

export type HealthKitResultType = 'availability' | 'permission' | 'permissionStatus' | 'sync';

export interface HealthKitResultData {
  available?: boolean;
  granted?: boolean;
  status?: 'prompt' | 'granted' | 'denied' | 'not_available';
  success?: boolean;
  count?: number;
}

export interface HealthKitResultEvent {
  type: HealthKitResultType;
  data: HealthKitResultData;
}

/**
 * 检测是否在 iOS WebView 环境中
 */
function isIOSWebView(): boolean {
  const handlers = window.webkit?.messageHandlers;
  return !!(handlers?.isHealthKitAvailable);
}

/**
 * iOS HealthKit Bridge - 通过 WKWebView 与原生通信
 */
const healthKitBridge = {
  /**
   * 检查 HealthKit 是否可用（仅 iPhone 支持，iPad 不支持）
   */
  isAvailable: (): void => {
    if (isIOSWebView()) {
      console.log('[HealthKit] Checking availability...');
      window.webkit?.messageHandlers?.isHealthKitAvailable?.postMessage({});
    }
  },

  /**
   * 请求 HealthKit 授权
   */
  requestPermission: (): void => {
    if (isIOSWebView()) {
      console.log('[HealthKit] Requesting permission...');
      window.webkit?.messageHandlers?.requestHealthKitPermission?.postMessage({});
    }
  },

  /**
   * 检查当前授权状态
   */
  hasPermission: (): void => {
    if (isIOSWebView()) {
      console.log('[HealthKit] Checking permission status...');
      window.webkit?.messageHandlers?.hasHealthKitPermission?.postMessage({});
    }
  },

  /**
   * 同步健康数据到 Supabase
   * @param days - 同步过去多少天的数据（默认 7 天）
   */
  syncData: (days: number = 7): void => {
    if (isIOSWebView()) {
      console.log(`[HealthKit] Syncing data for ${days} days...`);
      window.webkit?.messageHandlers?.syncHealthData?.postMessage({ days });
    }
  },
};

/**
 * 检查 HealthKit 是否在当前环境可用
 * @returns true 如果在 iOS WebView 中
 */
export function isHealthKitSupported(): boolean {
  return isIOSWebView();
}

/**
 * 检查 HealthKit 是否可用
 * 结果通过 'healthKitResult' 事件返回
 */
export function checkHealthKitAvailability(): void {
  healthKitBridge.isAvailable();
}

/**
 * 请求 HealthKit 授权
 * 结果通过 'healthKitResult' 事件返回
 */
export function requestHealthKitPermission(): void {
  healthKitBridge.requestPermission();
}

/**
 * 检查 HealthKit 授权状态
 * 结果通过 'healthKitResult' 事件返回
 */
export function checkHealthKitPermission(): void {
  healthKitBridge.hasPermission();
}

/**
 * 同步健康数据
 * @param days - 同步过去多少天的数据（默认 7 天）
 * 结果通过 'healthKitResult' 事件返回
 */
export function syncHealthKitData(days: number = 7): void {
  healthKitBridge.syncData(days);
}

/**
 * 添加 HealthKit 结果监听器
 * @param callback - 回调函数
 * @returns 移除监听器的函数
 */
export function addHealthKitResultListener(
  callback: (event: HealthKitResultEvent) => void
): () => void {
  const handler = (event: CustomEvent<HealthKitResultEvent>) => {
    console.log('[HealthKit] Result received:', event.detail);
    callback(event.detail);
  };

  window.addEventListener('healthKitResult', handler as EventListener);

  return () => {
    window.removeEventListener('healthKitResult', handler as EventListener);
  };
}

/**
 * Promise 版本的 HealthKit 操作
 */
export const healthKitAsync = {
  /**
   * 检查可用性
   */
  isAvailable: (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve(false);
        return;
      }

      const removeListener = addHealthKitResultListener((result) => {
        if (result.type === 'availability') {
          removeListener();
          resolve(result.data.available ?? false);
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        removeListener();
        resolve(false);
      }, 5000);

      healthKitBridge.isAvailable();
    });
  },

  /**
   * 请求授权
   */
  requestPermission: (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve(false);
        return;
      }

      const removeListener = addHealthKitResultListener((result) => {
        if (result.type === 'permission') {
          removeListener();
          resolve(result.data.granted ?? false);
        }
      });

      // Timeout after 30 seconds (user interaction)
      setTimeout(() => {
        removeListener();
        resolve(false);
      }, 30000);

      healthKitBridge.requestPermission();
    });
  },

  /**
   * 获取授权状态
   */
  getPermissionStatus: (): Promise<'prompt' | 'granted' | 'denied' | 'not_available'> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve('not_available');
        return;
      }

      const removeListener = addHealthKitResultListener((result) => {
        if (result.type === 'permissionStatus') {
          removeListener();
          resolve(result.data.status ?? 'not_available');
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        removeListener();
        resolve('not_available');
      }, 5000);

      healthKitBridge.hasPermission();
    });
  },

  /**
   * 同步数据
   */
  syncData: (days: number = 7): Promise<{ success: boolean; count: number }> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve({ success: false, count: 0 });
        return;
      }

      const removeListener = addHealthKitResultListener((result) => {
        if (result.type === 'sync') {
          removeListener();
          resolve({
            success: result.data.success ?? false,
            count: result.data.count ?? 0,
          });
        }
      });

      // Timeout after 60 seconds (data sync can take time)
      setTimeout(() => {
        removeListener();
        resolve({ success: false, count: 0 });
      }, 60000);

      healthKitBridge.syncData(days);
    });
  },
};
