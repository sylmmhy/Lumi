---
title: "动态虚拟消息系统"
created: 2026-01-27
updated: 2026-01-28 09:30
stage: "🔨 实现中"
due: 2026-02-10
issue: ""
---

# 动态虚拟消息系统 实现进度

## 阶段进度
- [x] 阶段 1：需求分析
- [x] 阶段 2：方案设计
- [x] 阶段 3：核心实现（基础设施）✅ 2026-01-28
  - [x] 创建 `_shared/memory-retrieval.ts` 共享模块
  - [x] 创建 `retrieve-memories` Edge Function
  - [x] 创建前端 `virtual-messages` hooks
  - [ ] 修改 `get-system-instruction` 使用共享模块（可选）
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
【有效激励】用户说运动能帮助转移注意力
【过往经历】用户上次失恋后去跑步，感觉好多了
【行为模式】用户情绪低落时喜欢安静独处
action: 自然地引用这段记忆，但不要打断当前的情感对话。等用户情绪稳定后再提及。
```

```
[CONTEXT] type=memory topic="旅行"
conversation_context: 用户正在讨论周末旅行计划，情绪兴奋
【过往经历】用户去过优胜美地露营，玩得很开心
【用户偏好】用户喜欢自驾游
【近期计划】用户周末要去迪士尼
【行为模式】用户旅行前会纠结行李
action: 像朋友一样自然地提起这些记忆，增强亲密感。
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
【有效激励】...
【过往经历】...
【用户偏好】...
【近期计划】...
【行为模式】...
action: ...

Memory categories explained:
- 【有效激励】(EFFECTIVE) - Methods that have worked before to motivate the user
- 【过往经历】(Past experiences) - Things the user has done/experienced before
- 【用户偏好】(Preferences) - User's likes, dislikes, and preferences
- 【近期计划】(Recent plans) - Upcoming events or plans the user mentioned
- 【行为模式】(Behavior patterns) - PROC/EMO/SAB patterns you should be aware of

When incorporating memories:
- NEVER read verbatim. Paraphrase naturally like a friend would.
- Use 【有效激励】to choose your approach (e.g., "I know countdowns work for you...")
- Reference 【过往经历】to show you remember their life (e.g., "Last time you went camping...")
- Respect 【行为模式】to avoid triggers (e.g., if user procrastinates before gym, address it gently)
- Connect 【近期计划】to current conversation (e.g., "Excited for Disneyland this weekend?")
- IMPORTANT: Make the user feel KNOWN and UNDERSTOOD, not analyzed

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
└── useAsyncMemoryPipeline.ts             # 异步记忆检索（调用 retrieve-memories）

supabase/functions/
├── _shared/
│   └── memory-retrieval.ts               # 新增：Tolan 记忆检索共享模块 ⭐⭐⭐
│                                         # 包含: synthesizeQuestions, generateEmbeddings,
│                                         #       mergeWithMRR, multiQueryRAG
├── retrieve-memories/                    # 新增：虚拟消息专用记忆检索 API ⭐⭐
│   └── index.ts                          # 调用共享模块，返回与话题相关的记忆
├── generate-dynamic-message/             # 新增：LLM 快速生成
│   └── index.ts
└── get-system-instruction/
    └── index.ts                          # 修改：导入共享模块 + 添加 Dynamic Instruction 段落
```

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/hooks/useVirtualMessages.ts` | 重构为薄包装层，调用新系统 |
| `src/hooks/useAICoachSession.ts` | 集成 ConversationContextTracker |
| `supabase/functions/get-system-instruction/index.ts` | 抽取核心函数到共享模块，导入使用 |
| `supabase/functions/memory-extractor/index.ts` | 添加 search_by_topic 功能 |
| `docs/architecture/tolan-memory-system-upgrade.md` | 添加"与虚拟消息系统集成"章节 |

---

## 6.5 话题-记忆关联规则（constants.ts）

### 话题检测规则

```typescript
// src/hooks/virtual-messages/constants.ts

/**
 * 话题检测规则
 * 每个话题包含：关键词、同义词、关联的记忆搜索问题
 */
export const TOPIC_RULES: TopicRule[] = [
  // ====== 情感类话题 ======
  {
    id: 'breakup',
    name: '失恋',
    keywords: ['失恋', '分手', '前任', 'ex', '被甩'],
    synonyms: ['感情问题', '恋爱受挫'],
    emotion: 'sad',
    emotionIntensity: 0.8,
    memoryQuestions: [
      '用户之前如何处理失恋或情感问题？',
      '用户情绪低落时什么方法有效？',
      '用户在亲密关系中有什么模式或顾虑？',
    ],
  },
  {
    id: 'stress',
    name: '压力',
    keywords: ['压力', '焦虑', '紧张', '喘不过气', '崩溃'],
    synonyms: ['心理压力', '工作压力'],
    emotion: 'anxious',
    emotionIntensity: 0.7,
    memoryQuestions: [
      '用户通常因为什么感到压力？',
      '用户如何应对压力和焦虑？',
      '什么方法能帮助用户放松？',
    ],
  },

  // ====== 生活类话题 ======
  {
    id: 'travel',
    name: '旅行',
    keywords: ['旅行', '旅游', '出门', '度假', '露营', '自驾'],
    synonyms: ['出去玩', '去哪玩'],
    emotion: 'happy',
    emotionIntensity: 0.6,
    memoryQuestions: [
      '用户之前去过哪些地方旅行？',
      '用户喜欢什么类型的旅行活动？',
      '用户旅行前通常有什么准备习惯或焦虑？',
      '用户通常和谁一起旅行？',
      '用户最近提到过什么旅行计划？',
    ],
  },
  {
    id: 'fitness',
    name: '健身',
    keywords: ['健身', '运动', '跑步', '锻炼', '健身房', 'gym'],
    synonyms: ['去运动', '去健身房'],
    emotion: 'neutral',
    emotionIntensity: 0.3,
    memoryQuestions: [
      '用户之前的运动习惯是什么？',
      '用户健身前有什么拖延或阻力模式？',
      '什么方法能有效激励用户去运动？',
      '用户对运动有什么身体反应或顾虑？',
    ],
  },
  {
    id: 'hobby',
    name: '兴趣爱好',
    keywords: ['学', '练习', '兴趣', '爱好', '吉他', '钢琴', '画画', '摄影'],
    synonyms: ['业余爱好', '个人兴趣'],
    emotion: 'happy',
    emotionIntensity: 0.5,
    memoryQuestions: [
      '用户有什么兴趣爱好？',
      '用户最近在学习什么新技能？',
      '用户在学习新事物时有什么模式？',
    ],
  },

  // ====== 工作类话题 ======
  {
    id: 'work',
    name: '工作',
    keywords: ['工作', '上班', '项目', '开会', 'deadline', '老板'],
    synonyms: ['上班族', '职场'],
    emotion: 'neutral',
    emotionIntensity: 0.4,
    memoryQuestions: [
      '用户在工作中有什么拖延模式？',
      '用户面对工作任务时有什么情绪反应？',
      '什么方法能帮助用户集中注意力工作？',
    ],
  },
  {
    id: 'coding',
    name: '写代码',
    keywords: ['写代码', '编程', 'coding', 'bug', '开发'],
    synonyms: ['敲代码', '写程序'],
    emotion: 'neutral',
    emotionIntensity: 0.3,
    memoryQuestions: [
      '用户写代码时有什么分心或拖延模式？',
      '用户对编程任务有什么情绪反应？',
      '什么方法能帮助用户进入心流状态？',
    ],
  },

  // ====== 社交类话题 ======
  {
    id: 'friends',
    name: '朋友',
    keywords: ['朋友', '朋友们', '闺蜜', '哥们', '聚会'],
    synonyms: ['社交', '约朋友'],
    emotion: 'happy',
    emotionIntensity: 0.5,
    memoryQuestions: [
      '用户通常和谁一起活动？',
      '用户在社交中有什么偏好或顾虑？',
      '用户提到过哪些朋友的名字？',
    ],
  },
  {
    id: 'family',
    name: '家人',
    keywords: ['家人', '爸妈', '父母', '家里', '回家'],
    synonyms: ['家庭', '亲人'],
    emotion: 'neutral',
    emotionIntensity: 0.5,
    memoryQuestions: [
      '用户和家人的关系如何？',
      '用户在家庭中有什么角色或责任？',
      '用户提到过哪些家庭成员？',
    ],
  },
];

/**
 * 情绪关键词库
 * 用于检测用户当前情绪状态
 */
export const EMOTION_KEYWORDS: Record<EmotionalState['primary'], string[]> = {
  happy: ['开心', '高兴', '兴奋', '期待', '棒', '太好了', '耶'],
  sad: ['难过', '伤心', '失落', '沮丧', '想哭', '心痛', '失恋'],
  anxious: ['焦虑', '紧张', '担心', '害怕', '慌', '压力', '崩溃'],
  frustrated: ['烦', '生气', '郁闷', '受够了', '无语', '烦死了'],
  tired: ['累', '困', '疲惫', '没力气', '不想动', '好累'],
  neutral: [],
};
```

### 话题类型定义

```typescript
// src/hooks/virtual-messages/types.ts

export interface TopicRule {
  /** 话题唯一标识 */
  id: string;
  /** 话题名称（用于显示和日志） */
  name: string;
  /** 触发关键词 */
  keywords: string[];
  /** 同义词/别名 */
  synonyms: string[];
  /** 关联的主要情绪 */
  emotion: EmotionalState['primary'];
  /** 情绪强度 (0-1) */
  emotionIntensity: number;
  /** 记忆检索问题（传给 synthesizeQuestions 使用） */
  memoryQuestions: string[];
}
```

### 话题检测流程

```
用户说: "我想去旅行"
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 1: 关键词匹配                                               │
│ 遍历 TOPIC_RULES，检查 keywords/synonyms                         │
│ 匹配到: travel (旅行)                                            │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 2: 情绪检测                                                 │
│ 检查 EMOTION_KEYWORDS                                            │
│ 未匹配强烈情绪词 → 使用话题默认: happy, 0.6                        │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 3: 生成记忆检索问题                                          │
│ 使用话题的 memoryQuestions 作为种子                               │
│ + synthesizeQuestions() 补充更多问题                              │
│                                                                  │
│ 最终问题:                                                        │
│ 1. 用户之前去过哪些地方旅行？                                      │
│ 2. 用户喜欢什么类型的旅行活动？                                    │
│ 3. 用户旅行前通常有什么准备习惯或焦虑？                            │
│ 4. 用户通常和谁一起旅行？                                         │
│ 5. 用户最近提到过什么旅行计划？                                    │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 4: 调用 retrieve-memories API                               │
│ 使用生成的问题进行 Multi-Query RAG 检索                           │
│ 返回: 分层检索结果（热层优先 → 温层补充）                          │
└─────────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────────────────────────┐
│ Step 5: 生成 [CONTEXT] 消息                                      │
│ 按记忆类型组织：有效激励 > 过往经历 > 偏好 > 计划 > 行为模式        │
│ 注入到 Gemini Live                                               │
└─────────────────────────────────────────────────────────────────┘
```

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

## 8. Tolan 记忆系统集成

### 8.1 背景

Tolan 记忆系统（见 `docs/architecture/tolan-memory-system-upgrade.md`）提供了强大的 Multi-Query RAG 记忆检索能力：
- **问题合成**：LLM 自动生成 3-5 个检索问题
- **多次向量搜索**：并行搜索，覆盖更多相关记忆
- **MRR 融合排序**：智能排序，最相关的记忆排在前面

**问题**：Tolan 原设计是在 AI 会话启动时一次性注入 system prompt，但 Gemini Live 的 system prompt 只能设置一次，后续需要通过虚拟消息动态注入。

### 8.2 融合架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         记忆检索能力复用                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                   共享模块: _shared/memory-retrieval.ts               │  │
│  │                                                                       │  │
│  │  ┌─────────────────────┐  ┌─────────────────────┐  ┌───────────────┐ │  │
│  │  │ synthesizeQuestions │  │ generateEmbeddings  │  │ mergeWithMRR  │ │  │
│  │  │ (问题合成)          │  │ (批量向量生成)       │  │ (MRR 融合)    │ │  │
│  │  └─────────────────────┘  └─────────────────────┘  └───────────────┘ │  │
│  │                                    │                                  │  │
│  │                    ┌───────────────┴───────────────┐                  │  │
│  │                    │     multiQueryRAG()           │                  │  │
│  │                    │   (核心检索函数 - 可复用)      │                  │  │
│  │                    └───────────────┬───────────────┘                  │  │
│  └────────────────────────────────────┼──────────────────────────────────┘  │
│                                       │                                     │
│          ┌────────────────────────────┼────────────────────────────┐        │
│          │                            │                            │        │
│          ▼                            ▼                            ▼        │
│  ┌───────────────────┐    ┌────────────────────┐    ┌─────────────────────┐│
│  │ get-system-       │    │ retrieve-memories  │    │ useAsyncMemory      ││
│  │ instruction       │    │ (新增 Edge Func)   │    │ Pipeline            ││
│  │                   │    │                    │    │ (前端 Hook)         ││
│  │ 用途: 启动时注入   │    │ 用途: 实时检索      │    │                     ││
│  │ system prompt     │    │ 供虚拟消息使用      │    │ 调用 retrieve-      ││
│  │                   │    │                    │    │ memories API        ││
│  └───────────────────┘    └────────────────────┘    └─────────────────────┘│
│                                       │                                     │
│                                       ▼                                     │
│                           ┌────────────────────┐                            │
│                           │  [CONTEXT] 消息    │                            │
│                           │  sendTextMessage   │                            │
│                           └────────────────────┘                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 调用时机对比

| 时机 | 调用的 API | 数据流 |
|------|-----------|--------|
| **启动时** | `get-system-instruction` | Tolan Multi-Query RAG → 注入 system prompt |
| **话题变化时** | `retrieve-memories` | 话题检测 → 调用 API → `[CONTEXT]` 虚拟消息 |

### 8.4 新增 Edge Function: `retrieve-memories`

专门给虚拟消息系统调用，输入话题/关键词，输出格式化的记忆：

```typescript
// supabase/functions/retrieve-memories/index.ts

/**
 * 虚拟消息系统专用的记忆检索 API
 *
 * 与 get-system-instruction 的区别：
 * - get-system-instruction: 启动时调用，返回完整 system prompt
 * - retrieve-memories: 会话中实时调用，返回与当前话题相关的记忆
 */

interface RetrieveMemoriesRequest {
  userId: string;
  /** 当前话题（用于 question synthesis） */
  currentTopic: string;
  /** 额外关键词（可选） */
  keywords?: string[];
  /** 对话上下文摘要（可选，用于更精准的问题合成） */
  conversationSummary?: string;
  /** 返回数量限制 */
  limit?: number;
}

interface RetrieveMemoriesResponse {
  memories: Array<{
    content: string;
    tag: string;
    relevance: number;  // MRR 融合得分
  }>;
  /** 生成的检索问题（调试用） */
  synthesizedQuestions?: string[];
  /** 耗时 */
  durationMs: number;
}

serve(async (req) => {
  const { userId, currentTopic, keywords, conversationSummary, limit = 5 } = await req.json();

  // 复用 Tolan 的核心函数
  // 1. Question Synthesis - 根据当前话题生成检索问题
  const searchContext = conversationSummary
    ? `${currentTopic}. Context: ${conversationSummary}`
    : currentTopic;

  const questions = await synthesizeQuestions(searchContext);

  // 2. Multi-Query RAG
  const memories = await multiQueryRAG(supabase, userId, questions, limit);

  // 3. 返回格式化结果
  return new Response(JSON.stringify({
    memories: memories.map(m => ({
      content: m.content,
      tag: m.tag,
      relevance: m.mrrScore,
    })),
    synthesizedQuestions: questions,
    durationMs: Date.now() - startTime,
  }));
});
```

### 8.5 修改 `useAsyncMemoryPipeline.ts`

调用新的 `retrieve-memories` API：

```typescript
// src/hooks/virtual-messages/useAsyncMemoryPipeline.ts

export function useAsyncMemoryPipeline(userId: string | null) {
  const fetchMemoriesForTopic = useCallback(async (
    topic: string,
    keywords: string[],
    conversationSummary?: string
  ): Promise<MemoryResult[]> => {
    if (!userId) return [];

    try {
      const response = await supabase.functions.invoke('retrieve-memories', {
        body: {
          userId,
          currentTopic: topic,
          keywords,
          conversationSummary,
          limit: 3,  // 虚拟消息只取最相关的 3 条
        },
      });

      if (response.error) throw response.error;

      console.log(`🧠 Retrieved ${response.data.memories.length} memories for topic "${topic}"`);
      console.log(`🔍 Questions used:`, response.data.synthesizedQuestions);

      return response.data.memories;
    } catch (error) {
      console.error('Memory retrieval failed:', error);
      return [];
    }
  }, [userId]);

  return { fetchMemoriesForTopic };
}
```

### 8.6 修改 `[CONTEXT]` 消息生成

利用检索到的记忆生成更丰富的上下文消息：

```typescript
// useVirtualMessageOrchestrator.ts 中

const generateContextMessage = (
  memories: MemoryResult[],
  conversationContext: VirtualMessageUserContext
): string => {
  // 按标签分组
  const byTag = groupBy(memories, 'tag');

  let memorySection = '';

  // EFFECTIVE 类型优先展示
  if (byTag.EFFECTIVE?.length) {
    memorySection += `有效激励方式: ${byTag.EFFECTIVE.map(m => m.content).join('; ')}\n`;
  }

  // 其他相关记忆
  const otherMemories = memories.filter(m => m.tag !== 'EFFECTIVE');
  if (otherMemories.length) {
    memorySection += `相关记忆: ${otherMemories.map(m => m.content).join('; ')}`;
  }

  return `[CONTEXT] type=memory topic="${conversationContext.currentTopic}"
conversation_context: 用户正在讨论"${conversationContext.currentTopic}"，情绪${conversationContext.currentEmotion}(${conversationContext.emotionIntensity})
${memorySection}
action: 在合适时机自然引用这些记忆，不要突兀地插入。`;
};
```

### 8.7 完整数据流示例

```
用户说: "因为我失恋了"
        │
        ▼
T+0ms   TopicDetector 检测到话题 "失恋"
        │
        ├──► 立即生成 [EMPATHY] 消息（无需等待记忆）
        │
        └──► 同时触发 AsyncMemoryPipeline.fetchMemoriesForTopic('失恋')
             │
             ▼
T+100ms 调用 retrieve-memories Edge Function
             │
             ├──► synthesizeQuestions("失恋")
             │    生成: ["用户之前如何处理失恋？", "用户在情绪低落时什么方法有效？", ...]
             │
             ├──► generateEmbeddings(questions)
             │
             ├──► multiQueryRAG(embeddings)
             │
             └──► MRR 融合排序
             │
             ▼
T+700ms 返回记忆:
        - [EFFECTIVE] "用户说运动能帮助转移注意力"
        - [EMO] "用户情绪低落时喜欢安静独处"
        │
        ▼
T+750ms 生成 [CONTEXT] 消息:
        [CONTEXT] type=memory topic="失恋"
        conversation_context: 用户正在讨论失恋，情绪 sad (0.8)
        有效激励方式: 用户说运动能帮助转移注意力
        相关记忆: 用户情绪低落时喜欢安静独处
        action: 等情绪稳定后自然引用，不要催任务
        │
        ▼
T+800ms 入队，等待冷却期后发送
```

### 8.8 性能预算

| 操作 | 目标延迟 | 说明 |
|------|---------|------|
| Question Synthesis | ~300ms | LLM 生成检索问题 |
| Embedding Generation | ~200ms | 批量 API |
| Multi-Query Search | ~150ms | 并行 RPC |
| MRR Fusion | ~5ms | 内存计算 |
| **总计** | **~700ms** | 可接受，异步不阻塞 |

### 8.9 分层检索集成

根据 Tolan 文档的分层检索设计，虚拟消息系统需要考虑：

#### 三层记忆架构

```
┌─────────────────────────────────────────────────────────────────┐
│  🔥 HOT TIER（热层）- 优先搜索                                    │
│  ─────────────────────────────────────────────────────────────  │
│  条件: 最近 7 天被访问过 OR tag IN ('PREF', 'EFFECTIVE')         │
│  用途: 快速响应，< 50ms                                          │
├─────────────────────────────────────────────────────────────────┤
│  🌡️ WARM TIER（温层）- 热层不够时搜索                             │
│  ─────────────────────────────────────────────────────────────  │
│  条件: 7-30 天未被访问                                           │
│  用途: 补充热层，< 100ms                                         │
├─────────────────────────────────────────────────────────────────┤
│  ❄️ COLD TIER（冷层）- 不参与实时搜索                             │
│  ─────────────────────────────────────────────────────────────  │
│  条件: 30+ 天未被访问                                            │
│  用途: 仅夜间压缩评估                                             │
└─────────────────────────────────────────────────────────────────┘
```

#### 虚拟消息如何利用分层检索

```typescript
// useAsyncMemoryPipeline.ts 中调用 retrieve-memories 时
// 后端会自动执行分层检索逻辑

const response = await supabase.functions.invoke('retrieve-memories', {
  body: {
    userId,
    currentTopic: topic,
    keywords,
    conversationSummary,
    limit: 5,
    // 后端会：
    // 1. 先搜热层（PREF + EFFECTIVE + 最近 7 天访问的）
    // 2. 如果热层 < 3 条或相似度 < 0.6，再搜温层
    // 3. 合并结果，MRR 排序
  },
});
```

#### "热层不够"的场景对虚拟消息的影响

| 场景 | 热层结果 | 虚拟消息策略 |
|------|---------|-------------|
| 用户聊常见话题（工作、任务） | 热层够用 | 快速注入，延迟 < 100ms |
| 用户聊冷门话题（旅行、健身） | 需查温层 | 稍慢注入，延迟 < 200ms |
| 用户聊全新话题 | 可能无记忆 | 跳过 [CONTEXT]，只发 [EMPATHY] |

### 8.10 用户生活记忆的利用

根据 Tolan 文档的示例，用户生活相关的记忆可以让 AI 回复更加个性化：

#### 生活记忆类型

| 类型 | 示例 | 虚拟消息用途 |
|------|------|-------------|
| **计划/行程** | "小明周末要去迪士尼" | 话题关联，AI 可以主动提及 |
| **过往经历** | "小明去过优胜美地露营" | 回忆引用，增强亲密感 |
| **兴趣爱好** | "小明喜欢自驾游"、"小明最近在学吉他" | 个性化建议，找到共鸣点 |
| **行为模式** | "小明健身前会找借口拖延" | 提前干预，针对性支持 |

#### Question Synthesis 如何挖掘生活记忆

当用户说"我想去旅行"时，`synthesizeQuestions()` 应该生成：

```
1. 用户之前去过哪些地方旅行？（过往经历）
2. 用户喜欢什么类型的旅行活动？（兴趣爱好）
3. 用户旅行前通常有什么感受或焦虑？（情绪模式）
4. 用户最近提到过什么旅行计划？（计划/行程）
5. 用户通常和谁一起旅行？（社交关系）
```

#### [CONTEXT] 消息如何注入生活记忆

```typescript
// 生成 [CONTEXT] 消息时，按记忆类型组织内容

const generateContextMessage = (
  memories: MemoryResult[],
  context: VirtualMessageUserContext
): string => {
  // 按类型分组
  const pastExperiences = memories.filter(m =>
    m.content.includes('去过') || m.content.includes('上次')
  );
  const preferences = memories.filter(m =>
    m.content.includes('喜欢') || m.content.includes('偏好')
  );
  const patterns = memories.filter(m =>
    m.tag === 'PROC' || m.tag === 'EMO' || m.tag === 'SAB'
  );
  const effective = memories.filter(m => m.tag === 'EFFECTIVE');

  let memorySection = '';

  // 有效激励方式优先
  if (effective.length > 0) {
    memorySection += `【有效激励】${effective.map(m => m.content).join('; ')}\n`;
  }

  // 过往经历
  if (pastExperiences.length > 0) {
    memorySection += `【过往经历】${pastExperiences.map(m => m.content).join('; ')}\n`;
  }

  // 偏好
  if (preferences.length > 0) {
    memorySection += `【用户偏好】${preferences.map(m => m.content).join('; ')}\n`;
  }

  // 行为模式（情绪/拖延/自我妨碍）
  if (patterns.length > 0) {
    memorySection += `【行为模式】${patterns.map(m => m.content).join('; ')}\n`;
  }

  return `[CONTEXT] type=memory topic="${context.currentTopic}"
conversation_context: 用户正在讨论"${context.currentTopic}"，情绪${context.currentEmotion}(${context.emotionIntensity})
${memorySection}
action: 自然地引用这些记忆，让用户感受到 AI 记得他的生活。不要生硬地罗列，而是像朋友一样提起。`;
};
```

#### 生活记忆示例对话

**场景：用户说"我想去旅行"**

```
检索到的记忆：
- [PROC] "小明旅行前会纠结行李"
- [热层] "小明周末要去迪士尼"
- [温层] "小明去过优胜美地露营，玩得很开心"
- [温层] "小明喜欢自驾游"

生成的 [CONTEXT] 消息：
[CONTEXT] type=memory topic="旅行"
conversation_context: 用户正在讨论旅行，情绪 happy (0.6)
【过往经历】小明去过优胜美地露营，玩得很开心
【用户偏好】小明喜欢自驾游
【行为模式】小明旅行前会纠结行李
【近期计划】小明周末要去迪士尼
action: 自然地引用这些记忆，像朋友一样聊天。

AI 回复（融合记忆后）：
"又想去旅行啦！上次你去优胜美地露营玩得超开心的，
这次迪士尼也打算自驾去吗？
对了，行李别纠结太久哦，开心最重要~"
```

### 8.11 记忆访问追踪

每次虚拟消息系统使用记忆后，需要更新 `last_accessed_at`，确保常用记忆保持在热层：

```typescript
// useAsyncMemoryPipeline.ts

const fetchMemoriesForTopic = useCallback(async (...) => {
  const response = await supabase.functions.invoke('retrieve-memories', {...});

  // 后端 retrieve-memories 应该自动更新访问时间
  // UPDATE user_memories
  // SET last_accessed_at = NOW(), access_count = access_count + 1
  // WHERE id = ANY($returned_memory_ids)

  return response.data.memories;
}, []);
```

---

## 9. 实现步骤

### Phase 1: 基础设施（1-2天）
- [ ] 创建 `src/hooks/virtual-messages/` 目录结构
- [ ] 实现 `types.ts` 类型定义
- [ ] 实现 `useConversationContextTracker.ts` 对话上下文追踪器
- [ ] 实现 `useVirtualMessageQueue.ts` 消息队列

### Phase 2: Tolan 记忆系统集成（1-2天）
- [ ] 创建 `supabase/functions/_shared/memory-retrieval.ts` 共享模块
- [ ] 从 `get-system-instruction` 抽取核心函数到共享模块
- [ ] 创建 `supabase/functions/retrieve-memories/index.ts` 新 Edge Function
- [ ] 修改 `get-system-instruction` 导入共享模块
- [ ] 部署并测试 `retrieve-memories` API

### Phase 3: 核心功能（2-3天）
- [ ] 实现 `constants.ts` 话题规则、情绪词库
- [ ] 实现 `useTopicDetector.ts` 话题检测
- [ ] 实现 `useAsyncMemoryPipeline.ts` 异步记忆管道（调用 retrieve-memories）
- [ ] 创建 `generate-dynamic-message` Edge Function

### Phase 4: 整合（1-2天）
- [ ] 实现 `useVirtualMessageOrchestrator.ts` 核心调度器
- [ ] 修改 `get-system-instruction` 添加指令接收机制
- [ ] 重构 `useVirtualMessages.ts` 为薄包装层
- [ ] 集成到 `useAICoachSession.ts`

### Phase 5: 测试与优化（1-2天）
- [ ] 端到端测试：话题检测 → 记忆检索 → 消息注入
- [ ] 性能测试：确保记忆检索 < 1s，总延迟 < 5s
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
