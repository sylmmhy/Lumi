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


----------


另外一个ai对方案的点评：这个方案整体不错，我来逐点评价，以及指出一些可以改进的地方。
                                                      
  ---
  两个方案对比                                                                                     
  维度: 分阶段执行
  另一个 AI 的方案: 有，Phase 0~4，可以逐步验证                                                    
  我的方案: 只描述了目标结构，没有执行顺序                                                       
  ────────────────────────────────────────
  维度: 提到复用 useCampfireSession.ts
  另一个 AI 的方案: 有，这是一个实际的代码洞察
  我的方案: 没提到
  ────────────────────────────────────────
  维度: 提到两套 Gemini Live 共存
  另一个 AI 的方案: 有（Phase 4）
  我的方案: 没提到
  ────────────────────────────────────────
  维度: 回归测试策略
  另一个 AI 的方案: 有（Phase 0，用 DevTestPage）
  我的方案: 没提到
  ────────────────────────────────────────
  维度: startSession 的处理
  另一个 AI 的方案: 没有单独拆出来
  我的方案: 拆为 useSessionLifecycle
  ────────────────────────────────────────
  维度: 目录结构
  另一个 AI 的方案: 有（src/hooks/ai-coach-session/）
  我的方案: 有（src/hooks/ai-coach/）
  ---
  他的方案哪些地方做得好

  1. 分阶段执行（Phase 0~4） — 这比我的方案更务实。重构 1400 行的
  Hook，一步到位风险太高，分阶段可以每步都验证。

  2. Phase 0 定义"不可破坏的边界" — 很重要。先明确哪些东西不能改，然后每拆一步都回归测试。

  3. 提到 useCampfireSession.ts 可以复用 — 这说明他看了更多的上下文。如果已经有一个独立的篝火
  Hook，那拆分时应该优先考虑合并，而不是再造一个。

  4. Phase 4 提到两套 Gemini Live 共存 — 这是一个前瞻性的观察，虽然不急着做，但值得记录。

  ---
  他的方案哪些地方需要补充或修正

  1. startSession() 没有被单独拆出来 — 这是最大的遗漏

  startSession() 是这个文件里最重的函数（~250
  行），包含：摄像头重试、麦克风初始化、后端请求、Gemini
  连接、通话记录。他的方案里，这块逻辑会留在主 Hook 里，导致拆完后主 Hook 还是很长。

  建议：加一步，把 startSession 的硬件初始化 + 连接逻辑拆成 useSessionLifecycle（或者叫
  useSessionConnection）。

  2. 命名太啰嗦
  他的命名: useSessionMemoryPersistence
  更简洁的命名: useSessionMemory
  理由: "Persistence" 是多余的，保存记忆本身就是持久化
  ────────────────────────────────────────
  他的命名: useAICoachCampfireMode
  更简洁的命名: useCampfireMode
  理由: 已经在 ai-coach/ 目录下了，不需要前缀
  ────────────────────────────────────────
  他的命名: createTranscriptHandler
  更简洁的命名: useTranscriptProcessor
  理由: 它需要 Ref 和 state，不适合做工厂函数，应该是 Hook
  3. createTranscriptHandler 设计有问题

  他建议用 createTranscriptHandler(...) 作为非 Hook 的工厂函数。但这块逻辑内部使用了
  useRef（speechBuffer、去重 Set、角色跟踪），这意味着它必须是
  Hook，不能是普通函数。如果用工厂函数，要么丢失 Ref 管理，要么得用非标准的方式传递
  Ref，反而更复杂。

  4. 拆分优先级可以调整

  他建议的顺序：记忆保存 → 篝火 → 倒计时 → 转录

  我的建议顺序：
  ┌──────┬───────────────┬──────┬──────────────────────────────────────┐
  │ 顺序 │     模块      │ 行数 │                 理由                 │
  ├──────┼───────────────┼──────┼──────────────────────────────────────┤
  │ 1    │ types + utils │ ~90  │ 零风险，立即让文件变短               │
  ├──────┼───────────────┼──────┼──────────────────────────────────────┤
  │ 2    │ 篝火模式      │ ~240 │ 最大的独立块，拆掉后主文件直接少 1/3 │
  ├──────┼───────────────┼──────┼──────────────────────────────────────┤
  │ 3    │ 倒计时        │ ~80  │ 自洽性强，Ref 同步逻辑可以内聚       │
  ├──────┼───────────────┼──────┼──────────────────────────────────────┤
  │ 4    │ 记忆保存      │ ~180 │ 依赖 messages state，需要设计好接口  │
  ├──────┼───────────────┼──────┼──────────────────────────────────────┤
  │ 5    │ 转录处理      │ ~120 │ 和 Gemini Live 绑定最紧，最后拆      │
  ├──────┼───────────────┼──────┼──────────────────────────────────────┤
  │ 6    │ 会话生命周期  │ ~200 │ startSession 拆出来                  │
  └──────┴───────────────┴──────┴──────────────────────────────────────┘
  先拆篝火比先拆记忆更好，因为篝火模式的代码量最大（~240
  行），而且它有自己独立的状态、Ref、effect，和其他逻辑的耦合相对较低。

  5. 缺少对"虚拟消息两套系统"的处理建议

  现在文件里有两套虚拟消息系统同时运行（useVirtualMessages +
  useVirtualMessageOrchestrator）。他的方案只是描述了这个现状，但没有给出重构建议。

  长期来看应该合并为一套，但这属于功能重构而非文件组织重构，可以标记为 TODO。

  ---
  综合建议

  把两个方案合并，取长补短：

  1. 采用他的分阶段策略（Phase 0~4），但在 Phase 2 里加上 useSessionLifecycle 的拆分
  2. 采用我的目录结构和命名（更简洁）
  3. 调整拆分顺序：types/utils → 篝火 → 倒计时 → 记忆 → 转录 → 会话生命周期
  4. Phase 0 加上回归检查清单：能连上、能说话、倒计时正常、记忆能保存、篝火进出正常
  5. 先确认 useCampfireSession.ts 的内容，看看能否直接复用，避免重复