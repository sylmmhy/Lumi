# Lumi AI Agent - 开发日志

## 日期：2026-01-28  xieming
## 状态：🔄 In Progress（本地测试通过，待部署远程）

---

## 一、今日开发功能（本地测试通过）

### 1. 动态目标调整系统 ✅

基于 Active Inference 理论，实现了目标难度的自动调整机制。

**核心逻辑**：
- 连续成功 ≥ 3 天 → 目标提前 15 分钟（更难）
- 连续失败 ≥ 2 天 → 目标回退 15 分钟（更容易）

**边界保护**：
- 不会提前超过 `ultimate_target_time`（最终目标）
- 不会回退超过 `baseline_time`（用户原本的习惯）

**文件**：
| 文件 | 说明 |
|------|------|
| `supabase/functions/daily-goal-adjustment/index.ts` | Edge Function 主逻辑 |
| `supabase/migrations/20260128100000_create_user_notifications_table.sql` | 通知表 |
| `scripts/setup-cron-daily-adjustment.sql` | Cron 定时任务配置 |
| `scripts/test-goal-adjustment-data.sql` | 测试数据脚本 |
| `docs/features/dynamic_goal_adjustment.md` | 功能文档 |

**测试结果**：
```json
{
  "success": true,
  "adjustments_count": 2,
  "adjustments": [
    {"goal_name": "测试-早睡(应回退)", "type": "retreat", "from": "00:00", "to": "00:15", "reason": "连续失败 2 天"},
    {"goal_name": "测试-早睡(应提前)", "type": "advance", "from": "01:00", "to": "23:00", "reason": "连续成功 3 天，已达到最终目标！"}
  ]
}
```

---

### 2. OneSignal 推送通知集成 ✅

集成了 OneSignal 推送服务，用于发送 iOS 弹窗通知。

**通知类型**：

**目标回退通知**：
```
标题: 💪 Lumi 帮你调整了目标
内容: 连续两天没完成有点难坚持对吧～我把「早睡」的目标从 00:45 调整到 01:00 了，这次一定可以！
```

**目标提前通知**：
```
标题: 🎉 太棒了！目标升级
内容: 连续成功好几天了！我把「早睡」的目标从 01:00 提前到 00:45，继续加油～
```

**配置**：
```env
ONESIGNAL_APP_ID=4b7b85f3-9015-4d32-b3cf-dee88ede1945
ONESIGNAL_API_KEY=os_v2_app_...
```

---

### 3. 用户主动语音对话 API ✅

实现了用户主动发起语音对话的后端 API，使用 Gemini Live API。

**端点**：`POST /functions/v1/start-voice-chat`

**请求参数**：
```typescript
{
  userId: string,
  chatType: 'intention_compile' | 'daily_chat' | 'habit_checkin' | 'goal_review',
  context?: {
    phase?: 'onboarding' | 'goal' | 'routines' | 'confirm' | 'daily',
    goalType?: string,
    currentTargetTime?: string,
    // ...
  },
  aiTone?: 'gentle' | 'direct' | 'humorous' | 'tough_love'
}
```

**响应**：
```typescript
{
  success: true,
  sessionId: "uuid",
  geminiConfig: {
    apiKey: "xxx",
    model: "gemini-2.0-flash-exp",
    systemPrompt: "根据对话类型动态生成的 Prompt",
    voiceConfig: { voiceName: "Aoede" }
  }
}
```

**文件**：
| 文件 | 说明 |
|------|------|
| `supabase/functions/start-voice-chat/index.ts` | Edge Function |
| `docs/features/start_voice_chat.md` | API 文档 |

**测试结果**：
```bash
curl -X POST .../start-voice-chat -d '{"userId":"xxx","chatType":"intention_compile","context":{"phase":"onboarding"}}'

# 返回成功，包含 Gemini 配置和根据阶段生成的 System Prompt
```

---

### 4. Intention Compiler 对话流程优化 ✅

基于 Tolan App 的启发，重新设计了对话流程。

**问题**：原设计是开放式问"想聊什么"，用户没有聊天欲望。

**解决方案**：

**首次使用（Onboarding）**：
```
AI: "嘿～我是 Lumi，很高兴认识你！你最近有什么想改善的吗？比如作息、运动、学习之类的～"
User: "最近熬夜太多了，想早点睡"
AI: "熬夜确实伤身啊 😅 那你想几点睡觉呢？"
→ 继续引导设定计划
```

**日常使用（有目标后）**：
```
AI: "嘿～你今天的睡眠计划想怎么安排呢？还是按之前的 01:00 上床吗？"
User: "是的"
AI: "好的！我会按时提醒你的～ 除了睡眠，还有其他想改善的吗？比如早起、运动之类的～"
```

**关键改进**：
- AI 带着具体主题开场，不是漫无目的
- 确认后主动问是否有其他习惯想养成
- 能识别新习惯意图并开始引导

**文件**：
| 文件 | 说明 |
|------|------|
| `scripts/test-intention-compiler.ts` | 完整测试脚本 |

---

## 二、数据库表结构

### 已有的核心表（之前创建）

| 表名 | 说明 |
|------|------|
| `user_profiles` | 用户画像（昵称、AI偏好、自我认知） |
| `goals` | 目标管理 + 动态调整参数 |
| `goal_routines` | 目标关联的习惯（睡前习惯等） |
| `goal_entries` | 每日完成记录 |
| `goal_adjustment_history` | 目标调整历史 |
| `chat_sessions` | 对话记录 |

### 今日新增

| 表名 | 说明 |
|------|------|
| `user_notifications` | 用户通知（App 内显示） |

---

## 三、架构对应关系

根据 Lumi 5 层架构：

| Layer | 名称 | 今日进展 |
|-------|------|----------|
| Layer 1 | Planner (策略规划层) | ✅ Intention Compiler 对话优化 |
| Layer 2 | Memory (记忆层) | - |
| Layer 3 | Executor (执行层) | ✅ 动态目标调整、推送通知 |
| Layer 4 | Observer (观察层) | - |
| Layer 5 | Interface (交互层) | ✅ 语音对话 API (Gemini Live) |

---

## 四、待办事项

### 高优先级 (P0)
- [ ] 前端集成 `start-voice-chat` API
- [ ] 部署 `daily-goal-adjustment` 到远程并配置 Cron
- [ ] iOS App 集成 OneSignal SDK

### 中优先级 (P1)
- [ ] 对话中收集锚点习惯（习惯叠加前置）
- [ ] 习惯叠加推荐算法
- [ ] 对话结束后保存记录到数据库

### 低优先级 (P2)
- [ ] 用户时区处理
- [ ] 行为图谱分析（自动发现稳定锚点）
- [ ] 周末/节假日特殊处理

---

## 五、测试命令汇总

```bash
# 1. 启动本地 Supabase
supabase start

# 2. 重置数据库（应用所有迁移）
supabase db reset

# 3. 测试动态目标调整
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -f scripts/test-goal-adjustment-data.sql
supabase functions serve daily-goal-adjustment --env-file .env.local
curl -X POST https://127.0.0.1:54321/functions/v1/daily-goal-adjustment \
  -H "Authorization: Bearer eyJhbGci..." --insecure

# 4. 测试语音对话 API
supabase functions serve start-voice-chat --env-file .env.local
curl -X POST https://127.0.0.1:54321/functions/v1/start-voice-chat \
  -H "Authorization: Bearer eyJhbGci..." \
  -d '{"userId":"xxx","chatType":"daily_chat"}' --insecure

# 5. 测试 Intention Compiler 对话
GEMINI_API_KEY=xxx deno run --allow-net --allow-env scripts/test-intention-compiler.ts
```

---

## 六、环境变量配置

```env
# Gemini
GEMINI_API_KEY=AIzaSyC8F7XJxvvzeFBmSjG7mqOLhi3y9lDfQso

# OneSignal
ONESIGNAL_APP_ID=4b7b85f3-9015-4d32-b3cf-dee88ede1945
ONESIGNAL_API_KEY=os_v2_app_...

# Supabase (本地)
SUPABASE_URL=https://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=eyJhbGci...
```
