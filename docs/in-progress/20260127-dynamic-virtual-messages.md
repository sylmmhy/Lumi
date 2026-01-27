---
title: "动态虚拟消息系统"
created: 2026-01-27
updated: 2026-01-27 15:00
stage: "📐 设计"
due: 2026-02-10
issue: ""
---

# 动态虚拟消息系统 实现进度

## 阶段进度
- [x] 阶段 1：需求分析
- [x] 阶段 2：方案设计
- [ ] 阶段 3：核心实现
- [ ] 阶段 4：测试验证
- [ ] 阶段 5：文档更新

---

## 1. 背景与目标

### 问题
当前虚拟消息系统的问题：
1. **无上下文感知**：虚拟消息不知道 Gemini Live 当前在聊什么
2. **静态模板**：使用固定的触发词格式，无法根据对话动态调整
3. **突兀感**：注入的消息可能与当前话题完全无关，导致 AI 突然换话题

### 目标
设计一个并行于 Gemini Live 的动态虚拟消息系统：
- **上下文感知**：知道当前对话的完整状态
- **动态生成**：LLM 根据上下文生成合适的指令
- **优先级队列**：紧急指令（如情绪响应）优先发送
- **冲突控制**：避免打断正在进行的对话

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      Gemini Live Session                        │
│               (System Instruction 只能设置一次)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ 实时对话
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│              对话上下文追踪器 (ConversationContextTracker)        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  • recentMessages: 最近 N 条消息                         │    │
│  │  • currentTopic: 当前话题                                │    │
│  │  • topicFlow: 话题流转历史                               │    │
│  │  • emotionalState: 情绪状态                              │    │
│  │  • conversationPhase: 对话阶段                           │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           │ 提供上下文
                           │
┌──────────────────────────▼──────────────────────────────────────┐
│            虚拟消息调度器 (VirtualMessageOrchestrator)           │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌──────────────┐  ┌─────────────────┐          │
│  │ 话题检测器  │  │ 异步记忆管道  │  │ 动态消息生成器   │          │
│  │(正则+关键词)│  │ (Mem0 检索)  │  │ (LLM 快速生成)  │          │
│  └─────┬──────┘  └──────┬───────┘  └────────┬────────┘          │
│        │                │                   │                   │
│        └────────────────┴───────────────────┘                   │
│                         │                                       │
│                         ▼                                       │
│              ┌─────────────────────┐                            │
│              │  消息队列 & 冲突控制  │                            │
│              │  (优先级排序、冷却期)  │                           │
│              └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
                           │
                           │ 注入虚拟消息
                           ▼
                    (sendTextMessage)
```

---

## 3. 对话上下文追踪器（核心补充）

### 3.1 类型定义

```typescript
// src/hooks/virtual-messages/types.ts

/**
 * 对话消息（简化版，用于上下文追踪）
 */
export interface ContextMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  /** 是否为虚拟消息触发的回复 */
  isVirtualTriggered?: boolean;
}

/**
 * 话题信息
 */
export interface TopicInfo {
  /** 话题标识 */
  id: string;
  /** 话题名称（用于显示） */
  name: string;
  /** 检测到的时间 */
  detectedAt: number;
  /** 相关关键词 */
  keywords: string[];
}

/**
 * 情绪状态
 */
export interface EmotionalState {
  /** 主要情绪 */
  primary: 'neutral' | 'happy' | 'sad' | 'anxious' | 'frustrated' | 'tired';
  /** 情绪强度 (0-1) */
  intensity: number;
  /** 检测到的时间 */
  detectedAt: number;
  /** 触发词 */
  trigger?: string;
}

/**
 * 对话阶段
 */
export type ConversationPhase =
  | 'greeting'        // 开场问候
  | 'exploring'       // 探索话题
  | 'deep_discussion' // 深入讨论
  | 'emotional'       // 情绪处理
  | 'wrapping_up'     // 收尾阶段
  | 'idle';           // 空闲

/**
 * 完整的对话上下文
 */
export interface ConversationContext {
  /** 最近 N 条消息 */
  recentMessages: ContextMessage[];

  /** 当前话题 */
  currentTopic: TopicInfo | null;

  /** 话题流转历史（最多保留 5 个） */
  topicFlow: TopicInfo[];

  /** 当前情绪状态 */
  emotionalState: EmotionalState;

  /** 对话阶段 */
  phase: ConversationPhase;

  /** AI 最后说的话 */
  lastAISpeech: string | null;

  /** 用户最后说的话 */
  lastUserSpeech: string | null;

  /** 对话开始时间 */
  sessionStartTime: number;

  /** 最后活动时间 */
  lastActivityTime: number;

  /** 对话摘要（由 LLM 定期生成） */
  summary?: string;
}

/**
 * 虚拟消息的用户上下文（发送给 LLM 生成消息时使用）
 */
export interface VirtualMessageUserContext {
  /** 任务描述 */
  taskDescription: string;

  /** 已用时间 */
  elapsedTime: string;

  /** 剩余时间 */
  remainingTime?: string;

  /** 用户最近说的话 */
  recentUserSpeech: string | null;

  /** AI 最近说的话 */
  recentAISpeech: string | null;

  /** 当前情绪 */
  currentEmotion: EmotionalState['primary'];

  /** 情绪强度 */
  emotionIntensity: number;

  /** 当前话题 */
  currentTopic: string | null;

  /** 话题流转（字符串数组） */
  topicFlow: string[];

  /** 对话阶段 */
  conversationPhase: ConversationPhase;

  /** 对话摘要 */
  conversationSummary?: string;

  /** 当前本地时间 */
  currentTime: string;
}
```

### 3.2 对话上下文追踪器 Hook

```typescript
// src/hooks/virtual-messages/useConversationContextTracker.ts

import { useRef, useCallback, useMemo } from 'react';
import type {
  ConversationContext,
  ContextMessage,
  TopicInfo,
  EmotionalState,
  ConversationPhase,
  VirtualMessageUserContext
} from './types';

interface UseConversationContextTrackerOptions {
  /** 保留的最近消息数量 */
  maxRecentMessages?: number;
  /** 保留的话题流转数量 */
  maxTopicHistory?: number;
  /** 任务描述 */
  taskDescription: string;
  /** 初始时长（秒） */
  initialDuration: number;
  /** 任务开始时间 */
  taskStartTime: number;
}

const DEFAULT_EMOTIONAL_STATE: EmotionalState = {
  primary: 'neutral',
  intensity: 0,
  detectedAt: 0,
};

/**
 * 对话上下文追踪器
 *
 * 职责：
 * - 追踪最近 N 条对话消息
 * - 追踪当前话题和话题流转
 * - 追踪用户情绪状态
 * - 推断对话阶段
 * - 生成供虚拟消息系统使用的上下文
 */
export function useConversationContextTracker(options: UseConversationContextTrackerOptions) {
  const {
    maxRecentMessages = 10,
    maxTopicHistory = 5,
    taskDescription,
    initialDuration,
    taskStartTime,
  } = options;

  // 使用 ref 存储上下文，避免频繁 re-render
  const contextRef = useRef<ConversationContext>({
    recentMessages: [],
    currentTopic: null,
    topicFlow: [],
    emotionalState: DEFAULT_EMOTIONAL_STATE,
    phase: 'greeting',
    lastAISpeech: null,
    lastUserSpeech: null,
    sessionStartTime: taskStartTime,
    lastActivityTime: taskStartTime,
  });

  /**
   * 添加用户消息
   */
  const addUserMessage = useCallback((content: string, isVirtualTriggered = false) => {
    const now = Date.now();
    const message: ContextMessage = {
      role: 'user',
      content,
      timestamp: now,
      isVirtualTriggered,
    };

    const ctx = contextRef.current;
    ctx.recentMessages = [...ctx.recentMessages, message].slice(-maxRecentMessages);
    ctx.lastUserSpeech = content;
    ctx.lastActivityTime = now;

    // 更新对话阶段
    updatePhase(ctx);

    if (import.meta.env.DEV) {
      console.log('📝 [ContextTracker] 添加用户消息:', content.substring(0, 50));
    }
  }, [maxRecentMessages]);

  /**
   * 添加 AI 消息
   */
  const addAIMessage = useCallback((content: string, isVirtualTriggered = false) => {
    const now = Date.now();
    const message: ContextMessage = {
      role: 'assistant',
      content,
      timestamp: now,
      isVirtualTriggered,
    };

    const ctx = contextRef.current;
    ctx.recentMessages = [...ctx.recentMessages, message].slice(-maxRecentMessages);
    ctx.lastAISpeech = content;
    ctx.lastActivityTime = now;

    // 更新对话阶段
    updatePhase(ctx);

    if (import.meta.env.DEV) {
      console.log('🤖 [ContextTracker] 添加 AI 消息:', content.substring(0, 50));
    }
  }, [maxRecentMessages]);

  /**
   * 更新当前话题
   */
  const updateTopic = useCallback((topic: TopicInfo) => {
    const ctx = contextRef.current;

    // 如果是新话题，添加到流转历史
    if (!ctx.currentTopic || ctx.currentTopic.id !== topic.id) {
      ctx.topicFlow = [...ctx.topicFlow, topic].slice(-maxTopicHistory);

      if (import.meta.env.DEV) {
        console.log('🏷️ [ContextTracker] 话题变更:', ctx.currentTopic?.name, '→', topic.name);
      }
    }

    ctx.currentTopic = topic;
  }, [maxTopicHistory]);

  /**
   * 更新情绪状态
   */
  const updateEmotionalState = useCallback((state: EmotionalState) => {
    const ctx = contextRef.current;
    ctx.emotionalState = state;

    // 如果检测到强烈情绪，进入情绪处理阶段
    if (state.intensity > 0.6 && state.primary !== 'neutral') {
      ctx.phase = 'emotional';
    }

    if (import.meta.env.DEV) {
      console.log('💭 [ContextTracker] 情绪更新:', state.primary, `(${state.intensity})`);
    }
  }, []);

  /**
   * 更新对话摘要
   */
  const updateSummary = useCallback((summary: string) => {
    contextRef.current.summary = summary;
    if (import.meta.env.DEV) {
      console.log('📋 [ContextTracker] 摘要更新:', summary);
    }
  }, []);

  /**
   * 内部：更新对话阶段
   */
  const updatePhase = (ctx: ConversationContext) => {
    const messageCount = ctx.recentMessages.length;
    const elapsed = Date.now() - ctx.sessionStartTime;
    const elapsedMinutes = elapsed / 1000 / 60;

    // 情绪优先
    if (ctx.emotionalState.intensity > 0.6 && ctx.emotionalState.primary !== 'neutral') {
      ctx.phase = 'emotional';
      return;
    }

    // 根据消息数量和时间推断阶段
    if (messageCount <= 2) {
      ctx.phase = 'greeting';
    } else if (messageCount <= 6) {
      ctx.phase = 'exploring';
    } else if (elapsedMinutes > initialDuration / 60 * 0.8) {
      // 超过 80% 时间，进入收尾阶段
      ctx.phase = 'wrapping_up';
    } else {
      ctx.phase = 'deep_discussion';
    }
  };

  /**
   * 获取当前上下文快照
   */
  const getContext = useCallback((): ConversationContext => {
    return { ...contextRef.current };
  }, []);

  /**
   * 生成供虚拟消息系统使用的用户上下文
   */
  const getVirtualMessageContext = useCallback((): VirtualMessageUserContext => {
    const ctx = contextRef.current;
    const now = Date.now();
    const elapsed = now - taskStartTime;
    const elapsedSeconds = Math.floor(elapsed / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const remainingSeconds = Math.max(0, initialDuration - elapsedSeconds);
    const remainingMinutes = Math.floor(remainingSeconds / 60);

    // 格式化当前时间
    const currentTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    return {
      taskDescription,
      elapsedTime: `${elapsedMinutes}m${elapsedSeconds % 60}s`,
      remainingTime: `${remainingMinutes}m${remainingSeconds % 60}s`,
      recentUserSpeech: ctx.lastUserSpeech,
      recentAISpeech: ctx.lastAISpeech,
      currentEmotion: ctx.emotionalState.primary,
      emotionIntensity: ctx.emotionalState.intensity,
      currentTopic: ctx.currentTopic?.name || null,
      topicFlow: ctx.topicFlow.map(t => t.name),
      conversationPhase: ctx.phase,
      conversationSummary: ctx.summary,
      currentTime,
    };
  }, [taskDescription, taskStartTime, initialDuration]);

  /**
   * 重置上下文
   */
  const resetContext = useCallback(() => {
    contextRef.current = {
      recentMessages: [],
      currentTopic: null,
      topicFlow: [],
      emotionalState: DEFAULT_EMOTIONAL_STATE,
      phase: 'greeting',
      lastAISpeech: null,
      lastUserSpeech: null,
      sessionStartTime: Date.now(),
      lastActivityTime: Date.now(),
    };
  }, []);

  return {
    addUserMessage,
    addAIMessage,
    updateTopic,
    updateEmotionalState,
    updateSummary,
    getContext,
    getVirtualMessageContext,
    resetContext,
  };
}
```

---

## 4. 消息协议设计

### 4.1 指令类型

| 类型 | 用途 | 优先级 | 触发条件 |
|------|------|--------|---------|
| `[EMPATHY]` | 情绪响应 | urgent | 检测到强烈情绪 |
| `[DIRECTIVE]` | 行为指令 | high | 需要引导 AI 行为 |
| `[CONTEXT]` | 记忆注入 | normal | 检索到相关记忆 |
| `[CHECKPOINT]` | 定时检查 | low | 定时触发 |

### 4.2 指令格式

每个指令都包含 `conversation_context` 字段，让 AI 知道当前对话状态：

```
[EMPATHY] emotion=sad intensity=0.8 trigger="失恋" current_time=15:34
conversation_context: 用户刚从"工作压力"话题转到"失恋"，AI 刚才问了"想聊聊发生什么吗"
action: 优先倾听和安慰，等情绪稳定后再轻柔地引导回任务。
```

```
[CONTEXT] type=memory topic="失恋"
conversation_context: 用户正在讨论失恋，情绪低落
memory: 用户曾说"每次失恋都会靠运动来转移注意力"
action: 自然地引用这段记忆，但不要打断当前的情感对话。等用户情绪稳定后再提及。
```

```
[CHECKPOINT] elapsed=2m remaining=3m current_time=15:36
conversation_context: 用户情绪已稳定，当前话题是"如何面对失恋"
last_ai_said: "失恋确实很难受，但你能正视它已经很勇敢了"
action: 轻柔地把话题引回任务，不要突然切换。
```

---

## 5. System Prompt 改造

在现有 System Prompt 基础上新增以下段落：

```
==================================================
DYNAMIC INSTRUCTION SYSTEM (Runtime Guidance)
==================================================
You will receive [DIRECTIVE], [CONTEXT], [CHECKPOINT], and [EMPATHY] messages during the conversation.
These are SYSTEM INSTRUCTIONS, not user speech. Process them silently and adjust your behavior accordingly.

CRITICAL: Each instruction includes a "conversation_context" field. This tells you:
- What topic the user was just discussing
- What you (AI) just said
- The user's current emotional state
- The overall conversation flow

Use this context to ensure your response feels natural and connected to the ongoing conversation.

## [EMPATHY] - Emotional Response (HIGHEST PRIORITY)
Format: [EMPATHY] emotion=X intensity=Y trigger="Z" current_time=HH:MM
conversation_context: ...
action: ...

When you receive this:
- emotion=sad → Be gentle, supportive, don't push the task
- emotion=anxious → Offer calm reassurance, suggest deep breaths
- emotion=frustrated → Acknowledge the frustration, offer simpler options
- emotion=tired → Validate tiredness, offer to adjust expectations

## [DIRECTIVE] - Action Commands
Format: [DIRECTIVE] action=X current_time=HH:MM
conversation_context: ...

Available actions:
- action=encourage → Give a gentle push, but respect the conversation flow
- action=topic_shift target=Y → Gradually transition to topic Y
- action=listen_first → Enter listening mode, pause task-related suggestions
- action=celebrate → Celebrate an achievement

## [CONTEXT] - Memory Injection
Format: [CONTEXT] type=memory topic="X"
conversation_context: ...
memory: ...
action: ...

When incorporating memories:
- NEVER read verbatim. Paraphrase naturally.
- Respect the current emotional state
- Wait for an appropriate moment in the conversation

## [CHECKPOINT] - Timed Check-in
Format: [CHECKPOINT] elapsed=Xm remaining=Ym current_time=HH:MM
conversation_context: ...
last_ai_said: ...
action: ...

Use this to:
- Gently remind about time if appropriate
- Adjust your approach based on remaining time
- Respect the ongoing conversation topic

## CRITICAL RULES
1. NEVER speak the instruction syntax out loud
2. NEVER say "I received a directive..." or "According to the context..."
3. Priority order: EMPATHY > DIRECTIVE > CHECKPOINT > CONTEXT
4. ALWAYS use conversation_context to ensure continuity
5. If context shows emotional discussion, don't abruptly switch topics
```

---

## 6. 文件结构

### 新增文件

```
src/hooks/virtual-messages/
├── index.ts                              # 导出入口
├── types.ts                              # 类型定义 ⭐
├── constants.ts                          # 话题规则、情绪词库
├── useConversationContextTracker.ts      # 对话上下文追踪器 ⭐⭐⭐
├── useVirtualMessageOrchestrator.ts      # 核心调度器
├── useVirtualMessageQueue.ts             # 消息队列 + 冲突控制
├── useTopicDetector.ts                   # 话题/情绪检测
└── useAsyncMemoryPipeline.ts             # 异步记忆检索

supabase/functions/
├── generate-dynamic-message/             # 新增：LLM 快速生成
│   └── index.ts
└── get-system-instruction/
    └── index.ts                          # 修改：添加 Dynamic Instruction 段落
```

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/hooks/useVirtualMessages.ts` | 重构为薄包装层，调用新系统 |
| `src/hooks/useAICoachSession.ts` | 集成 ConversationContextTracker |
| `supabase/functions/get-system-instruction/index.ts` | 添加 Dynamic Instruction 段落 |
| `supabase/functions/memory-extractor/index.ts` | 添加 search_by_topic 功能 |

---

## 7. 数据流示例

### 场景：用户说"因为我失恋了"

```
时间线:
───────────────────────────────────────────────────────────────────────

T+0s    用户说话
        │
        ▼
        userSpeechBufferRef 累积: "因为我失恋了"
        │
        ├──► ConversationContextTracker.addUserMessage("因为我失恋了")
        │    更新: lastUserSpeech = "因为我失恋了"
        │
        └──► TopicDetector 检测到 "失恋"
             → topic: 'breakup', emotion: 'sad', intensity: 0.8
             │
             ├──► ConversationContextTracker.updateTopic({ id: 'breakup', name: '失恋' })
             │    更新: currentTopic, topicFlow
             │
             └──► ConversationContextTracker.updateEmotionalState({ primary: 'sad', intensity: 0.8 })
                  更新: emotionalState, phase = 'emotional'

───────────────────────────────────────────────────────────────────────

T+100ms 生成 [EMPATHY] 指令（优先级最高）
        │
        ├──► getVirtualMessageContext() 获取当前上下文
        │    {
        │      recentUserSpeech: "因为我失恋了",
        │      recentAISpeech: "想聊聊发生什么吗",
        │      currentEmotion: "sad",
        │      emotionIntensity: 0.8,
        │      currentTopic: "失恋",
        │      topicFlow: ["工作压力", "失恋"],
        │      conversationPhase: "emotional"
        │    }
        │
        └──► 生成消息:
             [EMPATHY] emotion=sad intensity=0.8 trigger="失恋" current_time=15:34
             conversation_context: 用户从"工作压力"话题转到"失恋"，AI刚问"想聊聊发生什么吗"
             action: 优先倾听和安慰，不要催任务

───────────────────────────────────────────────────────────────────────

T+200ms 入队并发送
        │
        └──► Queue.enqueue({ type: 'EMPATHY', priority: 'urgent', ... })
             → 立即发送（urgent 优先级）
             → sendTextMessage(message)

───────────────────────────────────────────────────────────────────────

T+300ms 同时触发异步记忆检索（非阻塞）
        │
        └──► AsyncMemoryPipeline.fetchMemoriesForTopic('breakup', ['失恋', '分手', '前任'])
             → 后台执行，不阻塞主流程

───────────────────────────────────────────────────────────────────────

T+1s    AI 收到 [EMPATHY] 后开始回应
        │
        └──► AI 说: "失恋真的很难受...我在这里陪你"
             │
             └──► ConversationContextTracker.addAIMessage("失恋真的很难受...")
                  更新: lastAISpeech

───────────────────────────────────────────────────────────────────────

T+2.5s  记忆检索完成
        │
        └──► 找到记忆: "用户曾说每次失恋都靠运动转移注意力"
             │
             └──► 生成 [CONTEXT] 指令:
                  [CONTEXT] type=memory topic="失恋"
                  conversation_context: 用户正在讨论失恋，AI 刚说"我在这里陪你"
                  memory: 用户曾说每次失恋都靠运动转移注意力
                  action: 等情绪稳定后再自然引用

───────────────────────────────────────────────────────────────────────

T+3s    入队 [CONTEXT]
        │
        └──► Queue.enqueue({ type: 'CONTEXT', priority: 'normal', ... })
             → 等待冷却期
             → AI 说完话后发送
```

---

## 8. 实现步骤

### Phase 1: 基础设施（1-2天）
- [ ] 创建 `src/hooks/virtual-messages/` 目录结构
- [ ] 实现 `types.ts` 类型定义
- [ ] 实现 `useConversationContextTracker.ts` 对话上下文追踪器
- [ ] 实现 `useVirtualMessageQueue.ts` 消息队列

### Phase 2: 核心功能（2-3天）
- [ ] 实现 `constants.ts` 话题规则、情绪词库
- [ ] 实现 `useTopicDetector.ts` 话题检测
- [ ] 实现 `useAsyncMemoryPipeline.ts` 异步记忆管道
- [ ] 创建 `generate-dynamic-message` Edge Function

### Phase 3: 整合（1-2天）
- [ ] 实现 `useVirtualMessageOrchestrator.ts` 核心调度器
- [ ] 修改 `get-system-instruction` 添加指令接收机制
- [ ] 重构 `useVirtualMessages.ts` 为薄包装层
- [ ] 集成到 `useAICoachSession.ts`

### Phase 4: 测试与优化（1-2天）
- [ ] 端到端测试：话题检测 → 记忆检索 → 消息注入
- [ ] 性能测试：确保总延迟 < 5 秒
- [ ] 边界情况处理：快速连续话题、网络错误等

---

## 9. 性能目标

| 操作 | 目标延迟 | 策略 |
|------|---------|------|
| 话题检测 | < 50ms | 客户端正则匹配 |
| 上下文获取 | < 10ms | 内存读取，无网络 |
| 记忆检索 | < 3s | 异步+缓存 |
| LLM 生成 | < 2s | 快速模型、限制 tokens |
| 队列处理 | < 100ms | 内存队列、优先级排序 |
| **端到端** | **< 5s** | 并行处理 |

---

## 10. 关键风险与缓解

| 风险 | 后果 | 缓解措施 |
|------|------|---------|
| LLM 生成太慢 | 延迟 > 5s | 使用更快模型、限制长度、缓存常见响应 |
| 消息冲突 | AI 被打断 | 状态机 + VAD 检测 + 冷却时间 |
| 记忆检索失败 | 无法个性化 | 降级到固定模板、错误重试 |
| 上下文过期 | 信息不准确 | 实时更新、时间戳检查 |

---

## 11. 相关 commit
...
