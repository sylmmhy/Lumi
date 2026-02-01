/**
 * HealthKit Bridge Module
 *
 * 负责与 iOS 原生 App 的 HealthKit 通信
 * 仅 iOS 支持 HealthKit，Android 和 Web 浏览器不支持
 */

/** HealthKit message handler interface */
interface HealthKitMessageHandler {
  postMessage: (message: unknown) => void;
}

/** WebKit message handlers for HealthKit */
interface HealthKitWebKitHandlers {
  isHealthKitAvailable?: HealthKitMessageHandler;
  requestHealthKitPermission?: HealthKitMessageHandler;
  hasHealthKitPermission?: HealthKitMessageHandler;
  syncHealthData?: HealthKitMessageHandler;
  getAvailableTypes?: HealthKitMessageHandler;
  getHealthDataByType?: HealthKitMessageHandler;
}

/** Get HealthKit handlers from window.webkit (type-safe) */
function getHealthKitHandlers(): HealthKitWebKitHandlers | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).webkit?.messageHandlers;
}

export type HealthKitResultType = 'availability' | 'permission' | 'permissionStatus' | 'sync' | 'availableTypes' | 'healthDataByType';

/** 健康数据样本接口 */
export interface HealthSample {
  data_type: string;
  value: number | null;
  unit: string | null;
  sleep_stage: string | null;
  start_date: string;
  end_date: string;
  source_name: string | null;
  source_bundle_id: string | null;
  metadata: string | null;
}

/** HKObjectType 子类名称 */
export type HKObjectTypeClass =
  | 'HKQuantityType'
  | 'HKCategoryType'
  | 'HKCharacteristicType'
  | 'HKCorrelationType'
  | 'HKWorkoutType'
  | 'HKActivitySummaryType'
  | 'HKAudiogramSampleType'
  | 'HKElectrocardiogramType';

/** 按 HKObjectType 子类分组的数据类型可用性 */
export type HealthKitAvailableTypes = Partial<Record<HKObjectTypeClass, Record<string, number>>>;

export interface HealthKitResultData {
  available?: boolean;
  granted?: boolean;
  status?: 'prompt' | 'granted' | 'denied' | 'not_available';
  success?: boolean;
  count?: number;
  types?: HealthKitAvailableTypes;  // 按类型类别分组：类型类别 -> 数据类型 -> 样本数量
  dataType?: string;  // 查询的数据类型（用于 healthDataByType）
  samples?: HealthSample[];  // 健康数据样本（用于 healthDataByType）
  error?: string;  // 错误信息
}

export interface HealthKitResultEvent {
  type: HealthKitResultType;
  data: HealthKitResultData;
}

/**
 * 检测是否在 iOS WebView 环境中
 */
function isIOSWebView(): boolean {
  const handlers = getHealthKitHandlers();
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
      getHealthKitHandlers()?.isHealthKitAvailable?.postMessage({});
    }
  },

  /**
   * 请求 HealthKit 授权
   */
  requestPermission: (): void => {
    if (isIOSWebView()) {
      console.log('[HealthKit] Requesting permission...');
      getHealthKitHandlers()?.requestHealthKitPermission?.postMessage({});
    }
  },

  /**
   * 检查当前授权状态
   */
  hasPermission: (): void => {
    if (isIOSWebView()) {
      console.log('[HealthKit] Checking permission status...');
      getHealthKitHandlers()?.hasHealthKitPermission?.postMessage({});
    }
  },

  /**
   * 同步健康数据到 Supabase
   * @param days - 同步过去多少天的数据（默认 7 天）
   */
  syncData: (days: number = 7): void => {
    if (isIOSWebView()) {
      console.log(`[HealthKit] Syncing data for ${days} days...`);
      getHealthKitHandlers()?.syncHealthData?.postMessage({ days });
    }
  },

  /**
   * 获取所有数据类型的可用性（过去30天是否有数据）
   */
  getAvailableTypes: (): void => {
    if (isIOSWebView()) {
      console.log('[HealthKit] Getting available data types...');
      getHealthKitHandlers()?.getAvailableTypes?.postMessage({});
    }
  },

  /**
   * 获取特定类型的健康数据
   * @param dataType - 数据类型标识符（如 "stepCount", "heartRate", "sleepAnalysis" 等）
   * @param days - 查询过去多少天的数据（默认 7 天）
   */
  getHealthDataByType: (dataType: string, days: number = 7): void => {
    if (isIOSWebView()) {
      console.log(`[HealthKit] Getting ${dataType} data for ${days} days...`);
      getHealthKitHandlers()?.getHealthDataByType?.postMessage({ dataType, days });
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
 * 获取所有数据类型的可用性
 * 结果通过 'healthKitResult' 事件返回
 */
export function requestAvailableTypes(): void {
  healthKitBridge.getAvailableTypes();
}

/**
 * 获取特定类型的健康数据
 * @param dataType - 数据类型标识符（如 "stepCount", "heartRate", "sleepAnalysis" 等）
 * @param days - 查询过去多少天的数据（默认 7 天）
 * 结果通过 'healthKitResult' 事件返回
 *
 * 支持的数据类型：
 * - 心脏：heartRate, restingHeartRate, walkingHeartRateAverage, heartRateVariabilitySDNN
 * - 活动：stepCount, distanceWalkingRunning, distanceCycling, activeEnergyBurned, flightsClimbed
 * - 睡眠：sleepAnalysis
 * - 身体测量：bodyMass, height, bodyMassIndex, bodyFatPercentage
 * - 生命体征：bodyTemperature, bloodPressureSystolic, bloodPressureDiastolic, bloodGlucose
 * - 呼吸：oxygenSaturation, respiratoryRate
 * - 营养：dietaryEnergyConsumed, dietaryWater, dietaryCaffeine
 * - 环境：environmentalAudioExposure, headphoneAudioExposure
 */
export function requestHealthDataByType(dataType: string, days: number = 7): void {
  healthKitBridge.getHealthDataByType(dataType, days);
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
 * 通用 HealthKit 异步操作包装函数
 * 抽象重复的 Promise + 监听器 + 超时逻辑
 *
 * @param resultType - 期望的结果类型
 * @param defaultValue - 非 iOS 环境或超时时的默认返回值
 * @param timeoutMs - 超时时间（毫秒）
 * @param bridgeAction - 调用原生 bridge 的函数
 * @param extractResult - 从 HealthKitResultData 中提取结果的函数
 * @param matchCondition - 可选的额外匹配条件（用于 getHealthDataByType 等需要匹配参数的场景）
 */
function createHealthKitAsyncOperation<T>(
  resultType: HealthKitResultType,
  defaultValue: T,
  timeoutMs: number,
  bridgeAction: () => void,
  extractResult: (data: HealthKitResultData) => T,
  matchCondition?: (data: HealthKitResultData) => boolean
): Promise<T> {
  return new Promise((resolve) => {
    if (!isIOSWebView()) {
      resolve(defaultValue);
      return;
    }

    let resolved = false;
    const removeListener = addHealthKitResultListener((result) => {
      if (result.type === resultType) {
        // 检查额外匹配条件（如果有）
        if (matchCondition && !matchCondition(result.data)) {
          return;
        }
        if (!resolved) {
          resolved = true;
          removeListener();
          resolve(extractResult(result.data));
        }
      }
    });

    // 超时处理
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        removeListener();
        resolve(defaultValue);
      }
    }, timeoutMs);

    bridgeAction();
  });
}

/**
 * Promise 版本的 HealthKit 操作
 */
export const healthKitAsync = {
  /**
   * 检查可用性
   */
  isAvailable: (): Promise<boolean> =>
    createHealthKitAsyncOperation(
      'availability',
      false,
      5000,
      () => healthKitBridge.isAvailable(),
      (data) => data.available ?? false
    ),

  /**
   * 请求授权
   */
  requestPermission: (): Promise<boolean> =>
    createHealthKitAsyncOperation(
      'permission',
      false,
      30000, // 用户交互需要更长时间
      () => healthKitBridge.requestPermission(),
      (data) => data.granted ?? false
    ),

  /**
   * 获取授权状态
   */
  getPermissionStatus: (): Promise<'prompt' | 'granted' | 'denied' | 'not_available'> =>
    createHealthKitAsyncOperation(
      'permissionStatus',
      'not_available' as const,
      5000,
      () => healthKitBridge.hasPermission(),
      (data) => data.status ?? 'not_available'
    ),

  /**
   * 同步数据
   */
  syncData: (days: number = 7): Promise<{ success: boolean; count: number }> =>
    createHealthKitAsyncOperation(
      'sync',
      { success: false, count: 0 },
      60000, // 数据同步需要更长时间
      () => healthKitBridge.syncData(days),
      (data) => ({ success: data.success ?? false, count: data.count ?? 0 })
    ),

  /**
   * 获取所有数据类型的可用性，按 HKObjectType 子类分组
   * @returns 嵌套字典，外层 key 为类型类别名称，内层为数据类型名称 -> 过去30天的样本数量
   */
  getAvailableTypes: (): Promise<HealthKitAvailableTypes | null> =>
    createHealthKitAsyncOperation(
      'availableTypes',
      null,
      120000, // 需要查询 100+ 类型
      () => healthKitBridge.getAvailableTypes(),
      (data) => data.types || null
    ),

  /**
   * 获取特定类型的健康数据（默认过去7天）
   * @param dataType - 数据类型标识符（如 "stepCount", "heartRate", "sleepAnalysis" 等）
   * @param days - 查询过去多少天的数据（默认 7 天）
   * @returns 健康数据样本数组，如果失败则返回空数组
   *
   * 支持的数据类型：
   * - 心脏：heartRate, restingHeartRate, walkingHeartRateAverage, heartRateVariabilitySDNN
   * - 活动：stepCount, distanceWalkingRunning, distanceCycling, activeEnergyBurned, flightsClimbed
   * - 睡眠：sleepAnalysis
   * - 身体测量：bodyMass, height, bodyMassIndex, bodyFatPercentage
   * - 生命体征：bodyTemperature, bloodPressureSystolic, bloodPressureDiastolic, bloodGlucose
   * - 呼吸：oxygenSaturation, respiratoryRate
   * - 营养：dietaryEnergyConsumed, dietaryWater, dietaryCaffeine
   * - 环境：environmentalAudioExposure, headphoneAudioExposure
   */
  getHealthDataByType: (dataType: string, days: number = 7): Promise<HealthSample[]> =>
    createHealthKitAsyncOperation(
      'healthDataByType',
      [] as HealthSample[],
      60000,
      () => healthKitBridge.getHealthDataByType(dataType, days),
      (data) => {
        if (data.success && data.samples) {
          return data.samples;
        }
        if (data.error) {
          console.error('[HealthKit] getHealthDataByType failed:', data.error);
        }
        return [];
      },
      (data) => data.dataType === dataType // 确保匹配请求的 dataType
    ),
};
