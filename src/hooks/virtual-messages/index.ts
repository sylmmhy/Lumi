/**
 * # 动态虚拟消息系统
 *
 * 本模块提供动态虚拟消息系统的核心 Hooks，用于：
 * - 追踪对话上下文
 * - 检测话题和情绪变化（使用 Semantic Router）
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
 *   // Semantic Router 版本的话题检测器（异步 API）
 *   const { detectFromMessageAsync, isLoading } = useTopicDetector()
 *   const { fetchMemoriesForTopic } = useAsyncMemoryPipeline(userId)
 *
 *   // 当用户说话时
 *   const handleUserSpeech = async (text: string) => {
 *     tracker.addUserMessage(text)
 *
 *     // 异步调用 Semantic Router API 检测话题
 *     const { topic, emotionalState, isTopicChanged, memoryQuestions, shouldRetrieveMemory } =
 *       await detectFromMessageAsync(text)
 *
 *     if (topic) {
 *       tracker.updateTopic(topic)
 *       tracker.updateEmotionalState(emotionalState)
 *
 *       // Semantic Router 返回 shouldRetrieveMemory 指示是否需要检索记忆
 *       if (isTopicChanged && shouldRetrieveMemory) {
 *         // 使用 API 返回的 memoryQuestions 作为检索问题
 *         const memories = await fetchMemoriesForTopic(
 *           topic.name,
 *           topic.keywords,
 *           undefined,
 *           memoryQuestions
 *         )
 *
 *         if (memories.length > 0) {
 *           const message = generateContextMessage(
 *             memories,
 *             topic.name,
 *             emotionalState.primary,
 *             emotionalState.intensity
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
 * @see docs/in-progress/20260127-dynamic-virtual-messages-progress.md
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
  SemanticRouterResponse,

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
