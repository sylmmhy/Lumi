# 功能：任务「跳过今天」(Skip for Day)

## 需求描述

在首页 `/app/home` 的任务卡片上：
1. 左滑显示黄色「Skip」按钮（在删除按钮左边）
2. 点击后弹窗确认：「是否跳过今天的 xxx 任务？」
3. 确认后，任务显示黄色「已跳过」标签
4. AI 今天不会打电话提醒这个任务
5. 支持 6 种语言

---

## 实现原理

**核心逻辑**：把 `called` 字段设为 `true`

后端检查是否打电话的条件：
```sql
WHERE t.called = false  -- 只打 called = false 的任务
```

所以前端点击"跳过今天"时，只需要 `called = true`，后端就不会打电话了。

**不需要后端改任何代码**，直接复用现有的 `called` 字段。

---

## 实现进度

### ✅ 前端部分（100% 完成）

| 文件 | 改动 | 状态 |
|------|------|------|
| `src/components/app-tabs/HomeView.tsx` | `handleSkipForDay` 设置 `called: true` | ✅ |
| `src/components/app-tabs/TaskItem.tsx` | 滑动 160px 显示两个按钮、确认弹窗、黄色标签 | ✅ |
| `src/components/app-tabs/TaskGroup.tsx` | 传递 `onSkipForDay` prop | ✅ |
| `src/locales/*.json` | 6 种语言翻译 | ✅ |

### ✅ 后端部分（无需改动）

后端已有 `AND t.called = false` 的条件，不需要任何改动。

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

### 数据流

1. 用户点击 Skip 按钮 → 显示确认弹窗
2. 确认 → 调用 `onSkipForDay(task)`
3. `HomeView.handleSkipForDay` → 设置 `task.called = true`
4. 调用 `onUpdateTask` → `reminderService.updateReminder`
5. 写入数据库 `called = true`
6. 后端检查 `called = false` 时跳过此任务

### 标签显示逻辑

```tsx
// 未完成且 called = true 表示被跳过
const isSkippedForToday = task.called === true && !task.completed;

{isSkippedForToday && (
  <span className="bg-[#FEF3C7] text-[#92400E]">
    {t('home.skipForDay.tag')}
  </span>
)}
```

---

## 完成后清理

- [x] 前端实现
- [x] 后端确认（无需改动）
- [ ] 测试功能
- [ ] 删除此文档或移动到 `implementation-log/`
