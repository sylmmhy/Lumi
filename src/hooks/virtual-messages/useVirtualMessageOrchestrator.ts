/**
 * # 虚拟消息调度器 Hook
 *
 * 核心调度器，整合所有虚拟消息系统组件：
 * - ConversationContextTracker: 追踪对话上下文
 * - TopicDetector: 检测话题和情绪变化
 * - AsyncMemoryPipeline: 异步检索相关记忆
 * - VirtualMessageQueue: 消息队列管理
 *
 * ## 方案 A 实现：turnComplete 后静默注入
 *
 * 核心流程：
 * 1. 话题检测 → 异步检索记忆（不阻塞）
 * 2. 监听 turnComplete 事件（AI 说完话）
 * 3. 在安全窗口期调用 injectContextSilently
 * 4. 记忆被静默加入上下文，等待下次 AI 自然引用
 *
 * ## 使用示例
 *
 * ```typescript
 * const orchestrator = useVirtualMessageOrchestrator({
 *   userId,
 *   taskDescription: '完成任务',
 *   initialDuration: 300,
 *   taskStartTime: Date.now(),
 *   injectContextSilently: geminiLive.injectContextSilently,
 *   isSpeaking: geminiLive.isSpeaking,
 * })
 *
 * // 当用户说话时
 * orchestrator.onUserSpeech(text)
 *
 * // 当 AI 说话时
 * orchestrator.onAISpeech(text)
 *
 * // 当 AI 说完话时（turnComplete）
 * orchestrator.onTurnComplete()
 * ```
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import { useCallback, useRef, useEffect } from 'react'
import { useConversationContextTracker } from './useConversationContextTracker'
import { useTopicDetector } from './useTopicDetector'
import { useAsyncMemoryPipeline, generateContextMessage } from './useAsyncMemoryPipeline'
import { useVirtualMessageQueue } from './useVirtualMessageQueue'
import type {
  VirtualMessageOrchestratorOptions,
  TopicInfo,
  EmotionalState,
} from './types'
import { EMOTION_RESPONSE_THRESHOLD } from './constants'

/**
 * 调度器配置（扩展基础配置）
 */
interface UseVirtualMessageOrchestratorOptions extends VirtualMessageOrchestratorOptions {
  /**
   * 静默注入上下文的回调
   * 来自 useGeminiLive.injectContextSilently
   */
  injectContextSilently: (content: string, options?: { force?: boolean }) => boolean
  /**
   * AI 是否正在说话
   * 来自 useGeminiLive.isSpeaking
   */
  isSpeaking: boolean
  /**
   * 是否启用调度器
   */
  enabled?: boolean
  /**
   * 首选语言（用于生成消息时携带语言信息）
   */
  preferredLanguage?: string
}

/**
 * 调度器返回值
 */
interface VirtualMessageOrchestratorResult {
  /** 处理用户说话事件 */
  onUserSpeech: (text: string) => void
  /** 处理 AI 说话事件 */
  onAISpeech: (text: string) => void
  /** 处理 AI 说完话事件（turnComplete） */
  onTurnComplete: () => void
  /** 手动触发记忆检索（用于调试） */
  triggerMemoryRetrieval: (topic: string, keywords?: string[]) => Promise<void>
  /** 获取当前队列大小 */
  getQueueSize: () => number
  /** 获取当前对话上下文 */
  getContext: () => ReturnType<ReturnType<typeof useConversationContextTracker>['getContext']>
  /** 重置调度器状态 */
  reset: () => void
}

/**
 * 虚拟消息调度器
 */
export function useVirtualMessageOrchestrator(
  options: UseVirtualMessageOrchestratorOptions
): VirtualMessageOrchestratorResult {
  const {
    userId,
    taskDescription,
    initialDuration,
    taskStartTime,
    injectContextSilently,
    isSpeaking,
    enabled = true,
    enableMemoryRetrieval = true,
    cooldownMs = 5000,
    preferredLanguage = 'en-US',
  } = options

  // =====================================================
  // 子 Hooks
  // =====================================================

  // 对话上下文追踪器
  const contextTracker = useConversationContextTracker({
    taskDescription,
    initialDuration,
    taskStartTime,
  })

  // 话题检测器
  const topicDetector = useTopicDetector()

  // 异步记忆管道
  const memoryPipeline = useAsyncMemoryPipeline(userId)

  // 消息队列
  const messageQueue = useVirtualMessageQueue({
    onSendMessage: (message) => injectContextSilently(message),
    cooldownMs,
    enabled,
  })

  // =====================================================
  // Refs
  // =====================================================

  // 追踪上一次检测到的话题
  const lastTopicRef = useRef<TopicInfo | null>(null)
  // 追踪是否有待发送的记忆消息
  const pendingMemoryRef = useRef<boolean>(false)
  // 追踪 AI 说话状态
  const isSpeakingRef = useRef<boolean>(isSpeaking)

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  // =====================================================
  // 核心方法
  // =====================================================

  /**
   * 生成情绪响应消息 [EMPATHY]
   */
  const generateEmpathyMessage = useCallback((
    emotion: EmotionalState['primary'],
    intensity: number,
    trigger?: string
  ): string => {
    const currentTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

    const context = contextTracker.getVirtualMessageContext()

    return `[EMPATHY] emotion=${emotion} intensity=${intensity.toFixed(1)}${trigger ? ` trigger="${trigger}"` : ''} current_time=${currentTime} language=${preferredLanguage}
conversation_context: 用户正在讨论"${context.currentTopic || '未知话题'}"，刚从"${context.topicFlow[context.topicFlow.length - 2] || '无'}"话题转过来
last_ai_said: "${context.recentAISpeech?.substring(0, 50) || '(无)'}"
action: 优先倾听和安慰，等情绪稳定后再轻柔地引导回任务。`
  }, [contextTracker, preferredLanguage])

  /**
   * 处理话题变化，触发记忆检索
   */
  const handleTopicChange = useCallback(async (
    topic: TopicInfo,
    emotionalState: EmotionalState
  ) => {
    if (!enableMemoryRetrieval || !userId) {
      return
    }

    // 标记有待处理的记忆
    pendingMemoryRef.current = true

    // 获取话题相关的记忆检索问题
    const seedQuestions = topicDetector.getMemoryQuestionsForTopic(topic.id)

    // 异步检索记忆
    const memories = await memoryPipeline.fetchMemoriesForTopic(
      topic.name,
      topic.keywords,
      contextTracker.getContext().summary,
      seedQuestions
    )

    if (memories.length > 0) {
      // 生成 [CONTEXT] 消息
      const contextMessage = generateContextMessage(
        memories,
        topic.name,
        emotionalState.primary,
        emotionalState.intensity
      )

      // 入队消息
      messageQueue.enqueue({
        type: 'CONTEXT',
        priority: 'normal',
        content: contextMessage,
        relatedTopic: topic.name,
      })

      if (import.meta.env.DEV) {
        console.log(`🧠 [Orchestrator] 记忆检索完成，已入队 CONTEXT 消息`, {
          topic: topic.name,
          memoriesCount: memories.length,
          queueSize: messageQueue.size(),
        })
      }
    }

    pendingMemoryRef.current = false
  }, [
    enableMemoryRetrieval,
    userId,
    topicDetector,
    memoryPipeline,
    contextTracker,
    messageQueue,
  ])

  /**
   * 处理用户说话事件
   */
  const onUserSpeech = useCallback((text: string) => {
    if (!enabled) return

    // 更新上下文
    contextTracker.addUserMessage(text)

    // 检测话题和情绪（函数内部已追踪话题变化）
    const result = topicDetector.detectFromMessage(text)

    // 更新情绪状态
    if (result.emotionalState.primary !== 'neutral') {
      contextTracker.updateEmotionalState(result.emotionalState)
    }

    // 检查是否需要情绪响应
    if (
      result.emotionalState.intensity >= EMOTION_RESPONSE_THRESHOLD &&
      result.emotionalState.primary !== 'neutral'
    ) {
      // 生成 [EMPATHY] 消息并入队（最高优先级）
      const empathyMessage = generateEmpathyMessage(
        result.emotionalState.primary,
        result.emotionalState.intensity,
        result.emotionalState.trigger
      )

      messageQueue.enqueue({
        type: 'EMPATHY',
        priority: 'urgent',
        content: empathyMessage,
      })

      if (import.meta.env.DEV) {
        console.log(`💗 [Orchestrator] 检测到强烈情绪，已入队 EMPATHY 消息`, {
          emotion: result.emotionalState.primary,
          intensity: result.emotionalState.intensity,
        })
      }
    }

    // 处理话题变化
    if (result.topic) {
      contextTracker.updateTopic(result.topic)

      if (result.isTopicChanged) {
        lastTopicRef.current = result.topic

        if (import.meta.env.DEV) {
          console.log(`🏷️ [Orchestrator] 话题变化: ${result.topic.name}`, {
            keywords: result.matchedKeywords,
          })
        }

        // 触发异步记忆检索
        handleTopicChange(result.topic, result.emotionalState)
      }
    }
  }, [
    enabled,
    contextTracker,
    topicDetector,
    messageQueue,
    generateEmpathyMessage,
    handleTopicChange,
  ])

  /**
   * 处理 AI 说话事件
   */
  const onAISpeech = useCallback((text: string) => {
    if (!enabled) return

    // 更新上下文
    contextTracker.addAIMessage(text)
  }, [enabled, contextTracker])

  /**
   * 处理 AI 说完话事件（turnComplete）
   *
   * 这是方案 A 的核心：在安全窗口期尝试发送队列中的消息
   */
  const onTurnComplete = useCallback(() => {
    if (!enabled) return

    if (import.meta.env.DEV) {
      console.log(`✅ [Orchestrator] turnComplete - 尝试发送队列消息`, {
        queueSize: messageQueue.size(),
        isInCooldown: messageQueue.isInCooldown(),
      })
    }

    // 尝试发送队列中的消息
    // injectContextSilently 会检查是否在安全窗口期
    const sent = messageQueue.tryFlush()

    if (sent && import.meta.env.DEV) {
      console.log(`📤 [Orchestrator] 成功发送队列消息`)
    }
  }, [enabled, messageQueue])

  /**
   * 手动触发记忆检索（用于调试）
   */
  const triggerMemoryRetrieval = useCallback(async (
    topic: string,
    keywords: string[] = []
  ) => {
    if (!userId) return

    const memories = await memoryPipeline.fetchMemoriesForTopic(topic, keywords)

    if (memories.length > 0) {
      const contextMessage = generateContextMessage(
        memories,
        topic,
        'neutral',
        0.5
      )

      messageQueue.enqueue({
        type: 'CONTEXT',
        priority: 'normal',
        content: contextMessage,
        relatedTopic: topic,
      })
    }
  }, [userId, memoryPipeline, messageQueue])

  /**
   * 获取队列大小
   */
  const getQueueSize = useCallback(() => {
    return messageQueue.size()
  }, [messageQueue])

  /**
   * 获取当前对话上下文
   */
  const getContext = useCallback(() => {
    return contextTracker.getContext()
  }, [contextTracker])

  /**
   * 重置调度器状态
   */
  const reset = useCallback(() => {
    contextTracker.resetContext()
    messageQueue.clear()
    lastTopicRef.current = null
    pendingMemoryRef.current = false

    if (import.meta.env.DEV) {
      console.log(`🔄 [Orchestrator] 状态已重置`)
    }
  }, [contextTracker, messageQueue])

  return {
    onUserSpeech,
    onAISpeech,
    onTurnComplete,
    triggerMemoryRetrieval,
    getQueueSize,
    getContext,
    reset,
  }
}

export type { VirtualMessageOrchestratorResult }
