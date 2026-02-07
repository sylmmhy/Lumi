/**
 * Bedtime Reminder Bridge Module
 *
 * 负责与 iOS 原生 App 的入睡提醒通知通信
 * 遵循 healthKitBridge.ts 相同的桥接模式
 */

/** Bedtime reminder message handler interface */
interface BedtimeReminderMessageHandler {
  postMessage: (message: unknown) => void;
}

/** WebKit message handlers for bedtime reminder */
interface BedtimeReminderWebKitHandlers {
  scheduleBedtimeReminder?: BedtimeReminderMessageHandler;
  cancelBedtimeReminder?: BedtimeReminderMessageHandler;
  getBedtimeReminderStatus?: BedtimeReminderMessageHandler;
}

/** Get bedtime reminder handlers from window.webkit */
function getHandlers(): BedtimeReminderWebKitHandlers | undefined {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).webkit?.messageHandlers;
}

/** 结果事件类型 */
export type BedtimeReminderResultType =
  | 'bedtimeReminderScheduled'
  | 'bedtimeReminderCancelled'
  | 'bedtimeReminderStatus';

/** 结果数据 */
export interface BedtimeReminderResultData {
  success?: boolean;
  scheduled?: boolean;
  reminderTime?: string;
  bedtime?: string;
  error?: string;
}

export interface BedtimeReminderResultEvent {
  type: BedtimeReminderResultType;
  data: BedtimeReminderResultData;
}

/**
 * 检查入睡提醒桥接是否可用（仅 iOS）
 */
export function isBedtimeReminderSupported(): boolean {
  return !!getHandlers()?.scheduleBedtimeReminder;
}

/**
 * 添加结果监听器
 * @returns 移除监听器的函数
 */
export function addBedtimeReminderListener(
  callback: (event: BedtimeReminderResultEvent) => void
): () => void {
  const handler = (event: CustomEvent<BedtimeReminderResultEvent>) => {
    console.log('[BedtimeReminder] Result received:', event.detail);
    callback(event.detail);
  };

  window.addEventListener('bedtimeReminderResult', handler as EventListener);

  return () => {
    window.removeEventListener('bedtimeReminderResult', handler as EventListener);
  };
}

/**
 * 通用异步操作包装（同 healthKitBridge 模式）
 */
function createAsyncOperation<T>(
  resultType: BedtimeReminderResultType,
  defaultValue: T,
  timeoutMs: number,
  bridgeAction: () => void,
  extractResult: (data: BedtimeReminderResultData) => T
): Promise<T> {
  return new Promise((resolve) => {
    if (!isBedtimeReminderSupported()) {
      resolve(defaultValue);
      return;
    }

    let resolved = false;
    const removeListener = addBedtimeReminderListener((result) => {
      if (result.type === resultType && !resolved) {
        resolved = true;
        removeListener();
        resolve(extractResult(result.data));
      }
    });

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
 * Promise 版本的入睡提醒操作
 */
export const bedtimeReminderAsync = {
  /**
   * 调度入睡提醒
   * @param hour - 建议入睡时间的小时
   * @param minute - 建议入睡时间的分钟
   * @param advanceMinutes - 提前多少分钟提醒（默认 30）
   */
  schedule: (hour: number, minute: number, advanceMinutes: number = 30): Promise<{
    success: boolean;
    reminderTime?: string;
  }> =>
    createAsyncOperation(
      'bedtimeReminderScheduled',
      { success: false },
      10000,
      () => {
        console.log(`[BedtimeReminder] Scheduling: bedtime=${hour}:${minute}, advance=${advanceMinutes}min`);
        getHandlers()?.scheduleBedtimeReminder?.postMessage({ hour, minute, advanceMinutes });
      },
      (data) => ({
        success: data.success ?? false,
        reminderTime: data.reminderTime,
      })
    ),

  /**
   * 取消入睡提醒
   */
  cancel: (): Promise<boolean> =>
    createAsyncOperation(
      'bedtimeReminderCancelled',
      false,
      5000,
      () => {
        console.log('[BedtimeReminder] Cancelling reminder');
        getHandlers()?.cancelBedtimeReminder?.postMessage({});
      },
      (data) => data.success ?? false
    ),

  /**
   * 获取当前提醒状态
   */
  getStatus: (): Promise<{ scheduled: boolean; reminderTime?: string }> =>
    createAsyncOperation(
      'bedtimeReminderStatus',
      { scheduled: false },
      5000,
      () => {
        console.log('[BedtimeReminder] Getting status');
        getHandlers()?.getBedtimeReminderStatus?.postMessage({});
      },
      (data) => ({
        scheduled: data.scheduled ?? false,
        reminderTime: data.reminderTime,
      })
    ),
};
