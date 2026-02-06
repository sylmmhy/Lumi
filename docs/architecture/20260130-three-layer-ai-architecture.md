---
title: "三层 AI 架构 - 绕过 Gemini Live Function Calling Bug"
created: 2026-01-30
updated: 2026-01-31 09:30
stage: "🚧 实现"
due: 2026-02-05
issue: ""
---

# 三层 AI 架构实现进度

## 阶段进度
- [x] 阶段 1：需求分析
- [x] 阶段 2：方案设计
- [x] 阶段 3：核心实现
- [x] 阶段 4：测试页面
- [ ] 阶段 5：完整测试
- [ ] 阶段 6：文档更新

---

## 1. 背景与目标

### 问题
Gemini Live 2.5/3 的 **Function Calling 有 bug**，在实时语音对话中调用 `sendToolResponse()` 会导致 WebSocket 连接断开。

### 目标
设计一个绕过 bug 的架构，让用户在语音对话中仍然可以使用工具功能（习惯叠加推荐、每日报告等）。

---

## 2. 方案设计

### 三层 AI 架构

```
┌─────────────────────────────────────────────────────────────┐
│                     前端 (React)                            │
│                                                             │
│  useGeminiLive          useIntentDetection                 │
│       │                        │                            │
│       │ 语音对话               │ 检测意图                   │
│       ▼                        ▼                            │
└───────┼────────────────────────┼────────────────────────────┘
        │                        │
        ▼                        ▼
┌───────────────┐        ┌───────────────┐        ┌───────────────┐
│  AI #1        │        │  AI #2        │        │  AI #3        │
│  Gemini Live  │        │  detect-intent│        │  分析 AI      │
│               │        │               │        │               │
│  实时语音对话  │  ───▶  │  意图检测     │  ───▶  │  执行分析     │
│  不用 tools   │        │  判断调工具   │        │  返回结果     │
└───────────────┘        └───────────────┘        └───────────────┘
                                                         │
                                                         ▼
                                              sendTextMessage()
                                                         │
                                                         ▼
                                              AI #1 继续对话
```

### 为什么不会断线？

| 方式 | 说明 | 结果 |
|------|------|------|
| Function Calling | Gemini 内部的特殊工具调用机制 | ❌ 断线 |
| Text Message | 普通文本消息，通过 `sendTextMessage()` | ✅ 正常 |

---

## 3. 实现记录

### 2026-01-30
- ✅ 创建 `detect-intent` Edge Function（AI #2 意图检测）
- ✅ 创建 `useIntentDetection` 前端 Hook
- ✅ 修改 `start-voice-chat`，不传 tools 给 Gemini Live
- ✅ 更新 `toolHandlers.ts`，修复 ESLint 错误
- ✅ 测试 `detect-intent` API，成功检测意图

### 2026-01-31
- ✅ 创建 `VoiceChatTest` 测试组件
- ✅ 添加到 `/dev` 测试页面
- ✅ 实现语音/文字双模式切换
- ✅ 实现 AI 主动开场白（连接后自动问候）
- ✅ 修复消息合并逻辑（避免一个字一个字显示）
- ✅ 优化 system prompt（区分目标和小习惯）
- ⚠️ `sendClientContent` 有 bug，改用 `sendTextMessage`

**已知问题**：
- `sessionRef.current.send is not a function` - sendClientContent 方法有问题
- 已通过改用 `sendTextMessage` 绕过

---

## 4. 关键文件

### 后端 (Lumi-supabase)
| 文件 | 作用 |
|------|-----|
| `supabase/functions/detect-intent/index.ts` | AI #2 意图检测 |
| `supabase/functions/start-voice-chat/index.ts` | 启动语音对话（不传 tools）|
| `supabase/functions/suggest-habit-stack/index.ts` | AI #3 习惯叠加推荐 |
| `supabase/functions/generate-daily-report/index.ts` | AI #3 每日报告 |

### 前端 (Lumi)
| 文件 | 作用 |
|------|-----|
| `src/hooks/ai-tools/useIntentDetection.ts` | 意图检测 Hook |
| `src/hooks/ai-tools/toolHandlers.ts` | 工具执行处理器 |
| `src/hooks/ai-tools/toolDefinitions.ts` | 工具定义 |
| `src/hooks/ai-tools/index.ts` | 统一导出 |
| `src/components/dev/VoiceChatTest.tsx` | **测试组件** |
| `src/pages/DevTestPage.tsx` | 测试页面（添加入口）|

---

## 5. VoiceChatTest 组件

### 功能
- 选择对话模式（习惯制定 / 日常对话）
- 连接 Gemini Live 进行语音对话
- 支持语音/文字双模式切换
- AI 主动开场白（随机英文问候）
- 显示对话记录（合并同角色消息）
- 集成三层 AI 意图检测

### UI 结构
```
┌─────────────────────────────────────┐
│ [← 退出]      [● LIVE]      [🎤/⌨️] │ 顶部状态栏
├─────────────────────────────────────┤
│                                     │
│              🔥 火焰动画             │
│           🔊 Lumi 正在说话...        │
│                                     │
├─────────────────────────────────────┤
│  对话记录（最近5条）                  │
│  - AI: xxx                          │
│  - 用户: xxx                        │
├─────────────────────────────────────┤
│  [输入框...] [发送]  (文字模式)      │
│       或                            │
│      [🎤]           (语音模式)       │
└─────────────────────────────────────┘
```

### 访问方式
1. 启动前端：`npm run dev`
2. 访问：`https://localhost:5173/dev`
3. 点击 **🎤 语音对话测试**

---

## 6. 待办事项

### 高优先级
- [ ] 修复 `sendClientContent` 方法（或确认用 `sendTextMessage` 即可）
- [ ] 测试完整的三层 AI 流程（用户说话 → 意图检测 → 工具执行 → 结果注入）
- [ ] 实现 `create_habit_stack` 完整逻辑

### 中优先级
- [ ] 优化开场白（更自然的问候）
- [ ] 添加对话历史持久化
- [ ] 添加错误重试机制

### 低优先级
- [ ] 添加语音波形动画
- [ ] 添加倒计时功能
- [ ] 集成到正式 App 流程

---

## 7. API 测试命令

### 测试意图检测
```bash
curl -X POST https://127.0.0.1:54321/functions/v1/detect-intent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -d '{
    "userMessages": ["我想养成吃维生素的习惯"],
    "aiResponse": "好的，让我看看你的习惯数据",
    "chatType": "intention_compile"
  }' \
  --insecure
```

### 测试启动语音对话
```bash
curl -X POST https://127.0.0.1:54321/functions/v1/start-voice-chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -d '{
    "userId": "11111111-1111-1111-1111-111111111111",
    "chatType": "intention_compile",
    "context": { "phase": "onboarding" }
  }' \
  --insecure
```

### 测试 Gemini Token
```bash
curl -X POST https://127.0.0.1:54321/functions/v1/gemini-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0" \
  -d '{"ttl": 1800}' \
  --insecure
```

---

## 8. 本地开发环境配置

### 前端 (.env.local)
```bash
VITE_SUPABASE_URL=https://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 后端 (supabase/.env.local)
```bash
GEMINI_API_KEY=your_gemini_api_key
```

### 启动命令
```bash
# 终端 1：启动 Supabase
cd ~/ai_agent/Lumi-Project/Lumi-supabase
supabase start
supabase functions serve --env-file supabase/.env.local

# 终端 2：启动前端
cd ~/ai_agent/Lumi-Project/Lumi
npm run dev
```

### 浏览器配置
访问 `https://127.0.0.1:54321` 并接受自签名证书警告

---

## 9. 相关 commit

- `feat: 三层AI架构 - detect-intent + start-voice-chat修改`
- `feat: 习惯叠加工具接入 start-voice-chat`
- `feat: VoiceChatTest 测试组件 + DevTestPage 集成`

---

**Author**: xieming
