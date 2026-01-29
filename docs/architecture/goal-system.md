# Goal 系统架构

> 最后更新：2026-01-29

本文档描述 Lumi 的 Goal（目标）系统架构，包括数据模型、关键流程和与其他系统的集成。

---

## 概述

Goal 系统允许用户设定生活目标（如"早睡"），并将其分解为多个 Routine 步骤。系统支持：

1. **动态调整** - 根据连续成功/失败自动调整目标难度
2. **来电提醒** - 通过关联 tasks 表触发 VoIP 来电
3. **每日报告** - AI 评分并生成个性化反馈

---

## 数据模型

### ER 图

```
┌─────────────┐       ┌─────────────────┐       ┌─────────────┐
│   users     │       │     goals       │       │    tasks    │
├─────────────┤       ├─────────────────┤       ├─────────────┤
│ id          │◄──────│ user_id         │       │ id          │
│ ai_tone     │       │ id              │       │ task_type   │
│ ...         │       │ name            │       │ title       │
└─────────────┘       │ goal_type       │       │ time        │
                      │ current_target  │       │ ...         │
                      │ ultimate_target │       └──────▲──────┘
                      │ consecutive_*   │              │
                      └────────┬────────┘              │
                               │                       │
                               │ 1:N                   │
                               ▼                       │
                      ┌─────────────────┐              │
                      │  goal_routines  │              │
                      ├─────────────────┤              │
                      │ goal_id         │──────────────┤
                      │ task_id         │──────────────┘
                      │ order_index     │
                      │ is_cutoff       │
                      └─────────────────┘
                               │
                               │ 关联记录
                               ▼
┌─────────────────┐   ┌─────────────────┐   ┌────────────────────┐
│  goal_entries   │   │daily_goal_reports│   │ daily_goal_scores │
├─────────────────┤   ├─────────────────┤   ├────────────────────┤
│ goal_id         │   │ user_id         │   │ report_id          │
│ entry_date      │   │ report_date     │   │ goal_id            │
│ completed       │   │ total_score     │   │ score              │
│ score           │   │ ai_summary      │   │ ai_feedback        │
│ ai_feedback     │   └─────────────────┘   │ routines_data      │
└─────────────────┘                         └────────────────────┘
```

### 表说明

| 表 | 用途 |
|----|------|
| `goals` | Life Goal 元数据 + 动态调整参数 |
| `goal_routines` | Goal 和 Task(routine) 的关联 |
| `goal_entries` | 每日 Goal 完成记录 + AI 评分 |
| `goal_adjustment_history` | 目标调整历史（回溯用） |
| `daily_goal_reports` | 每日早安报告主表 |
| `daily_goal_scores` | 每个 Goal 的评分详情 |

### 关键字段

**goals 表**
```sql
-- 动态调整参数
current_target_time      -- 当前目标时间（会被调整）
ultimate_target_time     -- 最终目标时间（用户想达到的）
baseline_time            -- 基线时间（不会回退超过这个）
adjustment_step_minutes  -- 每次调整幅度，默认 15 分钟
consecutive_success      -- 连续成功天数
consecutive_failure      -- 连续失败天数
success_threshold        -- 连续成功几天后提前目标，默认 3
failure_threshold        -- 连续失败几天后回退目标，默认 2
```

**goal_routines 表**
```sql
task_id     -- 关联到 tasks 表（task_type='routine'）
order_index -- 步骤顺序
is_cutoff   -- 是否是截止点（如"放下手机"）
```

---

## 关键流程

### 1. 创建 Goal

```
用户设定 Goal "早睡"
    │
    ├── 1. 创建 goal 记录
    │   INSERT INTO goals (name: "早睡", user_id, current_target_time: "23:00")
    │
    ├── 2. AI 分解出 Routine 步骤
    │   ├── 创建 tasks (task_type='routine', title="刷牙", time="22:00")
    │   ├── 创建 tasks (task_type='routine', title="洗澡", time="22:15")
    │   └── 创建 tasks (task_type='routine', title="上床", time="22:45")
    │
    └── 3. 建立关联
        INSERT INTO goal_routines (goal_id, task_id, order_index)
```

### 2. 每日 Routine 实例生成

```
每天凌晨 (现有逻辑，不改动)
    │
    └── generate_daily_routine_instances()
        └── 为每个 task_type='routine' 生成 routine_instance
            └── 到时间触发 VoIP 来电
```

### 3. 每日报告生成

```
每小时整点 (Cron: 0 * * * *)
    │
    ├── Cron 触发 generate-daily-report
    │
    ├── 遍历所有有活跃 Goal 的用户
    │   │
    │   ├── 获取用户时区（从 tasks 表最新的 task.timezone）
    │   │
    │   ├── 判断：用户时区现在是早上 7 点吗？
    │   │   ├── 否 → 跳过
    │   │   └── 是 → 继续
    │   │
    │   ├── 计算用户时区的"昨天"
    │   │
    │   ├── 获取 Goals + 关联的 routine_instance 完成情况
    │   │
    │   ├── AI 对每个 Goal 评分 (0-100)
    │   │   ├── 输入：步骤完成率 + 用户记忆 + AI 语气偏好
    │   │   └── 输出：score, status, feedback
    │   │
    │   ├── 计算综合得分
    │   │
    │   ├── 存入 daily_goal_reports + daily_goal_scores
    │   │
    │   └── 存入 goal_entries (更新 AI 评分字段)
    │
    └── 发送 OneSignal 推送通知（有 Goal 的用户）
```

### 4. 目标动态调整

```
每天早上 6:00 (daily-goal-adjustment)
    │
    ├── 检查昨天的 goal_entries
    │
    ├── 更新 consecutive_success / consecutive_failure
    │
    ├── 判断是否需要调整
    │   ├── 连续成功 >= 3 天 → 提前 15 分钟
    │   └── 连续失败 >= 2 天 → 回退 15 分钟
    │
    ├── 更新 goals.current_target_time
    │
    ├── 记录到 goal_adjustment_history
    │
    └── 发送通知告知用户
```

---

## 与其他系统的集成

### Tasks 表

Goal 系统通过 `goal_routines.task_id` 关联到 tasks 表：

- **不修改 tasks 表结构** - 通过关联表实现
- **复用现有推送逻辑** - routine_instance 正常触发 VoIP 来电
- **独立任务不受影响** - 没有关联到 goal_routines 的 task 保持独立

### 记忆系统

每日报告生成时会查询用户记忆：

- `PREF` 标签 - AI 交互偏好
- `EFFECTIVE` 标签 - 有效激励方式

用于个性化 AI 评分反馈。

### 推送系统

- `daily_report` 类型的通知存入 `user_notifications` 表
- 后续可集成 VoIP/FCM 推送

---

## Edge Functions

| Function | 触发时机 | 作用 |
|----------|----------|------|
| `daily-goal-adjustment` | 每天 6:00 | 动态调整目标 |
| `generate-daily-report` | 每天 7:00 | 生成每日报告 |

### Cron 配置

```sql
-- 目标调整（每天早上 6 点）
SELECT cron.schedule(
  'daily-goal-adjustment',
  '0 6 * * *',
  $$ SELECT net.http_post(...) $$
);

-- 每日报告（每天早上 7 点）
SELECT cron.schedule(
  'generate-daily-report',
  '0 7 * * *',
  $$ SELECT net.http_post(...) $$
);
```

---

## RPC 函数

| 函数 | 用途 |
|------|------|
| `get_user_goal_status(user_id)` | 获取用户目标进度（AI 系统指令用） |
| `record_goal_completion(...)` | 记录目标完成 |
| `get_daily_report(user_id, date)` | 获取每日报告 |
| `get_goal_routines_with_tasks(goal_id)` | 获取 Goal 的步骤详情 |

---

## 注意事项

1. **tasks 表不做修改** - 所有关联通过 goal_routines 表实现
2. **AI 评分有备选方案** - Azure AI 不可用时使用规则评分
3. **没有 Goal 的用户不发推送** - 避免骚扰
4. **时区处理** - 使用 task 级别的 timezone 字段
