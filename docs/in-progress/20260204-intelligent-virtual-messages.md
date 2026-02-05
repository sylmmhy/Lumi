# 智能虚拟消息系统 - AI Coach Guidance

> **状态**: 设计中
> **创建日期**: 2026-02-04
> **目标**: 让虚拟消息从"机械触发词"升级为"经过 AI 思考的智能建议"

---

## 1. 问题背景

### 当前问题

用户和 AI 聊天时，话题从"收拾行李"变成了"感情问题"。但当用户沉默 15 秒后，虚拟消息系统发送了 `[CHECK_IN] elapsed=1m`，AI 收到后回复："Maybe just start one tiny, easy thing to pack..."

**上下文断裂了** - AI 好像"失忆"，从感情话题突然跳回任务。

### 根本原因

当前虚拟消息系统只看**时间**，不看**上下文**：

```
当前：[CHECK_IN] elapsed=1m language=en-US
      ↓
AI 按触发词定义回复 → 问任务进度 → 上下文断裂
```

---

## 2. 解决方案：AI Coach Guidance

### 核心思路

在发送虚拟消息前，先让一个"AI 思考者"分析当前上下文，生成一张"小纸条"（Guidance），告诉 Gemini Live AI 应该怎么做。

### 架构图

```
用户沉默 15 秒...
         ↓
┌─────────────────────────────────────────────────────────────┐
│  🧠 AI 思考者 (generate-coach-guidance Edge Function)       │
│                                                             │
│  输入：                                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ • currentTopic: "感情"                               │   │
│  │ • userEmotion: "sad"                                │   │
│  │ • emotionIntensity: 0.7                             │   │
│  │ • recentMemories: ["男朋友不能一起去迪士尼", ...]    │   │
│  │ • conversationSummary: "用户想聊男朋友的事..."      │   │
│  │ • taskDescription: "收拾行李"                        │   │
│  │ • elapsedMinutes: 1                                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↓                                 │
│                    Gemini 3 Flash 思考                      │
│                           ↓                                 │
│  输出（小纸条）：                                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ "The user is sharing emotional struggles about      │   │
│  │  their boyfriend. They seem sad and need to be      │   │
│  │  heard first. DO NOT mention packing or the task.   │   │
│  │  Just listen and validate their feelings."          │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
         ↓
    发送给 Gemini Live AI（作为虚拟消息）
         ↓
    Gemini Live 根据"小纸条"自然回复
```

---

## 3. Edge Function 设计

### 3.1 函数信息

| 属性 | 值 |
|------|-----|
| **函数名** | `generate-coach-guidance` |
| **路径** | `supabase/functions/generate-coach-guidance/index.ts` |
| **模型** | Gemini 3 Flash (`gemini-3.0-flash`) |
| **输出语言** | 英文（默认） |

### 3.2 请求格式

```typescript
interface CoachGuidanceRequest {
  /** 用户 ID */
  userId: string;

  /** 当前检测到的话题 */
  currentTopic: string;

  /** 用户情绪 */
  userEmotion: 'happy' | 'sad' | 'anxious' | 'frustrated' | 'tired' | 'neutral';

  /** 情绪强度 (0-1) */
  emotionIntensity: number;

  /** 相关记忆（来自记忆检索） */
  recentMemories: Array<{
    content: string;
    tag: string;
  }>;

  /** 最近对话摘要 */
  conversationSummary: string;

  /** 用户最后说的话 */
  lastUserSpeech: string;

  /** 任务描述 */
  taskDescription: string;

  /** 任务已进行时间（分钟） */
  elapsedMinutes: number;

  /** 用户首选语言（用于 AI 回复时参考，但 guidance 本身用英文） */
  userPreferredLanguage?: string;
}
```

### 3.3 响应格式

```typescript
interface CoachGuidanceResponse {
  /** 给 Gemini Live 的指导（英文） */
  guidance: string;

  /** 建议的语气 */
  suggestedTone: 'empathetic' | 'encouraging' | 'gentle' | 'playful' | 'neutral';

  /** 应该避免的话题 */
  avoidTopics: string[];

  /** 建议的下一步动作 */
  nextAction: 'listen' | 'validate' | 'gentle_redirect' | 'encourage_task' | 'celebrate';

  /** 是否应该提及任务 */
  shouldMentionTask: boolean;
}
```

### 3.4 System Prompt 设计

```typescript
const SYSTEM_PROMPT = `You are an AI Coach advisor. Your job is to analyze the current conversation context and provide guidance for the frontline AI coach (Gemini Live) on how to respond.

## Your Role
- You observe the user's emotional state, conversation topic, and relevant memories
- You decide what the AI coach should do next
- You write a brief guidance note (the "小纸条") for the AI coach

## Output Requirements
- Write guidance in ENGLISH (the AI coach will respond in user's preferred language)
- Be specific and actionable
- Include what TO DO and what NOT TO DO
- Keep it concise (2-4 sentences max)

## Decision Framework

### When user is emotional (emotionIntensity > 0.5):
- Priority: Listen and validate feelings
- DO NOT push task-related topics
- Suggest empathetic responses

### When user is discussing off-topic but neutral:
- Gently acknowledge, then see if they want to refocus
- Don't force redirect

### When user seems ready for task:
- Encourage small steps
- Use their past successes as motivation

### When user shows resistance:
- Acknowledge the resistance
- Offer smaller alternatives
- Never be pushy

## Output Format
Return a JSON object with:
- guidance: string (the main instruction for AI coach)
- suggestedTone: "empathetic" | "encouraging" | "gentle" | "playful" | "neutral"
- avoidTopics: string[] (topics to avoid mentioning)
- nextAction: "listen" | "validate" | "gentle_redirect" | "encourage_task" | "celebrate"
- shouldMentionTask: boolean`
```

### 3.5 示例输入输出

**输入示例**:
```json
{
  "userId": "xxx",
  "currentTopic": "感情",
  "userEmotion": "sad",
  "emotionIntensity": 0.7,
  "recentMemories": [
    { "content": "User's boyfriend cannot join the Disneyland trip", "tag": "CONTEXT" },
    { "content": "User feels emotionally frozen when sad about relationships", "tag": "EMO" }
  ],
  "conversationSummary": "User started talking about packing for Disneyland, then shifted to discussing their complicated relationship with their boyfriend.",
  "lastUserSpeech": "It's complicated... our relationship is complicated.",
  "taskDescription": "Pack for Disneyland trip",
  "elapsedMinutes": 1,
  "userPreferredLanguage": "en-US"
}
```

**输出示例**:
```json
{
  "guidance": "The user is opening up about relationship struggles and feeling sad. They shifted away from packing because emotions are overwhelming them. DO: Listen actively, validate their feelings, ask open questions about what's on their mind. DO NOT: Mention packing, Disneyland, or try to redirect to the task right now.",
  "suggestedTone": "empathetic",
  "avoidTopics": ["packing", "Disneyland", "task", "luggage"],
  "nextAction": "listen",
  "shouldMentionTask": false
}
```

---

## 4. 前端集成

### 4.1 调用时机

在 `useVirtualMessages.ts` 中，当准备发送虚拟消息时：

```typescript
// 之前：直接发送触发词
const message = await generateTimeAwareMessage(category);
onSendMessage(message);

// 之后：先获取 AI guidance，再发送
const guidance = await fetchCoachGuidance({
  currentTopic: orchestrator.getContext().currentTopic,
  userEmotion: orchestrator.getContext().emotionalState,
  // ... 其他参数
});

// 发送 guidance 作为虚拟消息
onSendMessage(`[COACH_GUIDANCE] ${guidance.guidance}`);
```

### 4.2 新增触发词格式

```
[COACH_GUIDANCE] <guidance content>
```

需要在 Gemini Live 的 System Prompt 中添加对 `[COACH_GUIDANCE]` 的处理说明。

### 4.3 数据流

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端 (React)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  useVirtualMessages          useVirtualMessageOrchestrator      │
│       │                              │                          │
│       │ 定时触发                      │ 提供上下文               │
│       ▼                              ▼                          │
│  ┌─────────────────────────────────────────────┐               │
│  │        准备发送虚拟消息                      │               │
│  │                                             │               │
│  │  1. 从 Orchestrator 获取上下文              │               │
│  │     - currentTopic                          │               │
│  │     - userEmotion                           │               │
│  │     - conversationSummary                   │               │
│  │                                             │               │
│  │  2. 从 MemoryPipeline 获取相关记忆          │               │
│  │                                             │               │
│  │  3. 调用 generate-coach-guidance            │               │
│  │                                             │               │
│  │  4. 发送 guidance 给 Gemini Live            │               │
│  └─────────────────────────────────────────────┘               │
│                          │                                      │
└──────────────────────────│──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Supabase Edge Function                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  generate-coach-guidance                                        │
│       │                                                         │
│       │ 调用 Gemini 3 Flash                                   │
│       ▼                                                         │
│  ┌─────────────────────────────────────────────┐               │
│  │  分析上下文 → 生成 guidance                  │               │
│  └─────────────────────────────────────────────┘               │
│       │                                                         │
│       ▼                                                         │
│  返回 CoachGuidanceResponse                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Gemini Live System Prompt 更新

需要在 System Prompt 中添加对新触发词的处理：

```markdown
## [COACH_GUIDANCE] - AI Coach Guidance

When you receive a message starting with [COACH_GUIDANCE], this is internal guidance from the coaching system about how to respond.

**Rules:**
1. DO NOT repeat or mention the guidance content to the user
2. Follow the guidance naturally in your response
3. Respond in the user's preferred language (not English unless that's their preference)
4. The guidance tells you:
   - What emotional state the user is in
   - What topics to avoid
   - What approach to take

**Example:**
Input: [COACH_GUIDANCE] The user is feeling sad about their relationship. Listen and validate. Do not mention the task.

Your response: (in user's language, empathetically asking about their feelings, NOT mentioning any task)
```

---

## 6. 实现步骤

### Phase 1: 后端 (Edge Function)

- [ ] 创建 `generate-coach-guidance` Edge Function
- [ ] 配置 Gemini 3 Flash API 调用
- [ ] 编写 System Prompt
- [ ] 测试输入输出格式
- [ ] 部署到 Supabase

### Phase 2: 前端集成

- [ ] 在 `useVirtualMessages.ts` 中添加 guidance 获取逻辑
- [ ] 从 Orchestrator 获取上下文数据
- [ ] 集成记忆检索
- [ ] 修改虚拟消息发送逻辑

### Phase 3: Gemini Live 适配

- [ ] 更新 System Prompt，添加 `[COACH_GUIDANCE]` 处理说明
- [ ] 测试 AI 是否正确遵循 guidance
- [ ] 验证上下文不再断裂

---

## 7. 注意事项

### 延迟考虑

- Gemini 3 Flash 调用预计 500ms - 1.5s
- 用户在沉默中，这个延迟可接受
- 可以考虑在用户说话时就预先获取 guidance（预取优化）

### 成本考虑

- 每次虚拟消息触发一次 API 调用
- 使用 Flash 模型，成本较低
- 保持 15 秒冷却时间，避免频繁调用

### 失败处理

- 如果 API 调用失败，回退到简单的 `[CHECK_IN]` 触发词
- 添加超时处理（2 秒超时）

---

## 8. 成功指标

| 指标 | 目标 |
|------|------|
| 上下文断裂率 | 从 ~50% 降到 <10% |
| API 响应时间 | < 1.5s (P95) |
| 用户满意度 | AI 感觉"记得"之前聊的内容 |

---

## 9. 相关文件

| 文件 | 说明 |
|------|------|
| `supabase/functions/generate-coach-guidance/index.ts` | Edge Function (待创建) |
| `src/hooks/useVirtualMessages.ts` | 虚拟消息系统 (待修改) |
| `src/hooks/virtual-messages/useVirtualMessageOrchestrator.ts` | 调度器 (提供上下文) |
| `src/hooks/useGeminiSession.ts` | Gemini Live System Prompt (待更新) |
