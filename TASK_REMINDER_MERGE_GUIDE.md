# Task 与 Reminder 合并指南

## ✅ 已完成的工作

### 1. 数据库迁移 ✅

**操作内容：**
- 为 `tasks` 表添加了所有 reminder 相关字段
- 删除了独立的 `reminders` 表
- 所有提醒功能现在统一使用 `tasks` 表

**新增字段列表：**

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `time` | VARCHAR | 提醒时间 (HH:mm 格式, 24小时制) |
| `display_time` | VARCHAR | 显示时间 (12小时制带 am/pm) |
| `reminder_date` | DATE | 提醒日期 |
| `completed_reminder` | BOOLEAN | 提醒任务是否完成 |
| `task_type` | TEXT | 任务类型: `todo` (一次性) 或 `routine` (重复任务) |
| `time_category` | TEXT | 时间分类: `morning`/`afternoon`/`evening` |
| `called` | BOOLEAN | AI 是否已经打电话提醒过用户 |
| `is_recurring` | BOOLEAN | 是否为重复任务 |
| `recurrence_pattern` | TEXT | 重复模式: `daily`/`weekly`/`monthly`/`custom` |
| `recurrence_days` | INTEGER[] | 每周重复的日期数组 (0=周日, 6=周六) |
| `recurrence_end_date` | DATE | 重复任务的结束日期 |

### 2. 服务层更新 ✅

**文件：** `src/remindMe/services/reminderService.ts`

**更新内容：**
- ✅ 将所有数据库操作从 `reminders` 表改为 `tasks` 表
- ✅ 更新了 `TaskRecord` 接口，匹配新的数据库结构
- ✅ 修改了 `dbToTask()` 函数：
  - 数据库的 `title` 字段 → Task 的 `text` 字段
  - 数据库的 `reminder_date` 字段 → Task 的 `date` 字段
  - 数据库的 `completed_reminder` 字段 → Task 的 `completed` 字段
  - 数据库的 `task_type` 字段 → Task 的 `type` 字段
  - 数据库的 `time_category` 字段 → Task 的 `category` 字段
- ✅ 修改了 `taskToDb()` 函数：实现反向映射
- ✅ 添加了详细的中文注释，方便后续维护

**所有函数已更新：**
- `fetchReminders()` - 获取指定日期的提醒
- `fetchRecurringReminders()` - 获取所有重复任务
- `createReminder()` - 创建新提醒
- `updateReminder()` - 更新提醒
- `deleteReminder()` - 删除提醒
- `toggleReminderCompletion()` - 切换完成状态
- `markReminderAsCalled()` - 标记为已打电话

### 3. 字段映射关系

#### 前端 Task 类型 ↔ 数据库 tasks 表

| Task 字段 | 数据库字段 | 说明 |
|-----------|-----------|------|
| `text` | `title` | 任务文本内容 |
| `time` | `time` | 时间 (HH:mm) |
| `displayTime` | `display_time` | 显示时间 (h:mm am/pm) |
| `date` | `reminder_date` | 提醒日期 |
| `completed` | `completed_reminder` | 是否完成 |
| `type` | `task_type` | 任务类型 (todo/routine) |
| `category` | `time_category` | 时间分类 |
| `called` | `called` | AI是否已打电话 |
| `isRecurring` | `is_recurring` | 是否重复 |
| `recurrencePattern` | `recurrence_pattern` | 重复模式 |
| `recurrenceDays` | `recurrence_days` | 重复日期 |
| `recurrenceEndDate` | `recurrence_end_date` | 重复结束日期 |

## 🎯 功能特性

### 当前支持的功能

✅ **基础提醒功能**
- 创建、读取、更新、删除任务
- 设置提醒时间和日期
- 标记任务完成状态

✅ **重复任务功能**
- 支持每日、每周、每月重复
- 可设置重复结束日期
- Routine 任务自动设置为每日重复

✅ **AI 打电话功能预留**
- `called` 字段用于标记 AI 是否已打电话
- 可配合后端定时任务实现自动提醒

✅ **跨设备同步**
- 所有数据存储在 Supabase
- 电脑和手机可以实时同步

## 📝 使用示例

### 创建一次性提醒（To-do）

```typescript
import { createReminder } from '@/remindMe/services/reminderService';

const task = await createReminder({
  text: '完成项目报告',
  time: '14:30',
  date: '2025-11-27',
  completed: false,
  type: 'todo',
  category: 'afternoon',
  called: false,
}, userId);
```

### 创建重复任务（Routine）

```typescript
const routineTask = await createReminder({
  text: '晨跑',
  time: '07:00',
  date: '2025-11-27',
  completed: false,
  type: 'routine',
  category: 'morning',
  called: false,
  isRecurring: true,
  recurrencePattern: 'daily',
}, userId);
```

### 获取今天的所有提醒

```typescript
import { fetchReminders } from '@/remindMe/services/reminderService';

const today = new Date().toISOString().split('T')[0]; // '2025-11-27'
const todayTasks = await fetchReminders(userId, today);
```

### 获取所有重复任务

```typescript
import { fetchRecurringReminders } from '@/remindMe/services/reminderService';

const routines = await fetchRecurringReminders(userId);
```

## 🔧 技术细节

### 为什么要合并 tasks 和 reminders？

**优势：**
1. **统一数据模型**：任务和提醒本质上是同一个概念，合并后更符合直觉
2. **跨设备同步**：使用单一数据源，电脑和手机可以无缝同步
3. **简化查询**：不需要关联多个表，查询更快速
4. **扩展性更好**：未来可以轻松添加新功能（如子任务、标签等）

### 数据库设计原则

1. **保留原有 tasks 表字段**：确保不影响现有功能
2. **添加 reminder 特有字段**：支持提醒和重复功能
3. **使用 NULL 允许字段**：不强制所有任务都有提醒时间
4. **清晰的字段命名**：如 `reminder_date`、`completed_reminder` 等

## 🚀 后续计划

### 短期计划
- [ ] 实现 AI 自动打电话功能
- [ ] 支持更多重复模式（如每周特定日期）
- [ ] 添加任务优先级排序

### 长期计划
- [ ] 支持子任务
- [ ] 支持任务标签和分类
- [ ] 智能任务时间建议
- [ ] 任务数据可视化分析

## ⚠️ 注意事项

1. **迁移前的数据**：如果之前 `reminders` 表中有数据，需要手动迁移
2. **字段映射**：前端使用 `Task.text`，数据库使用 `title`，注意映射关系
3. **类型安全**：使用 TypeScript 类型确保数据正确性
4. **错误处理**：所有数据库操作都有错误处理，返回 null 或空数组

## 📚 相关文件

- **服务层**: `src/remindMe/services/reminderService.ts`
- **类型定义**: `src/remindMe/types.ts`
- **页面组件**: `src/pages/AppTabsPage.tsx`
- **视图组件**: `src/components/app-tabs/HomeView.tsx`

---

**迁移完成日期**: 2025-11-26  
**迁移执行者**: AI Assistant  
**数据库**: Supabase PostgreSQL

