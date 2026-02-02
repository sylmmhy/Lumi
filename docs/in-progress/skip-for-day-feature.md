# 功能：任务「跳过今天」(Skip for Day)

## 需求描述

在首页 `/app/home` 的任务卡片上：
1. 左滑显示黄色「Skip」按钮（在删除按钮左边）
2. 点击后弹窗确认：「是否跳过今天的 xxx 任务？」
3. 确认后，任务显示黄色「已跳过」标签
4. AI 今天不会打电话提醒这个任务
5. 支持 6 种语言

---

## 实现进度

### ✅ 前端部分（100% 完成）

| 文件 | 改动 | 状态 |
|------|------|------|
| `src/remindMe/types.ts` | 添加 `skippedForDate?: string \| null` 字段 | ✅ |
| `src/remindMe/services/reminderService.ts` | TaskRecord 添加 `skipped_for_date`，dbToTask 映射，updateReminder 支持 | ✅ |
| `src/components/app-tabs/TaskItem.tsx` | 滑动 160px 显示两个按钮、确认弹窗、黄色标签 | ✅ |
| `src/components/app-tabs/TaskGroup.tsx` | 传递 `onSkipForDay` prop | ✅ |
| `src/components/app-tabs/HomeView.tsx` | 添加 `handleSkipForDay` 处理函数 | ✅ |
| `src/locales/en.json` | 英文翻译 | ✅ |
| `src/locales/zh.json` | 中文翻译 | ✅ |
| `src/locales/ja.json` | 日文翻译 | ✅ |
| `src/locales/ko.json` | 韩文翻译 | ✅ |
| `src/locales/es.json` | 西班牙语翻译 | ✅ |
| `src/locales/it.json` | 意大利语翻译 | ✅ |

**Lint 检查**：通过（0 errors, 13 warnings - 都是之前就存在的）

---

### ✅ 后端部分（100% 完成）

| 文件 | 改动 | 状态 |
|------|------|------|
| `migrations/20260202170000_add_skipped_for_date.sql` | 添加 `skipped_for_date` 列 | ✅ |
| `check_and_send_task_notifications()` | 排除 `skipped_for_date = CURRENT_DATE` 的任务 | ✅ |
| `check_task_on_insert()` trigger | 排除 `skipped_for_date = CURRENT_DATE` 的任务 | ✅ |

**迁移已应用到本地 Supabase**

---

## 多语言文案

| Key | EN | ZH |
|-----|----|----|
| `home.skipForDay.title` | Skip for Today? | 跳过今天？ |
| `home.skipForDay.message` | Lumi won't call you for "{{task}}" today. | Lumi 今天不会为「{{task}}」打电话给你。 |
| `home.skipForDay.confirm` | Skip | 跳过 |
| `home.skipForDay.tag` | Skipped | 已跳过 |

---

## 技术细节

### TaskItem 滑动逻辑变更

- **之前**：滑动 80px 显示红色删除按钮
- **现在**：滑动 160px 显示两个按钮
  - 左边：黄色 Skip 按钮（`bg-[#F59E0B]`，图标 `fa-forward`）
  - 右边：红色 Delete 按钮（`bg-red-500`，图标 `fa-trash-can`）

### 数据流

1. 用户点击 Skip 按钮 → 显示确认弹窗
2. 确认 → 调用 `onSkipForDay(task)`
3. `HomeView.handleSkipForDay` → 设置 `task.skippedForDate = 今天日期`
4. 调用 `onUpdateTask` → `reminderService.updateReminder`
5. 写入数据库 `skipped_for_date` 列

### 标签显示逻辑

```tsx
const isSkippedForToday = task.skippedForDate === getLocalDateString(new Date());

// 显示黄色标签
{isSkippedForToday && !task.completed && (
  <span className="bg-[#FEF3C7] text-[#92400E]">
    {t('home.skipForDay.tag')}
  </span>
)}
```

### 后端跳过逻辑

两个函数都添加了相同的过滤条件：

```sql
-- check_and_send_task_notifications(): cron job 定时检查
AND (t.skipped_for_date IS NULL OR t.skipped_for_date != CURRENT_DATE)

-- check_task_on_insert(): 插入/更新时即时触发
IF NEW.skipped_for_date = CURRENT_DATE THEN
  RAISE NOTICE '⏭️ Skipping task marked as skipped for today: %', NEW.title;
  RETURN NEW;
END IF;
```

---

## 完成后清理

- [x] 运行后端迁移
- [ ] 测试前端功能
- [ ] 测试 AI 是否正确跳过
- [ ] 删除此文档或移动到 `implementation-log/`
