/**
 * # 虚拟消息调度器 Hook
 *
 * 核心调度器，整合所有虚拟消息系统组件：
 * - ConversationContextTracker: 追踪对话上下文
 * - TopicDetector: 检测话题和情绪变化（向量匹配版）
 * - AsyncMemoryPipeline: 异步检索相关记忆
 * - VirtualMessageQueue: 消息队列管理
 *
 * ## 方案 1 实现：AI 说话时立即打断并注入记忆
 *
 * 核心流程：
 * 1. 用户说话 → 话题检测（向量匹配）→ 异步检索记忆
 * 2. 如果检索到记忆且 AI 正在说话：
 *    - 使用 sendClientContent(content, true) 打断 AI 并注入记忆
 *    - AI 会重新响应，这次会用上记忆中的信息
 * 3. 如果 AI 没在说话：
 *    - 入队等待 turnComplete 后静默注入
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
 *   sendClientContent: geminiLive.sendClientContent, // 方案 1 必需
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

import { useCallback, useRef, useEffect, useState } from 'react'
import { useConversationContextTracker } from './useConversationContextTracker'
import { useTopicDetector, type TopicDetectionResultExtended } from './useTopicDetector'
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
   * 发送客户端内容的回调（支持打断 AI）
   * 来自 useGeminiLive.sendClientContent
   * @param content - 要发送的内容
   * @param turnComplete - true=打断AI并触发新响应, false=静默注入
   * @param role - 'user' 或 'system'，用 'system' 注入记忆上下文
   */
  sendClientContent: (content: string, turnComplete?: boolean, role?: 'user' | 'system') => void
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
  /** 是否正在检测话题 */
  isDetectingTopic: boolean
  /** 待处理的记忆（调试用） */
  pendingMemory: { topic: string; count: number } | null
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
    sendClientContent,
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

  // 话题检测器（向量版）
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
  // State & Refs
  // =====================================================

  // 追踪上一次检测到的话题
  const lastTopicRef = useRef<TopicInfo | null>(null)
  // 追踪 AI 说话状态
  const isSpeakingRef = useRef<boolean>(isSpeaking)
  // 待处理的记忆（调试用）
  const [pendingMemory, setPendingMemory] = useState<{ topic: string; count: number } | null>(null)

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
   * 处理话题检测结果，触发记忆检索
   */
  const handleTopicDetectionResult = useCallback(async (
    result: TopicDetectionResultExtended,
    userText: string
  ) => {
    const timestamp = new Date().toLocaleTimeString()

    // 更新情绪状态
    if (result.emotionalState.primary !== 'neutral') {
      console.log(`💭 [Orchestrator] 更新情绪状态: ${result.emotionalState.primary} (强度: ${result.emotionalState.intensity.toFixed(2)})`)
      contextTracker.updateEmotionalState(result.emotionalState)
    }

    // 检查是否需要情绪响应
    if (
      result.emotionalState.intensity >= EMOTION_RESPONSE_THRESHOLD &&
      result.emotionalState.primary !== 'neutral'
    ) {
      console.log(`\n💗 [${timestamp}] ========== 触发情绪响应 ==========`)
      console.log(`💗 [Orchestrator] 情绪强度 ${result.emotionalState.intensity.toFixed(2)} >= 阈值 ${EMOTION_RESPONSE_THRESHOLD}`)
      
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

      console.log(`💗 [Orchestrator] 已入队 [EMPATHY] 消息`, {
        emotion: result.emotionalState.primary,
        intensity: result.emotionalState.intensity,
        queueSize: messageQueue.size(),
      })
    }

    // 处理话题变化
    if (result.topic) {
      contextTracker.updateTopic(result.topic)

      if (result.isTopicChanged) {
        console.log(`\n🏷️ [${timestamp}] ========== 话题变化 ==========`)
        console.log(`🏷️ [Orchestrator] 新话题: "${result.topic.name}" (置信度: ${(result.confidence * 100).toFixed(1)}%)`)
        console.log(`🏷️ [Orchestrator] 记忆检索问题:`, result.memoryQuestions)
        
        lastTopicRef.current = result.topic

        // 触发异步记忆检索
        if (enableMemoryRetrieval && userId) {
          console.log(`\n🧠 [${timestamp}] ========== 开始记忆检索 ==========`)
          console.log(`🧠 [Orchestrator] 用户ID: ${userId}`)
          console.log(`🧠 [Orchestrator] 话题: ${result.topic.name}`)
          
          setPendingMemory({ topic: result.topic.name, count: 0 })

          // 使用 API 返回的 memoryQuestions 作为种子问题
          const memories = await memoryPipeline.fetchMemoriesForTopic(
            result.topic.name,
            [], // 向量匹配不需要关键词
            contextTracker.getContext().summary,
            result.memoryQuestions
          )

          console.log(`🧠 [Orchestrator] 记忆检索结果: ${memories.length} 条`)
          if (memories.length > 0) {
            console.log(`🧠 [Orchestrator] 记忆内容:`, memories.map(m => ({ tag: m.tag, content: m.content.substring(0, 30) + '...' })))
            
            // 生成 [CONTEXT] 消息
            const contextMessage = generateContextMessage(
              memories,
              result.topic.name,
              result.emotionalState.primary,
              result.emotionalState.intensity
            )

            setPendingMemory({ topic: result.topic.name, count: memories.length })

            // 💡 方案 1：如果 AI 正在说话，立即打断并注入记忆
            // 根据 Google 官方文档，使用 role='system' 来注入上下文/记忆
            if (isSpeakingRef.current) {
              console.log(`\n🚨 [方案 1 + system role] ========== AI 正在说话，立即打断并注入记忆 ==========`)
              console.log(`🚨 [Orchestrator] 话题: ${result.topic.name}`)
              console.log(`🚨 [Orchestrator] 记忆数: ${memories.length}`)
              console.log(`🚨 [Orchestrator] 消息预览: ${contextMessage.substring(0, 100)}...`)
              
              // 使用 sendClientContent + turnComplete=true + role='system' 打断 AI 并注入记忆
              // role='system' 确保 AI 把这些内容当作上下文而不是用户问题
              sendClientContent(contextMessage, true, 'system')
              
              console.log(`🚨 [Orchestrator] ✅ 记忆已注入 (role=system)，AI 将重新响应`)
            } else {
              // AI 没在说话，入队等待
              messageQueue.enqueue({
                type: 'CONTEXT',
                priority: 'normal',
                content: contextMessage,
                relatedTopic: result.topic.name,
              })

              console.log(`\n📥 [${timestamp}] ========== 入队 CONTEXT 消息 ==========`)
              console.log(`📥 [Orchestrator] 话题: ${result.topic.name}`)
              console.log(`📥 [Orchestrator] 记忆数: ${memories.length}`)
              console.log(`📥 [Orchestrator] 队列大小: ${messageQueue.size()}`)
              console.log(`📥 [Orchestrator] 消息预览: ${contextMessage.substring(0, 100)}...`)
            }
          } else {
            console.log(`🧠 [Orchestrator] 未找到相关记忆`)
            setPendingMemory(null)
          }
        } else {
          console.log(`🧠 [Orchestrator] 跳过记忆检索 (enableMemoryRetrieval=${enableMemoryRetrieval}, userId=${userId})`)
        }
      }
    }
  }, [
    enableMemoryRetrieval,
    userId,
    memoryPipeline,
    contextTracker,
    messageQueue,
    generateEmpathyMessage,
    sendClientContent,
  ])

  /**
   * 处理用户说话事件
   */
  const onUserSpeech = useCallback((text: string) => {
    if (!enabled) return

    const timestamp = new Date().toLocaleTimeString()
    console.log(`\n🎤 [${timestamp}] ========== 用户说话 ==========`)
    console.log(`🎤 [Orchestrator] 内容: "${text.substring(0, 50)}..."`)

    // 更新上下文
    contextTracker.addUserMessage(text)

    // 异步检测话题和情绪（向量匹配）
    console.log(`🔍 [Orchestrator] 开始话题检测 (向量匹配)...`)
    topicDetector.detectFromMessage(text).then((result) => {
      console.log(`🔍 [Orchestrator] 话题检测完成:`, {
        topic: result.topic?.name || '无',
        confidence: result.confidence ? `${(result.confidence * 100).toFixed(1)}%` : 'N/A',
        emotion: result.emotionalState.primary,
        isTopicChanged: result.isTopicChanged,
      })
      handleTopicDetectionResult(result, text)
    }).catch((err) => {
      console.error('🏷️ [Orchestrator] 话题检测失败:', err)
      
      // 失败时使用本地情绪检测作为 fallback
      const localEmotion = topicDetector.detectEmotionLocally(text)
      if (localEmotion.primary !== 'neutral') {
        contextTracker.updateEmotionalState(localEmotion)
      }
    })
  }, [
    enabled,
    contextTracker,
    topicDetector,
    handleTopicDetectionResult,
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

    const timestamp = new Date().toLocaleTimeString()
    console.log(`\n✅ [${timestamp}] ========== AI 说完话 (turnComplete) ==========`)
    console.log(`✅ [Orchestrator] 队列大小: ${messageQueue.size()}`)
    console.log(`✅ [Orchestrator] 冷却中: ${messageQueue.isInCooldown()}`)

    // 尝试发送队列中的消息
    // injectContextSilently 会检查是否在安全窗口期
    const sent = messageQueue.tryFlush()

    if (sent) {
      console.log(`📤 [${timestamp}] ========== 发送虚拟消息成功 ==========`)
      console.log(`📤 [Orchestrator] 消息已注入到 AI 上下文`)
    } else if (messageQueue.size() > 0) {
      console.log(`⏳ [Orchestrator] 队列有消息但未发送 (可能在冷却中)`)
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
    topicDetector.reset()
    messageQueue.clear()
    lastTopicRef.current = null
    setPendingMemory(null)

    if (import.meta.env.DEV) {
      console.log(`🔄 [Orchestrator] 状态已重置`)
    }
  }, [contextTracker, topicDetector, messageQueue])

  return {
    onUserSpeech,
    onAISpeech,
    onTurnComplete,
    triggerMemoryRetrieval,
    getQueueSize,
    getContext,
    reset,
    isDetectingTopic: topicDetector.isDetecting,
    pendingMemory,
  }
}

export type { VirtualMessageOrchestratorResult }
