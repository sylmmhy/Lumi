/**
 * # 动态虚拟消息系统
 *
 * 本模块提供动态虚拟消息系统的核心 Hooks，用于：
 * - 追踪对话上下文
 * - 检测情绪变化（本地关键词匹配）
 * - 异步检索相关记忆
 * - 生成动态虚拟消息
 *
 * ## 使用示例
 *
 * ```typescript
 * import {
 *   useConversationContextTracker,
 *   useAsyncMemoryPipeline,
 *   generateContextMessage,
 * } from '@/hooks/virtual-messages'
 *
 * // Topic detection is now handled by the unified referee (detect-intent)
 * // Memory injection is triggered by the referee's topic_changed callback
 * ```
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

// 类型导出
export type {
  // 对话上下文类型
  ContextMessage,
  TopicInfo,
  EmotionalState,
  ConversationPhase,
  ConversationContext,
  VirtualMessageUserContext,

  // 话题检测类型
  TopicRule,
  TopicDetectionResult,

  // 虚拟消息类型
  VirtualMessageType,
  VirtualMessagePriority,
  VirtualMessageItem,
  MessageQueueState,

  // 记忆检索类型
  MemoryRetrievalResult,
  MemoryRetrievalRequest,
  MemoryRetrievalResponse,

  // 配置类型
  ConversationContextTrackerOptions,
  VirtualMessageOrchestratorOptions,
} from './types'

// Hook 导出
export {
  useConversationContextTracker,
  type ConversationContextTracker,
} from './useConversationContextTracker'

// US-012: useTopicDetector removed — topic detection handled by unified referee

export {
  useAsyncMemoryPipeline,
  generateContextMessage,
  type AsyncMemoryPipeline,
} from './useAsyncMemoryPipeline'

export {
  useVirtualMessageQueue,
  type VirtualMessageQueueResult,
} from './useVirtualMessageQueue'

export {
  useVirtualMessageOrchestrator,
  type VirtualMessageOrchestratorResult,
} from './useVirtualMessageOrchestrator'

// 常量导出
export {
  TOPIC_RULES,
  EMOTION_KEYWORDS,
  EMOTION_INTENSIFIERS,
  EMOTION_DIMINISHERS,
  MESSAGE_TYPE_PRIORITY,
  MESSAGE_COOLDOWN_MS,
  MESSAGE_EXPIRY_MS,
  CHECKPOINT_INTERVAL_MS,
  EMOTION_RESPONSE_THRESHOLD,
} from './constants'
