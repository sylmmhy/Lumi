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
  VirtualMessageType,
  TopicInfo,
  EmotionalState,
} from './types'
import { EMOTION_RESPONSE_THRESHOLD } from './constants'
import type { SuggestedAction } from '../useToneManager'

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
 * 话题检测结果（用于抗拒分析）
 */
export interface TopicResultForResistance {
  topic: { id: string; name: string } | null
  emotion?: 'happy' | 'sad' | 'anxious' | 'frustrated' | 'tired' | 'neutral'
  emotionIntensity?: number
  confidence?: number
}

/**
 * 调度器返回值
 */
interface VirtualMessageOrchestratorResult {
  /** 处理用户说话事件（异步，调用 Semantic Router API），返回话题检测结果 */
  onUserSpeech: (text: string) => Promise<TopicResultForResistance | null>
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
  /** 话题检测器是否正在加载 */
  isDetecting: boolean
  /**
   * 根据抗拒分析结果发送对应的虚拟消息
   * @param suggestedAction - 来自 analyzeResistance 的建议动作
   * @returns 是否成功入队
   */
  sendMessageForAction: (suggestedAction: SuggestedAction) => boolean
  /**
   * 发送温柔引导消息（用于情绪稳定后引导回任务）
   */
  sendGentleRedirect: () => boolean
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
   * 生成倾听模式消息 [LISTEN_FIRST]
   * 用于情感话题，AI 应该进入倾听模式，暂时不推任务
   */
  const generateListenFirstMessage = useCallback((): string => {
    const context = contextTracker.getVirtualMessageContext()

    return `[LISTEN_FIRST] language=${preferredLanguage}
user_context: "${context.recentUserSpeech?.substring(0, 100) || '(无)'}"
topic: ${context.currentTopic || '未知'}
action: 进入倾听模式。用户在分享情感内容，暂停任务相关话题。用开放式问题引导他们倾诉，不要提任务。`
  }, [contextTracker, preferredLanguage])

  /**
   * 生成温柔引导消息 [GENTLE_REDIRECT]
   * 用于情绪稳定后，轻柔引导回任务
   */
  const generateGentleRedirectMessage = useCallback((): string => {
    const elapsedMinutes = Math.floor((Date.now() - taskStartTime) / 60000)

    return `[GENTLE_REDIRECT] elapsed=${elapsedMinutes}m language=${preferredLanguage}
action: 用户情绪看起来稳定了。轻柔地问他们是否想做点什么转移注意力，把任务作为"小事"提出，压力要小。`
  }, [taskStartTime, preferredLanguage])

  /**
   * 生成接受停止消息 [ACCEPT_STOP]
   * 用于用户明确表示不想做时，优雅接受
   */
  const generateAcceptStopMessage = useCallback((): string => {
    return `[ACCEPT_STOP] language=${preferredLanguage}
action: 用户明确表示不想继续。优雅接受他们的选择，不要试图说服或提供替代方案。让他们知道你随时在这里。`
  }, [preferredLanguage])

  /**
   * 生成推进小步骤消息 [PUSH_TINY_STEP]
   * 用于普通任务抗拒（非情感），推进更小的步骤
   */
  const generatePushTinyStepMessage = useCallback((): string => {
    const context = contextTracker.getVirtualMessageContext()

    return `[PUSH_TINY_STEP] language=${preferredLanguage}
user_said: "${context.recentUserSpeech?.substring(0, 80) || '(无)'}"
task: ${taskDescription}
action: 用户在找借口（不是情感困扰）。简短承认他们的借口，然后提供一个更小的步骤。保持轻松的坚持。`
  }, [contextTracker, taskDescription, preferredLanguage])

  /**
   * 根据建议动作生成对应的虚拟消息
   *
   * @param suggestedAction - 来自 analyzeResistance 的建议动作
   * @returns 消息内容和类型
   */
  const generateMessageForAction = useCallback((
    suggestedAction: SuggestedAction
  ): { content: string; type: VirtualMessageType } | null => {
    switch (suggestedAction) {
      case 'empathy':
        // 高强度情感 → EMPATHY 消息（已有逻辑处理）
        return null // 由现有 EMPATHY 逻辑处理

      case 'listen':
        return {
          content: generateListenFirstMessage(),
          type: 'LISTEN_FIRST',
        }

      case 'accept_stop':
        return {
          content: generateAcceptStopMessage(),
          type: 'ACCEPT_STOP',
        }

      case 'tiny_step':
        return {
          content: generatePushTinyStepMessage(),
          type: 'PUSH_TINY_STEP',
        }

      case 'tone_shift':
        // TONE_SHIFT 由 ToneManager 直接处理
        return null

      default:
        return null
    }
  }, [generateListenFirstMessage, generateAcceptStopMessage, generatePushTinyStepMessage])

  /**
   * 处理话题变化，触发记忆检索
   *
   * @param topic - 检测到的话题
   * @param emotionalState - 检测到的情绪
   * @param memoryQuestions - Semantic Router 返回的记忆检索问题（可选）
   */
  const handleTopicChange = useCallback(async (
    topic: TopicInfo,
    emotionalState: EmotionalState,
    memoryQuestions?: string[]
  ) => {
    if (!enableMemoryRetrieval || !userId) {
      return
    }

    // 标记有待处理的记忆
    pendingMemoryRef.current = true

    // 使用 Semantic Router 返回的记忆检索问题作为种子
    const seedQuestions = memoryQuestions || []

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
    memoryPipeline,
    contextTracker,
    messageQueue,
  ])

  /**
   * 处理用户说话事件（使用 Semantic Router 异步检测）
   * 返回话题检测结果，供抗拒分析使用
   */
  const onUserSpeech = useCallback(async (text: string): Promise<TopicResultForResistance | null> => {
    if (!enabled) return null

    // 更新上下文
    contextTracker.addUserMessage(text)

    // 异步检测话题和情绪（调用 Semantic Router API）
    const result = await topicDetector.detectFromMessageAsync(text)

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
            confidence: result.confidence ? `${(result.confidence * 100).toFixed(1)}%` : 'N/A',
            shouldRetrieveMemory: result.shouldRetrieveMemory,
          })
        }

        // 如果 Semantic Router 建议检索记忆，触发异步记忆检索
        if (result.shouldRetrieveMemory) {
          handleTopicChange(result.topic, result.emotionalState, result.memoryQuestions)
        }
      }
    }

    // 返回话题检测结果（用于抗拒分析）
    return {
      topic: result.topic ? { id: result.topic.id, name: result.topic.name } : null,
      emotion: result.emotionalState.primary,
      emotionIntensity: result.emotionalState.intensity,
      confidence: result.confidence,
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

  /**
   * 根据抗拒分析结果发送对应的虚拟消息
   *
   * @param suggestedAction - 来自 analyzeResistance 的建议动作
   * @returns 是否成功入队
   */
  const sendMessageForAction = useCallback((suggestedAction: SuggestedAction): boolean => {
    const messageData = generateMessageForAction(suggestedAction)

    if (!messageData) {
      // empathy 和 tone_shift 由其他逻辑处理
      return false
    }

    // 根据消息类型设置优先级
    const priority = messageData.type === 'LISTEN_FIRST' ? 'urgent' as const
      : messageData.type === 'ACCEPT_STOP' ? 'high' as const
      : 'high' as const

    messageQueue.enqueue({
      type: messageData.type,
      priority,
      content: messageData.content,
    })

    if (import.meta.env.DEV) {
      console.log(`📤 [Orchestrator] 入队 ${messageData.type} 消息 (action: ${suggestedAction})`)
    }

    return true
  }, [generateMessageForAction, messageQueue])

  /**
   * 发送温柔引导消息
   * 用于情绪稳定后引导回任务
   */
  const sendGentleRedirect = useCallback((): boolean => {
    const content = generateGentleRedirectMessage()

    messageQueue.enqueue({
      type: 'GENTLE_REDIRECT',
      priority: 'normal',
      content,
    })

    if (import.meta.env.DEV) {
      console.log(`📤 [Orchestrator] 入队 GENTLE_REDIRECT 消息`)
    }

    return true
  }, [generateGentleRedirectMessage, messageQueue])

  return {
    onUserSpeech,
    onAISpeech,
    onTurnComplete,
    triggerMemoryRetrieval,
    getQueueSize,
    getContext,
    reset,
    isDetecting: topicDetector.isLoading,
    sendMessageForAction,
    sendGentleRedirect,
  }
}

export type { VirtualMessageOrchestratorResult }
