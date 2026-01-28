# 动态目标调整系统

## 概述

基于 Active Inference 理论，Lumi 会根据用户的完成情况自动调整目标难度：

- **连续成功 >= 3 天** -> 目标提前 15 分钟（更难）
- **连续失败 >= 2 天** -> 目标回退 15 分钟（更容易）

这个系统帮助用户建立渐进式的习惯，避免目标过于激进导致放弃，同时在用户表现好时逐步提高难度。

## 核心概念

```
Life Goal: "早睡" (goals 表)
    |
    +-- Habit Task: "刷牙" (goal_routines 表)
    +-- Habit Task: "洗澡" (goal_routines 表)
    +-- Habit Task: "敷面膜" (goal_routines 表)
    +-- Habit Task: "上床睡觉" (goal_routines 表)
```

## 工作流程

```
每天早上 (Cron 定时任务)
        |
        v
检查所有活跃目标
        |
        v
查看昨天的 goal_entries
        |
        v
+---------------------------------------+
|  完成? -> consecutive_success + 1     |
|  失败? -> consecutive_failure + 1     |
+---------------------------------------+
        |
        v
+---------------------------------------+
|  连续成功 >= 3 -> 目标提前 15 分钟     |
|  连续失败 >= 2 -> 目标回退 15 分钟     |
+---------------------------------------+
        |
        v
更新 goals 表
        |
        v
记录到 goal_adjustment_history
        |
        v
发送推送通知 (OneSignal) + 存储到 user_notifications
```

## 推送通知

### 目标回退通知（变容易）

```
标题: Lumi 帮你调整了目标
内容: 连续两天没完成有点难坚持对吧～我把「早睡」的目标从 00:45 调整到 01:00 了，这次一定可以！
```

### 目标提前通知（变难）

```
标题: 太棒了！目标升级
内容: 连续成功好几天了！我把「早睡」的目标从 01:00 提前到 00:45，继续加油～
```

## 数据库表

| 表名 | 用途 |
|------|------|
| `goals` | Life Goal（如"早睡"）+ 动态调整参数 |
| `goal_routines` | Habit Tasks（如刷牙、洗澡） |
| `goal_entries` | 每日完成记录 |
| `goal_adjustment_history` | 目标调整历史（回溯用） |
| `chat_sessions` | 对话管理，区分 chat_type |
| `user_notifications` | App 内通知 |

### goals 表关键字段

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `ultimate_target_time` | 最终目标（用户想达到的） | - |
| `current_target_time` | 当前目标（动态调整后的） | - |
| `baseline_time` | 基线（用户原来的习惯） | - |
| `adjustment_step_minutes` | 每次调整幅度 | 15 |
| `consecutive_success` | 连续成功天数 | 0 |
| `consecutive_failure` | 连续失败天数 | 0 |
| `success_threshold` | 成功阈值 | 3 |
| `failure_threshold` | 失败阈值 | 2 |

## 文件列表

| 文件 | 说明 |
|------|------|
| `supabase/functions/daily-goal-adjustment/index.ts` | Edge Function 主逻辑 |
| `supabase/migrations/20260129110000_create_goals_tables.sql` | 目标相关表 |
| `supabase/migrations/20260129120000_create_chat_sessions.sql` | 对话管理表 |
| `supabase/migrations/20260129130000_create_user_notifications.sql` | 通知表 |
| `supabase/migrations/20260129140000_goal_memory_integration.sql` | 集成 RPC 函数 |
| `scripts/setup-cron-daily-adjustment.sql` | Cron 定时任务配置 |
| `scripts/test-goal-adjustment-data.sql` | 测试数据 |

## 配置步骤

### 1. 应用迁移

```bash
# 本地测试
npx supabase db reset --local

# 验证表创建
docker exec supabase_db_firego-local psql -U postgres -d postgres -c "\dt public.goal*"
```

### 2. 部署 Edge Function

```bash
# 本地测试
npx supabase functions serve daily-goal-adjustment --env-file supabase/.env.local

# 部署到云端（需要用户授权）
npx supabase functions deploy daily-goal-adjustment
```

### 3. 配置 OneSignal（可选）

在 Supabase Dashboard -> Edge Functions -> Secrets 添加：

```
ONESIGNAL_APP_ID=你的 OneSignal App ID
ONESIGNAL_API_KEY=你的 OneSignal REST API Key
```

如果不配置 OneSignal，通知会存储到 `user_notifications` 表，App 可以从那里读取。

### 4. 配置 Cron 定时任务

在 Supabase Dashboard -> SQL Editor 运行 `scripts/setup-cron-daily-adjustment.sql`

**注意**：需要替换 SQL 文件中的：
- `YOUR_PROJECT_REF` -> 你的 Supabase 项目 ID
- `YOUR_SERVICE_ROLE_KEY` -> 你的 Service Role Key

## 本地测试

```bash
# 1. 启动本地 Supabase
npx supabase start

# 2. 应用迁移
npx supabase db reset --local

# 3. 插入测试数据
docker exec supabase_db_firego-local psql -U postgres -d postgres -f /app/scripts/test-goal-adjustment-data.sql

# 4. 启动 Edge Function
npx supabase functions serve daily-goal-adjustment --env-file supabase/.env.local

# 5. 调用测试
curl -X POST http://127.0.0.1:54321/functions/v1/daily-goal-adjustment \
  -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json"
```

## AI 语气偏好

用户可以在 ProfileView 中设置 AI 的说话风格：

| 语气 | 代码 | 说明 |
|------|------|------|
| 温柔鼓励 | `gentle` | 温暖体贴，正向激励 |
| 直接了当 | `direct` | 不兜圈子，坦诚相告 |
| 幽默搞笑 | `humorous` | 调皮逗趣，轻松活泼 |
| 毒舌损友 | `tough_love` | 嘴毒心善，用损激励 |

这个设置存储在 `users.ai_tone` 字段，并在 `get-system-instruction` Edge Function 中注入到 AI 的系统指令。

## 边界情况

### 不会无限回退

目标不会回退到比 `baseline_time` 还晚。

### 不会无限提前

目标不会提前到比 `ultimate_target_time` 还早。

## 与记忆系统的集成

目标状态通过 `get_user_goal_status` RPC 函数获取，并注入到 AI 系统指令中。AI 可以：

- 看到用户的活跃目标
- 看到最近 7 天的完成情况
- 根据用户的连胜/连败情况调整沟通方式
- 将当前任务与用户的长期目标关联起来

## TODO

- [ ] 考虑用户时区（目前假设 UTC）
- [ ] 添加"暂停调整"功能
- [ ] 周末/节假日特殊处理
- [ ] 调整幅度可配置（目前固定 15 分钟）
- [ ] 前端 UI 展示目标进度
