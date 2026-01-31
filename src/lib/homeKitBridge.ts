/**
 * HomeKit Bridge Module
 *
 * 负责与 iOS 原生 App 的 HomeKit 通信
 * 仅 iOS 支持 HomeKit，Android 和 Web 浏览器不支持
 */

// ============================================================================
// Types
// ============================================================================

export type HomeKitResultType =
  | 'availability'
  | 'access'
  | 'devices'
  | 'control'
  | 'scenes'
  | 'sceneExecution';

export interface HomeKitCharacteristic {
  id: string;
  type: string;
  value: boolean | number | string | null;
  isWritable: boolean;
}

export interface HomeKitService {
  id: string;
  type: string;
  name: string;
  characteristics: HomeKitCharacteristic[];
}

export interface HomeKitAccessory {
  id: string;
  name: string;
  roomName: string | null;
  isReachable: boolean;
  category: string;
  services: HomeKitService[];
}

export interface HomeKitResultData {
  available?: boolean;
  granted?: boolean;
  success?: boolean;
  count?: number;
  devices?: HomeKitAccessory[];
  scenes?: string[];
  accessoryId?: string;
  action?: string;
  sceneName?: string;
  error?: string;
}

export interface HomeKitResultEvent {
  type: HomeKitResultType;
  data: HomeKitResultData;
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * 检测是否在 iOS WebView 环境中
 */
function isIOSWebView(): boolean {
  const handlers = window.webkit?.messageHandlers;
  return !!(handlers?.isHomeKitAvailable);
}

/**
 * iOS HomeKit Bridge - 通过 WKWebView 与原生通信
 */
const homeKitBridge = {
  /**
   * 检查 HomeKit 是否可用
   */
  isAvailable: (): void => {
    if (isIOSWebView()) {
      console.log('[HomeKit] Checking availability...');
      window.webkit?.messageHandlers?.isHomeKitAvailable?.postMessage({});
    }
  },

  /**
   * 请求 HomeKit 访问权限
   */
  requestAccess: (): void => {
    if (isIOSWebView()) {
      console.log('[HomeKit] Requesting access...');
      window.webkit?.messageHandlers?.requestHomeKitAccess?.postMessage({});
    }
  },

  /**
   * 获取所有设备
   */
  getDevices: (): void => {
    if (isIOSWebView()) {
      console.log('[HomeKit] Getting devices...');
      window.webkit?.messageHandlers?.getHomeKitDevices?.postMessage({});
    }
  },

  /**
   * 获取所有灯光设备
   */
  getLights: (): void => {
    if (isIOSWebView()) {
      console.log('[HomeKit] Getting lights...');
      window.webkit?.messageHandlers?.getHomeKitLights?.postMessage({});
    }
  },

  /**
   * 控制灯光
   */
  controlLight: (accessoryId: string, action: string, value?: number): void => {
    if (isIOSWebView()) {
      console.log(`[HomeKit] Controlling light: ${accessoryId}, action: ${action}, value: ${value}`);
      window.webkit?.messageHandlers?.controlHomeKitLight?.postMessage({
        accessoryId,
        action,
        value,
      });
    }
  },

  /**
   * 获取所有场景
   */
  getScenes: (): void => {
    if (isIOSWebView()) {
      console.log('[HomeKit] Getting scenes...');
      window.webkit?.messageHandlers?.getHomeKitScenes?.postMessage({});
    }
  },

  /**
   * 执行场景
   */
  executeScene: (sceneName: string): void => {
    if (isIOSWebView()) {
      console.log(`[HomeKit] Executing scene: ${sceneName}`);
      window.webkit?.messageHandlers?.executeHomeKitScene?.postMessage({
        sceneName,
      });
    }
  },
};

// ============================================================================
// Public API - Event-based
// ============================================================================

/**
 * 检查 HomeKit 是否在当前环境可用
 * @returns true 如果在 iOS WebView 中
 */
export function isHomeKitSupported(): boolean {
  return isIOSWebView();
}

/**
 * 检查 HomeKit 是否可用
 * 结果通过 'homeKitResult' 事件返回
 */
export function checkHomeKitAvailability(): void {
  homeKitBridge.isAvailable();
}

/**
 * 请求 HomeKit 访问权限
 * 结果通过 'homeKitResult' 事件返回
 */
export function requestHomeKitAccess(): void {
  homeKitBridge.requestAccess();
}

/**
 * 获取所有 HomeKit 设备
 * 结果通过 'homeKitResult' 事件返回
 */
export function getHomeKitDevices(): void {
  homeKitBridge.getDevices();
}

/**
 * 获取所有灯光设备
 * 结果通过 'homeKitResult' 事件返回
 */
export function getHomeKitLights(): void {
  homeKitBridge.getLights();
}

/**
 * 控制灯光
 * @param accessoryId - 配件 ID
 * @param action - 操作类型: 'turnOn' | 'turnOff' | 'setBrightness'
 * @param value - 可选值（亮度 0-100）
 * 结果通过 'homeKitResult' 事件返回
 */
export function controlHomeKitLight(
  accessoryId: string,
  action: 'turnOn' | 'turnOff' | 'setBrightness',
  value?: number
): void {
  homeKitBridge.controlLight(accessoryId, action, value);
}

/**
 * 获取所有场景
 * 结果通过 'homeKitResult' 事件返回
 */
export function getHomeKitScenes(): void {
  homeKitBridge.getScenes();
}

/**
 * 执行场景
 * @param sceneName - 场景名称
 * 结果通过 'homeKitResult' 事件返回
 */
export function executeHomeKitScene(sceneName: string): void {
  homeKitBridge.executeScene(sceneName);
}

/**
 * 添加 HomeKit 结果监听器
 * @param callback - 回调函数
 * @returns 移除监听器的函数
 */
export function addHomeKitResultListener(
  callback: (event: HomeKitResultEvent) => void
): () => void {
  const handler = (event: CustomEvent<HomeKitResultEvent>) => {
    console.log('[HomeKit] Result received:', event.detail);
    callback(event.detail);
  };

  window.addEventListener('homeKitResult', handler as EventListener);

  return () => {
    window.removeEventListener('homeKitResult', handler as EventListener);
  };
}

// ============================================================================
// Public API - Promise-based
// ============================================================================

/**
 * Promise 版本的 HomeKit 操作
 */
export const homeKitAsync = {
  /**
   * 检查可用性
   */
  isAvailable: (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve(false);
        return;
      }

      const removeListener = addHomeKitResultListener((result) => {
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

      homeKitBridge.isAvailable();
    });
  },

  /**
   * 请求访问权限
   */
  requestAccess: (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve(false);
        return;
      }

      const removeListener = addHomeKitResultListener((result) => {
        if (result.type === 'access') {
          removeListener();
          resolve(result.data.granted ?? false);
        }
      });

      // Timeout after 30 seconds (user interaction)
      setTimeout(() => {
        removeListener();
        resolve(false);
      }, 30000);

      homeKitBridge.requestAccess();
    });
  },

  /**
   * 获取所有设备
   */
  getDevices: (): Promise<HomeKitAccessory[]> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve([]);
        return;
      }

      const removeListener = addHomeKitResultListener((result) => {
        if (result.type === 'devices') {
          removeListener();
          resolve(result.data.devices ?? []);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        removeListener();
        resolve([]);
      }, 10000);

      homeKitBridge.getDevices();
    });
  },

  /**
   * 获取所有灯光设备
   */
  getLights: (): Promise<HomeKitAccessory[]> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve([]);
        return;
      }

      const removeListener = addHomeKitResultListener((result) => {
        if (result.type === 'devices') {
          removeListener();
          resolve(result.data.devices ?? []);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        removeListener();
        resolve([]);
      }, 10000);

      homeKitBridge.getLights();
    });
  },

  /**
   * 控制灯光
   */
  controlLight: (
    accessoryId: string,
    action: 'turnOn' | 'turnOff' | 'setBrightness',
    value?: number
  ): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve(false);
        return;
      }

      const removeListener = addHomeKitResultListener((result) => {
        if (result.type === 'control' && result.data.accessoryId === accessoryId) {
          removeListener();
          resolve(result.data.success ?? false);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        removeListener();
        resolve(false);
      }, 10000);

      homeKitBridge.controlLight(accessoryId, action, value);
    });
  },

  /**
   * 获取所有场景
   */
  getScenes: (): Promise<string[]> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve([]);
        return;
      }

      const removeListener = addHomeKitResultListener((result) => {
        if (result.type === 'scenes') {
          removeListener();
          resolve(result.data.scenes ?? []);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        removeListener();
        resolve([]);
      }, 10000);

      homeKitBridge.getScenes();
    });
  },

  /**
   * 执行场景
   */
  executeScene: (sceneName: string): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!isIOSWebView()) {
        resolve(false);
        return;
      }

      const removeListener = addHomeKitResultListener((result) => {
        if (result.type === 'sceneExecution' && result.data.sceneName === sceneName) {
          removeListener();
          resolve(result.data.success ?? false);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        removeListener();
        resolve(false);
      }, 10000);

      homeKitBridge.executeScene(sceneName);
    });
  },

  /**
   * 关闭所有灯光 (便捷方法)
   */
  turnOffAllLights: async (): Promise<{ success: number; failed: number }> => {
    const lights = await homeKitAsync.getLights();
    let success = 0;
    let failed = 0;

    for (const light of lights) {
      if (light.isReachable) {
        const result = await homeKitAsync.controlLight(light.id, 'turnOff');
        if (result) {
          success++;
        } else {
          failed++;
        }
      }
    }

    return { success, failed };
  },

  /**
   * 调暗所有灯光 (便捷方法)
   * @param brightness - 目标亮度 (0-100)
   */
  dimAllLights: async (brightness: number): Promise<{ success: number; failed: number }> => {
    const lights = await homeKitAsync.getLights();
    let success = 0;
    let failed = 0;

    for (const light of lights) {
      if (light.isReachable) {
        const result = await homeKitAsync.controlLight(light.id, 'setBrightness', brightness);
        if (result) {
          success++;
        } else {
          failed++;
        }
      }
    }

    return { success, failed };
  },
};
