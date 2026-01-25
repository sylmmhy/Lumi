/**
 * 原生任务事件工具
 * 使用与登录/登出一致的 CustomEvent 模式
 *
 * 架构设计：
 * - 与现有 mindboat:nativeLogin/nativeLogout 完全一致
 * - 事件驱动，解耦 Web 和原生端
 * - 支持 Android 和 iOS（未来）
 *
 * 注意：Window 的全局类型声明在 src/context/AuthContext.tsx 中定义
 */

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

/**
 * P0 修复：原生端启动时全量同步任务
 *
 * 解决的问题：
 * - App 被杀死后重启，原生端丢失所有任务数据
 * - WebView 加载慢导致事件发出时原生端未准备好
 *
 * 触发时机：
 * - 原生端启动后，WebView 加载完成时
 * - 用户登录后
 * - App 从后台恢复时（可选）
 *
 * @param tasks - 所有需要提醒的任务列表
 */
export function syncAllTasksToNative(tasks: TaskReminderData[]): void {
  try {
    // 过滤出有效的任务（有提醒时间的）
    const validTasks = tasks.filter(task =>
      task.id &&
      task.reminder_date &&
      task.time &&
      task.status !== 'completed'
    );

    // 通用 CustomEvent（供 Android WebView 监听）
    const event = new CustomEvent('mindboat:tasksBulkSync', {
      detail: {
        tasks: validTasks,
        syncedAt: new Date().toISOString(),
      },
      bubbles: true,
      cancelable: false,
    });
    window.dispatchEvent(event);

    // iOS: 发送消息给 WKWebView 的 messageHandler
    if (window.webkit?.messageHandlers?.taskChanged) {
      window.webkit.messageHandlers.taskChanged.postMessage({
        action: 'bulk_sync',
        tasks: validTasks,
        syncedAt: new Date().toISOString(),
      });
      console.log('📱 [iOS] 已发送 taskChanged 批量同步消息', { count: validTasks.length });
    }

    console.log(`📱 已同步 ${validTasks.length} 个任务到原生端`);
  } catch (error) {
    console.error('❌ 同步任务到原生端失败:', error);
  }
}

/**
 * P0 修复：更新任务的 called 状态到原生端
 *
 * @param taskId - 任务 ID
 * @param called - 是否已呼叫
 */
export function notifyNativeTaskCalled(taskId: string, called: boolean): void {
  try {
    const event = new CustomEvent('mindboat:taskCalled', {
      detail: { taskId, called },
      bubbles: true,
      cancelable: false,
    });
    window.dispatchEvent(event);

    // iOS: 发送消息给 WKWebView 的 messageHandler
    if (window.webkit?.messageHandlers?.taskChanged) {
      window.webkit.messageHandlers.taskChanged.postMessage({
        action: 'update_called',
        taskId,
        called,
      });
    }

    if (import.meta.env.DEV) {
      console.log('📱 已通知原生端任务呼叫状态', { taskId, called });
    }
  } catch (error) {
    console.error('❌ 通知任务呼叫状态失败:', error);
  }
}

/**
 * 注册原生端调用的刷新任务函数
 *
 * iOS 在更新数据库后（例如 Live Activity 点击 "later"），
 * 会调用 window.refreshTasks() 来通知 WebView 刷新任务列表
 *
 * @param callback - 刷新任务的回调函数
 * @returns 取消注册的函数
 *
 * @example
 * ```typescript
 * // 在 AppTabsPage 中
 * useEffect(() => {
 *   const unregister = registerNativeRefreshTasks(() => {
 *     loadTasks();
 *   });
 *   return unregister;
 * }, [loadTasks]);
 * ```
 */
export function registerNativeRefreshTasks(callback: () => void): () => void {
  // 暴露全局函数供 iOS 调用
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).refreshTasks = () => {
    console.log('📱 [iOS] refreshTasks 被调用，刷新任务列表');
    callback();
  };

  // 同时监听 CustomEvent（备用方式）
  const handleRefresh = () => {
    console.log('📱 mindboat:tasksNeedRefresh 事件触发，刷新任务列表');
    callback();
  };
  window.addEventListener('mindboat:tasksNeedRefresh', handleRefresh);

  console.log('📱 已注册 window.refreshTasks() 供原生端调用');

  // 返回取消注册函数
  return () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).refreshTasks;
    window.removeEventListener('mindboat:tasksNeedRefresh', handleRefresh);
    console.log('📱 已取消注册 window.refreshTasks()');
  };
}

/**
 * 通知原生端：新手引导已完成
 *
 * 调用此函数后：
 * 1. iOS 端会更新本地缓存 hasCompletedHabitOnboarding = true
 * 2. iOS 端会将 WebView 跳转到主页 (/app/home)
 *
 * 触发时机：
 * - 用户完成 habit onboarding 后（在 markHabitOnboardingCompleted 之后调用）
 *
 * 注意：
 * - 如果在原生 App 中运行，会由原生端处理跳转，不需要 Web 端再 navigate
 * - 如果在纯浏览器中运行，此函数不做任何事情，需要 Web 端自己 navigate
 *
 * @returns boolean - 是否成功发送消息给原生端
 *
 * @example
 * ```typescript
 * await markHabitOnboardingCompleted();
 * const handledByNative = notifyNativeOnboardingCompleted();
 * if (!handledByNative) {
 *   // 纯浏览器环境，需要 Web 端处理跳转
 *   navigate('/app/home');
 * }
 * ```
 */
export function notifyNativeOnboardingCompleted(): boolean {
  try {
    // iOS: 发送消息给 WKWebView 的 messageHandler
    if (window.webkit?.messageHandlers?.onboardingCompleted) {
      window.webkit.messageHandlers.onboardingCompleted.postMessage({});
      console.log('📱 [iOS] 已发送 onboardingCompleted 消息，等待原生端处理跳转');
      return true;
    }

    // Android: 调用 AndroidBridge 方法（未来实现）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).AndroidBridge?.onOnboardingCompleted) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).AndroidBridge.onOnboardingCompleted();
      console.log('📱 [Android] 已调用 onOnboardingCompleted，等待原生端处理跳转');
      return true;
    }

    // 纯浏览器环境，没有原生端处理
    console.log('🌐 纯浏览器环境，无原生端处理 onboardingCompleted');
    return false;
  } catch (error) {
    console.error('❌ 通知原生端 onboarding 完成失败:', error);
    return false;
  }
}
