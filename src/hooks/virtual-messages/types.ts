/**
 * # 动态虚拟消息系统类型定义
 *
 * 本文件定义了动态虚拟消息系统的核心类型，包括：
 * - 对话上下文追踪
 * - 话题检测
 * - 情绪状态
 * - 虚拟消息生成
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

// =====================================================
// 对话上下文类型
// =====================================================

/**
 * 对话消息（简化版，用于上下文追踪）
 */
export interface ContextMessage {
  /** 消息角色 */
  role: 'user' | 'assistant'
  /** 消息内容 */
  content: string
  /** 时间戳 */
  timestamp: number
  /** 是否为虚拟消息触发的回复 */
  isVirtualTriggered?: boolean
}

/**
 * 话题信息
 */
export interface TopicInfo {
  /** 话题标识 */
  id: string
  /** 话题名称（用于显示） */
  name: string
  /** 检测到的时间 */
  detectedAt: number
  /** 相关关键词 */
  keywords: string[]
}

/**
 * 情绪状态
 */
export interface EmotionalState {
  /** 主要情绪 */
  primary: 'neutral' | 'happy' | 'sad' | 'anxious' | 'frustrated' | 'tired'
  /** 情绪强度 (0-1) */
  intensity: number
  /** 检测到的时间 */
  detectedAt: number
  /** 触发词 */
  trigger?: string
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
  | 'idle'            // 空闲

/**
 * 完整的对话上下文
 */
export interface ConversationContext {
  /** 最近 N 条消息 */
  recentMessages: ContextMessage[]

  /** 当前话题 */
  currentTopic: TopicInfo | null

  /** 话题流转历史（最多保留 5 个） */
  topicFlow: TopicInfo[]

  /** 当前情绪状态 */
  emotionalState: EmotionalState

  /** 对话阶段 */
  phase: ConversationPhase

  /** AI 最后说的话 */
  lastAISpeech: string | null

  /** 用户最后说的话 */
  lastUserSpeech: string | null

  /** 对话开始时间 */
  sessionStartTime: number

  /** 最后活动时间 */
  lastActivityTime: number

  /** 对话摘要（由 LLM 定期生成） */
  summary?: string
}

/**
 * 虚拟消息的用户上下文（发送给 LLM 生成消息时使用）
 */
export interface VirtualMessageUserContext {
  /** 任务描述 */
  taskDescription: string

  /** 已用时间 */
  elapsedTime: string

  /** 剩余时间 */
  remainingTime?: string

  /** 用户最近说的话 */
  recentUserSpeech: string | null

  /** AI 最近说的话 */
  recentAISpeech: string | null

  /** 当前情绪 */
  currentEmotion: EmotionalState['primary']

  /** 情绪强度 */
  emotionIntensity: number

  /** 当前话题 */
  currentTopic: string | null

  /** 话题流转（字符串数组） */
  topicFlow: string[]

  /** 对话阶段 */
  conversationPhase: ConversationPhase

  /** 对话摘要 */
  conversationSummary?: string

  /** 当前本地时间 */
  currentTime: string
}

// =====================================================
// 话题检测类型
// =====================================================

/**
 * 话题检测规则
 */
export interface TopicRule {
  /** 话题唯一标识 */
  id: string
  /** 话题名称（用于显示和日志） */
  name: string
  /** 触发关键词 */
  keywords: string[]
  /** 同义词/别名 */
  synonyms: string[]
  /** 关联的主要情绪 */
  emotion: EmotionalState['primary']
  /** 情绪强度 (0-1) */
  emotionIntensity: number
  /** 记忆检索问题（传给 synthesizeQuestions 使用） */
  memoryQuestions: string[]
}

/**
 * 话题检测结果
 */
export interface TopicDetectionResult {
  /** 检测到的话题（可能为 null） */
  topic: TopicInfo | null
  /** 检测到的情绪状态 */
  emotionalState: EmotionalState
  /** 是否话题发生变化 */
  isTopicChanged: boolean
  /** 匹配到的关键词 */
  matchedKeywords: string[]
}

// =====================================================
// 虚拟消息类型
// =====================================================

/**
 * 虚拟消息类型
 */
export type VirtualMessageType =
  | 'EMPATHY'     // 情绪响应（最高优先级）
  | 'DIRECTIVE'   // 行为指令
  | 'CONTEXT'     // 记忆注入
  | 'CHECKPOINT'  // 定时检查

/**
 * 虚拟消息优先级
 */
export type VirtualMessagePriority = 'urgent' | 'high' | 'normal' | 'low'

/**
 * 虚拟消息项
 */
export interface VirtualMessageItem {
  /** 唯一标识 */
  id: string
  /** 消息类型 */
  type: VirtualMessageType
  /** 优先级 */
  priority: VirtualMessagePriority
  /** 消息内容 */
  content: string
  /** 创建时间 */
  createdAt: number
  /** 过期时间（可选） */
  expiresAt?: number
  /** 关联的话题（可选） */
  relatedTopic?: string
  /** 元数据 */
  metadata?: Record<string, unknown>
}

/**
 * 消息队列状态
 */
export interface MessageQueueState {
  /** 待发送的消息队列 */
  queue: VirtualMessageItem[]
  /** 最后发送的消息 */
  lastSent: VirtualMessageItem | null
  /** 最后发送时间 */
  lastSentAt: number | null
  /** 冷却期结束时间 */
  cooldownUntil: number | null
  /** 是否正在发送 */
  isSending: boolean
}

// =====================================================
// 记忆检索类型
// =====================================================

/**
 * 记忆检索结果
 */
export interface MemoryRetrievalResult {
  /** 记忆内容 */
  content: string
  /** 记忆标签 */
  tag: string
  /** 相关度分数（MRR） */
  relevance: number
  /** 标签中文描述 */
  tagLabel: string
}

/**
 * 记忆检索请求
 */
export interface MemoryRetrievalRequest {
  /** 当前话题 */
  currentTopic: string
  /** 关键词 */
  keywords?: string[]
  /** 对话摘要 */
  conversationSummary?: string
  /** 种子问题 */
  seedQuestions?: string[]
  /** 返回数量限制 */
  limit?: number
}

/**
 * 记忆检索响应
 */
export interface MemoryRetrievalResponse {
  /** 检索到的记忆 */
  memories: MemoryRetrievalResult[]
  /** 生成的检索问题 */
  synthesizedQuestions?: string[]
  /** 耗时（毫秒） */
  durationMs: number
}

// =====================================================
// Hook 配置类型
// =====================================================

/**
 * 对话上下文追踪器配置
 */
export interface ConversationContextTrackerOptions {
  /** 保留的最近消息数量 */
  maxRecentMessages?: number
  /** 保留的话题流转数量 */
  maxTopicHistory?: number
  /** 任务描述 */
  taskDescription: string
  /** 初始时长（秒） */
  initialDuration: number
  /** 任务开始时间 */
  taskStartTime: number
}

/**
 * 虚拟消息调度器配置
 */
export interface VirtualMessageOrchestratorOptions {
  /** 用户 ID */
  userId: string | null
  /** 任务描述 */
  taskDescription: string
  /** 初始时长（秒） */
  initialDuration: number
  /** 任务开始时间 */
  taskStartTime: number
  /** 发送消息的回调 */
  onSendMessage: (message: string) => void
  /** 冷却时间（毫秒） */
  cooldownMs?: number
  /** 是否启用记忆检索 */
  enableMemoryRetrieval?: boolean
}
