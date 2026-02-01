/**
 * # 动态虚拟消息系统
 *
 * 本模块提供动态虚拟消息系统的核心 Hooks，用于：
 * - 追踪对话上下文
 * - 检测话题和情绪变化（向量匹配版）
 * - 异步检索相关记忆
 * - 生成动态虚拟消息
 *
 * ## 使用示例
 *
 * ```typescript
 * import {
 *   useConversationContextTracker,
 *   useTopicDetector,
 *   useAsyncMemoryPipeline,
 *   generateContextMessage,
 * } from '@/hooks/virtual-messages'
 *
 * function MyComponent() {
 *   const tracker = useConversationContextTracker({
 *     taskDescription: '完成任务',
 *     initialDuration: 300,
 *     taskStartTime: Date.now(),
 *   })
 *
 *   const { detectFromMessage } = useTopicDetector()
 *   const { fetchMemoriesForTopic } = useAsyncMemoryPipeline(userId)
 *
 *   // 当用户说话时
 *   const handleUserSpeech = async (text: string) => {
 *     tracker.addUserMessage(text)
 *
 *     // 异步检测话题（向量匹配）
 *     const result = await detectFromMessage(text)
 *
 *     if (result.topic) {
 *       tracker.updateTopic(result.topic)
 *       tracker.updateEmotionalState(result.emotionalState)
 *
 *       if (result.isTopicChanged) {
 *         // API 直接返回 memoryQuestions
 *         const memories = await fetchMemoriesForTopic(
 *           result.topic.name,
 *           [],
 *           undefined,
 *           result.memoryQuestions
 *         )
 *
 *         if (memories.length > 0) {
 *           const message = generateContextMessage(
 *             memories,
 *             result.topic.name,
 *             result.emotionalState.primary,
 *             result.emotionalState.intensity
 *           )
 *           // 发送虚拟消息
 *           sendTextMessage(message)
 *         }
 *       }
 *     }
 *   }
 * }
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

export {
  useTopicDetector,
  type TopicDetector,
  type TopicDetectionResultExtended,
} from './useTopicDetector'

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
