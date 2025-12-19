# Web 端集成指南 - CustomEvent 模式（保持架构一致性）

## 📌 方案说明

这个方案使用与现有登录/登出**完全一致的 CustomEvent 模式**，保持架构统一性。

**优点：**
- ✅ 与现有 `mindboat:nativeLogin` / `mindboat:nativeLogout` 模式完全一致
- ✅ 架构统一，维护简单
- ✅ 事件驱动，解耦 Web 和原生
- ✅ Android 端已完成（无需等待）
- ✅ iOS 未来可用相同模式轻松实现
- ✅ Web 端工作量最小：30 分钟 - 1 小时

---

## 🔄 工作原理

```
Web 端创建任务
      ↓
触发 CustomEvent('mindboat:taskCreated')
      ↓
Android 监听器捕获事件
      ↓
调用 AndroidBridge.onTaskCreated()
      ↓
设置原生系统提醒
```

**与现有登录模式对比：**

| 功能 | 现有模式 | 新增任务提醒模式 |
|------|---------|---------------|
| 登录 | `mindboat:nativeLogin` | `mindboat:taskCreated` |
| 登出 | `mindboat:nativeLogout` | `mindboat:taskDeleted` |
| 通信方式 | CustomEvent | CustomEvent（相同！） |
| Android 监听 | 注入脚本 | 注入脚本（相同！） |

---

## 🚀 快速开始（30 分钟）

### 步骤 1: 创建事件工具类（10 分钟）

创建文件：`src/utils/nativeTaskEvents.ts`

```typescript
/**
 * 原生任务事件工具
 * 使用与登录/登出一致的 CustomEvent 模式
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
 * @param task - 任务数据
 */
export function notifyNativeTaskCreated(task: TaskReminderData): void {
  try {
    const event = new CustomEvent('mindboat:taskCreated', {
      detail: { task },
      bubbles: true,
      cancelable: false,
    });
    window.dispatchEvent(event);

    if (import.meta.env.DEV) {
      console.log('📱 已触发 mindboat:taskCreated 事件', task);
    }
  } catch (error) {
    console.error('❌ 触发任务创建事件失败:', error);
  }
}

/**
 * 通知原生端：任务已删除或完成（需要取消提醒）
 *
 * @param taskId - 任务 ID
 */
export function notifyNativeTaskDeleted(taskId: string): void {
  try {
    const event = new CustomEvent('mindboat:taskDeleted', {
      detail: { taskId },
      bubbles: true,
      cancelable: false,
    });
    window.dispatchEvent(event);

    if (import.meta.env.DEV) {
      console.log('📱 已触发 mindboat:taskDeleted 事件', taskId);
    }
  } catch (error) {
    console.error('❌ 触发任务删除事件失败:', error);
  }
}

/**
 * 检查是否在原生 App 中（可选，用于调试）
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
```

---

### 步骤 2: 在 Service 层集成（15 分钟）

修改 `src/remindMe/services/reminderService.ts`：

```typescript
// 在文件顶部添加导入
import { notifyNativeTaskCreated, notifyNativeTaskDeleted, type TaskReminderData } from '../../utils/nativeTaskEvents';

/**
 * 将 Task 对象转换为原生提醒数据格式
 */
function taskToNativeReminder(task: Task, userId: string): TaskReminderData {
  return {
    id: task.id,
    user_id: userId,
    title: task.text,
    reminder_date: task.date || '',
    time: task.time || '',
    timezone: task.timezone || undefined,
    description: undefined, // 如果有 description 字段可以添加
    status: task.completed ? 'completed' : 'pending',
    called: task.called,
  };
}

/**
 * Create a new reminder
 * 🆕 自动触发原生提醒事件
 */
export async function createReminder(
  task: Omit<Task, 'id' | 'displayTime'>,
  userId: string
): Promise<Task | null> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  // ... 现有的创建逻辑（保持不变）
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const sessionUser = userData?.user;

  if (userError) {
    console.warn('⚠️ Failed to read Supabase user', userError);
  }
  if (!sessionUser) {
    console.error('❌ Supabase 会话缺失，无法创建任务（需要有效的 auth user 以满足外键约束）');
    return null;
  }
  if (userId && sessionUser.id !== userId) {
    console.warn('⚠️ Supabase 会话 userId 与传入的 userId 不一致，将使用会话 userId 以满足 FK 约束');
  }

  const ensured = await ensureUserProfileExists(sessionUser);
  if (!ensured) {
    console.error('❌ 无法同步用户到 users 表，任务创建已中止');
    return null;
  }

  const effectiveUserId = sessionUser.id;
  const dbRecord = taskToDb(task, effectiveUserId);

  const { data, error } = await supabase
    .from('tasks')
    .insert([dbRecord] as any)
    .select()
    .single();

  if (error) {
    console.error('Error creating reminder:', error);
    return null;
  }

  const createdTask = dbToTask(data as TaskRecord);

  // 🆕 自动触发原生提醒事件（如果有提醒时间）
  if (createdTask && createdTask.date && createdTask.time) {
    notifyNativeTaskCreated(taskToNativeReminder(createdTask, effectiveUserId));
  }

  return createdTask;
}

/**
 * Update an existing reminder
 * 🆕 如果修改了时间，重新设置原生提醒
 */
export async function updateReminder(
  id: string,
  updates: Partial<Task>
): Promise<Task | null> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  // ... 现有的更新逻辑（保持不变）
  const dbUpdates: Partial<TaskRecord> = {};

  if (updates.text !== undefined) dbUpdates.title = updates.text;
  if (updates.time !== undefined) dbUpdates.time = updates.time;
  if (updates.displayTime !== undefined) dbUpdates.display_time = updates.displayTime;
  if (updates.date !== undefined) dbUpdates.reminder_date = updates.date;
  if (updates.timezone !== undefined) dbUpdates.timezone = updates.timezone || null;
  if (updates.completed !== undefined) {
    dbUpdates.status = updates.completed ? 'completed' : 'pending';
  }
  if (updates.type !== undefined) dbUpdates.task_type = updates.type;
  if (updates.category !== undefined) dbUpdates.time_category = updates.category || null;
  if (updates.called !== undefined) dbUpdates.called = updates.called;
  if (updates.isRecurring !== undefined) dbUpdates.is_recurring = updates.isRecurring;
  if (updates.recurrencePattern !== undefined) dbUpdates.recurrence_pattern = updates.recurrencePattern || null;
  if (updates.recurrenceDays !== undefined) dbUpdates.recurrence_days = updates.recurrenceDays || null;
  if (updates.recurrenceEndDate !== undefined) dbUpdates.recurrence_end_date = updates.recurrenceEndDate || null;

  const { data, error } = await supabase
    .from('tasks')
    .update(dbUpdates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating reminder:', error);
    return null;
  }

  const updatedTask = dbToTask(data as TaskRecord);

  // 🆕 如果修改了时间，重新设置原生提醒
  if (updatedTask && (updates.date !== undefined || updates.time !== undefined)) {
    if (updatedTask.date && updatedTask.time) {
      // 获取 userId
      const { data: taskData } = await supabase
        .from('tasks')
        .select('user_id')
        .eq('id', id)
        .single();

      if (taskData) {
        notifyNativeTaskCreated(taskToNativeReminder(updatedTask, taskData.user_id));
      }
    }
  }

  return updatedTask;
}

/**
 * Delete a reminder
 * 🆕 自动取消原生提醒
 */
export async function deleteReminder(id: string): Promise<boolean> {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return false;
  }

  // 🆕 先取消原生提醒
  notifyNativeTaskDeleted(id);

  // 然后删除数据库记录
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting reminder:', error);
    return false;
  }

  return true;
}

/**
 * Toggle reminder completion status
 * 🆕 完成任务时取消原生提醒
 */
export async function toggleReminderCompletion(
  id: string,
  completed: boolean
): Promise<Task | null> {
  const result = await updateReminder(id, { completed });

  // 🆕 如果任务被标记为完成，取消原生提醒
  if (result && completed) {
    notifyNativeTaskDeleted(id);
  }

  return result;
}
```

---

### 步骤 3: 测试（5 分钟）

#### 测试 1: 浏览器测试

在浏览器开发者工具中运行：

```javascript
// 测试触发任务创建事件
window.dispatchEvent(new CustomEvent('mindboat:taskCreated', {
  detail: {
    task: {
      id: 'test-123',
      user_id: 'user-001',
      title: '测试任务',
      reminder_date: '2025-12-05',
      time: '14:30',
      timezone: 'Asia/Shanghai'
    }
  }
}));

// 应该在控制台看到：📱 已触发 mindboat:taskCreated 事件
```

#### 测试 2: Android App 测试

1. 在 Android App 中创建一个任务
2. 等待 2 分钟（如果设置了 2 分钟后的提醒）
3. 应该收到来电界面提醒

#### 测试 3: 完整流程测试

```typescript
// 在你的应用中创建一个测试任务
import { notifyNativeTaskCreated } from './utils/nativeTaskEvents';

function testNativeReminder() {
  const now = new Date();
  const reminderTime = new Date(now.getTime() + 2 * 60 * 1000); // 2分钟后

  const testTask = {
    id: 'test-' + Date.now(),
    user_id: 'test-user',
    title: '测试提醒（2分钟后）',
    reminder_date: reminderTime.toISOString().split('T')[0],
    time: reminderTime.toTimeString().slice(0, 5),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  };

  notifyNativeTaskCreated(testTask);
  console.log('✅ 已设置测试提醒，请等待 2 分钟');
}
```

---

## 📊 与登录模式的对比

### 登录/登出事件（现有）

```typescript
// AuthContext.tsx
function notifyNativeLogout(): void {
  try {
    const event = new CustomEvent('mindboat:nativeLogout', {
      bubbles: true,
      cancelable: false,
    });
    window.dispatchEvent(event);
  } catch (error) {
    console.error('❌ 触发登出事件失败:', error);
  }
}
```

### 任务提醒事件（新增）

```typescript
// nativeTaskEvents.ts
export function notifyNativeTaskCreated(task: TaskReminderData): void {
  try {
    const event = new CustomEvent('mindboat:taskCreated', {
      detail: { task },
      bubbles: true,
      cancelable: false,
    });
    window.dispatchEvent(event);
  } catch (error) {
    console.error('❌ 触发任务创建事件失败:', error);
  }
}
```

**相同点：**
- ✅ 使用 CustomEvent
- ✅ `bubbles: true, cancelable: false`
- ✅ 使用 `mindboat:` 命名空间
- ✅ try-catch 错误处理
- ✅ 开发环境日志

**不同点：**
- ⚠️ 任务事件携带数据（`detail: { task }`）
- ⚠️ 登出事件不携带数据

---

## 🎯 优势

### 1. 架构一致性
```
现有：mindboat:nativeLogin / mindboat:nativeLogout
新增：mindboat:taskCreated / mindboat:taskDeleted
      👆 完全一致的命名和模式！
```

### 2. 维护简单
- 只需理解一种原生通信模式
- 新开发者学习成本低
- 代码结构清晰统一

### 3. 跨平台友好
```typescript
// Android 监听（已完成）
window.addEventListener('mindboat:taskCreated', (event) => {
  window.AndroidBridge.onTaskCreated(JSON.stringify(event.detail.task));
});

// iOS 未来实现（使用相同模式）
window.addEventListener('mindboat:taskCreated', (event) => {
  window.webkit.messageHandlers.nativeApp.postMessage({
    action: 'setTaskReminder',
    task: event.detail.task
  });
});
```

### 4. 低风险
- ✅ 不修改现有架构
- ✅ 不影响浏览器运行
- ✅ 不影响 iOS 端
- ✅ 向后兼容

---

## 🔍 完整事件流程

### 创建任务

```
用户在 UI 点击"创建任务"
         ↓
调用 createReminder(task, userId)
         ↓
保存到 Supabase tasks 表
         ↓
调用 notifyNativeTaskCreated(task)
         ↓
触发 CustomEvent('mindboat:taskCreated')
         ↓
Android 监听器捕获事件
         ↓
调用 window.AndroidBridge.onTaskCreated()
         ↓
调用 TaskAlarmScheduler.scheduleReminder()
         ↓
设置 AlarmManager 精确提醒
         ↓
✅ 完成！
```

### 删除任务

```
用户在 UI 点击"删除任务"
         ↓
调用 deleteReminder(taskId)
         ↓
调用 notifyNativeTaskDeleted(taskId)
         ↓
触发 CustomEvent('mindboat:taskDeleted')
         ↓
Android 监听器捕获事件
         ↓
调用 window.AndroidBridge.cancelTaskReminder()
         ↓
调用 TaskAlarmScheduler.cancelReminder()
         ↓
取消 AlarmManager 提醒
         ↓
从 Supabase 删除任务
         ↓
✅ 完成！
```

---

## ⚠️ 注意事项

### 1. 时间格式

```typescript
// ✅ 正确
{
  reminder_date: "2025-12-05",   // YYYY-MM-DD
  time: "14:30",                 // HH:mm (24小时制)
  timezone: "Asia/Shanghai"      // IANA 时区字符串
}

// ❌ 错误
{
  reminder_date: "12/05/2025",   // 格式错误
  time: "2:30 PM",               // 不支持12小时制
  timezone: "GMT+8"              // 不是 IANA 格式
}
```

### 2. 必填字段

必须包含以下字段才会触发原生提醒：
- `id` - 任务 ID
- `user_id` - 用户 ID
- `title` - 任务标题
- `reminder_date` - 提醒日期
- `time` - 提醒时间

### 3. 幂等性

原生端的取消操作是幂等的：
```typescript
// 多次调用不会报错
notifyNativeTaskDeleted('task-123');
notifyNativeTaskDeleted('task-123'); // ✅ 安全
```

### 4. 错误处理

事件触发失败不会影响数据库操作：
```typescript
// 即使事件触发失败，任务仍会保存到数据库
const task = await createReminder(data, userId);
// ✅ task 仍然有值，Web 端提醒正常工作
```

---

## 🐛 调试技巧

### 开发环境日志

```typescript
// 在 nativeTaskEvents.ts 中已经包含
if (import.meta.env.DEV) {
  console.log('📱 已触发 mindboat:taskCreated 事件', task);
}
```

### 检查事件监听器

在浏览器控制台：
```javascript
// 手动添加监听器查看事件
window.addEventListener('mindboat:taskCreated', (e) => {
  console.log('收到任务创建事件:', e.detail);
});

// 手动触发测试
window.dispatchEvent(new CustomEvent('mindboat:taskCreated', {
  detail: {
    task: {
      id: 'test-123',
      user_id: 'user-001',
      title: '测试',
      reminder_date: '2025-12-05',
      time: '14:30'
    }
  }
}));
```

### Android Logcat

在 Android Studio 查看日志：
```
// 搜索关键词
TaskBridge           - JSBridge 相关日志
TaskAlarmScheduler   - 提醒调度日志
TaskAlarmReceiver    - 提醒触发日志
```

---

## 📦 文件清单

需要修改/创建的文件：

```
src/
├── utils/
│   └── nativeTaskEvents.ts        🆕 新建（事件工具类）
└── remindMe/
    └── services/
        └── reminderService.ts      ✏️ 修改（集成事件调用）
```

**不需要修改的文件：**
- ✅ UI 组件（TaskItem.tsx 等）- 无需修改
- ✅ 其他 service 文件 - 无需修改
- ✅ AuthContext.tsx - 无需修改

---

## 🎉 总结

### 实施清单

- [ ] 创建 `src/utils/nativeTaskEvents.ts`
- [ ] 修改 `src/remindMe/services/reminderService.ts`
  - [ ] 导入 `notifyNativeTaskCreated` 和 `notifyNativeTaskDeleted`
  - [ ] 在 `createReminder` 中添加事件触发
  - [ ] 在 `updateReminder` 中添加事件触发（时间修改时）
  - [ ] 在 `deleteReminder` 中添加事件触发
  - [ ] 在 `toggleReminderCompletion` 中添加事件触发（完成时）
- [ ] 测试浏览器环境
- [ ] 测试 Android App
- [ ] 更新团队文档

### 优势回顾

1. ✅ **架构一致性**：与登录/登出使用相同的 CustomEvent 模式
2. ✅ **低工作量**：30 分钟 - 1 小时完成集成
3. ✅ **低风险**：不影响现有功能，向后兼容
4. ✅ **易维护**：代码清晰，易于理解和扩展
5. ✅ **跨平台**：iOS 未来可用相同模式实现

---

**预估工作时间：30 分钟 - 1 小时**

**需要协调：** 无（Android 端已完成）

**风险等级：** 低 ✅
