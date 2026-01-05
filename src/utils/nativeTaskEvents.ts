/**
 * 原生任务事件工具
 * 使用与登录/登出一致的 CustomEvent 模式
 *
 * 架构设计：
 * - 与现有 mindboat:nativeLogin/nativeLogout 完全一致
 * - 事件驱动，解耦 Web 和原生端
 * - 支持 Android 和 iOS（未来）
 */

// iOS WebKit message handler types
interface WebKitMessageHandler {
  postMessage: (message: unknown) => void;
}

interface WebKitMessageHandlers {
  taskChanged?: WebKitMessageHandler;
  nativeApp?: WebKitMessageHandler;
}

interface WebKitNamespace {
  messageHandlers?: WebKitMessageHandlers;
}

declare global {
  interface Window {
    webkit?: WebKitNamespace;
    AndroidBridge?: unknown;
  }
}

/**
 * 任务提醒数据结构（与 Android 端约定）
 */
export interface TaskReminderData {
  id: string;
  user_id: string;
  title: string;
  reminder_date: string;  // YYYY-MM-DD
  time: string;           // HH:mm (24小时制)
  timezone?: string;      // IANA 时区字符串
  description?: string;
  priority?: number;
  status?: string;
  called?: boolean;
}

/**
 * 通知原生端：任务已创建（需要设置提醒）
 *
 * 触发时机：
 * - 用户创建新任务后（在数据库保存成功后）
 * - 用户修改任务的提醒时间后
 *
 * @param task - 任务数据（必须包含 id, user_id, title, reminder_date, time）
 *
 * @example
 * ```typescript
 * notifyNativeTaskCreated({
 *   id: 'task-123',
 *   user_id: 'user-001',
 *   title: '下午开会',
 *   reminder_date: '2025-12-05',
 *   time: '14:30',
 *   timezone: 'Asia/Shanghai'
 * });
 * ```
 */
export function notifyNativeTaskCreated(task: TaskReminderData): void {
  try {
    const event = new CustomEvent('mindboat:taskCreated', {
      detail: { task },
      bubbles: true,
      cancelable: false,
    });
    window.dispatchEvent(event);

    // iOS: 发送消息给 WKWebView 的 messageHandler
    if (window.webkit?.messageHandlers?.taskChanged) {
      window.webkit.messageHandlers.taskChanged.postMessage({
        action: 'create',
        taskId: task.id,
        task: task
      });
      console.log('📱 [iOS] 已发送 taskChanged 消息', { action: 'create', taskId: task.id });
    }

    if (import.meta.env.DEV) {
      console.log('📱 已触发 mindboat:taskCreated 事件', {
        id: task.id,
        title: task.title,
        time: `${task.reminder_date} ${task.time}`
      });
    }
  } catch (error) {
    console.error('❌ 触发任务创建事件失败:', error);
  }
}

/**
 * 通知原生端：任务已删除或完成（需要取消提醒）
 *
 * 触发时机：
 * - 用户删除任务
 * - 用户标记任务为已完成
 *
 * @param taskId - 任务 ID
 *
 * @example
 * ```typescript
 * notifyNativeTaskDeleted('task-123');
 * ```
 */
export function notifyNativeTaskDeleted(taskId: string): void {
  try {
    const event = new CustomEvent('mindboat:taskDeleted', {
      detail: { taskId },
      bubbles: true,
      cancelable: false,
    });
    window.dispatchEvent(event);

    // iOS: 发送消息给 WKWebView 的 messageHandler
    if (window.webkit?.messageHandlers?.taskChanged) {
      window.webkit.messageHandlers.taskChanged.postMessage({
        action: 'delete',
        taskId: taskId
      });
      console.log('📱 [iOS] 已发送 taskChanged 消息', { action: 'delete', taskId });
    }

    if (import.meta.env.DEV) {
      console.log('📱 已触发 mindboat:taskDeleted 事件', { taskId });
    }
  } catch (error) {
    console.error('❌ 触发任务删除事件失败:', error);
  }
}

/**
 * 检查是否在原生 App 中（可选，用于调试）
 *
 * @returns 是否在原生 App 环境中运行
 *
 * @example
 * ```typescript
 * if (isNativeApp()) {
 *   console.log('运行在原生 App 中');
 * }
 * ```
 */
export function isNativeApp(): boolean {
  // Android
  if (typeof window !== 'undefined' && 'AndroidBridge' in window) {
    return true;
  }

  // iOS
  if (typeof window !== 'undefined' &&
      'webkit' in window &&
      window.webkit?.messageHandlers?.nativeApp) {
    return true;
  }

  return false;
}
