/**
 * # 虚拟消息调度器 Hook
 *
 * 核心调度器，整合所有虚拟消息系统组件：
 * - ConversationContextTracker: 追踪对话上下文
 * - TopicDetector: 检测话题和情绪变化（向量匹配）
 * - AsyncMemoryPipeline: 异步检索相关记忆
 *
 * ## 方案 2 实现：过渡话注入
 *
 * 核心流程：
 * 1. 用户说话 → 话题检测 → 异步检索记忆
 * 2. 记忆检索完成后立刻注入（sendClientContent + turnComplete=true + role='system'）
 * 3. AI 用过渡话开头（如 "I hear you..."），然后自然引用记忆
 *
 * 注意：不再使用队列等待，因为 turnComplete=false 会阻塞后续语音输入。
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import { useCallback, useRef, useEffect } from 'react'
import { useConversationContextTracker } from './useConversationContextTracker'
import { useTopicDetector } from './useTopicDetector'
import { useAsyncMemoryPipeline, generateContextMessage } from './useAsyncMemoryPipeline'
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
interface UseVirtualMessageOrchestratorOptions extends Omit<VirtualMessageOrchestratorOptions, 'onSendMessage' | 'cooldownMs'> {
  /**
   * 发送客户端内容的回调（立即注入）
   * 来自 useGeminiLive.sendClientContent
   * @param content - 要发送的内容
   * @param turnComplete - true=触发AI响应, false=静默（但会阻塞后续输入，不推荐）
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
  /** 处理用户说话事件（异步），返回话题检测结果 */
  onUserSpeech: (text: string) => Promise<TopicResultForResistance | null>
  /** 处理 AI 说话事件 */
  onAISpeech: (text: string) => void
  /** 处理 AI 说完话事件（turnComplete）- 方案 2 中仅用于更新状态 */
  onTurnComplete: () => void
  /** 手动触发记忆检索（用于调试） */
  triggerMemoryRetrieval: (topic: string, keywords?: string[]) => Promise<void>
  /** 获取当前对话上下文 */
  getContext: () => ReturnType<ReturnType<typeof useConversationContextTracker>['getContext']>
  /** 重置调度器状态 */
  reset: () => void
  /** 话题检测器是否正在检测 */
  isDetecting: boolean
  /**
   * 根据抗拒分析结果发送对应的虚拟消息
   * @param suggestedAction - 来自 analyzeResistance 的建议动作
   * @returns 是否成功发送
   */
  sendMessageForAction: (suggestedAction: SuggestedAction) => boolean
  /**
   * 发送温柔引导消息（用于情绪稳定后引导回任务）
   */
  sendGentleRedirect: () => boolean
}

/**
 * 虚拟消息调度器（方案 2：过渡话注入）
 */
export function useVirtualMessageOrchestrator(
  options: UseVirtualMessageOrchestratorOptions
): VirtualMessageOrchestratorResult {
  const {
    userId,
    taskDescription,
    initialDuration,
    taskStartTime,
    sendClientContent,
    isSpeaking,
    enabled = true,
    enableMemoryRetrieval = true,
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

  // =====================================================
  // Refs
  // =====================================================

  // 追踪上一次检测到的话题
  const lastTopicRef = useRef<TopicInfo | null>(null)
  // 追踪 AI 说话状态
  const isSpeakingRef = useRef<boolean>(isSpeaking)

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  // =====================================================
  // 核心方法：立即注入
  // =====================================================

  /**
   * 立即注入虚拟消息
   * 使用 sendClientContent + turnComplete=true + role='system'
   * AI 会用过渡话响应，然后引用注入的上下文
   */
  const injectMessageImmediately = useCallback((content: string, type: VirtualMessageType) => {
    const timestamp = new Date().toLocaleTimeString()
    console.log(`\n💉 [${timestamp}] ========== 立即注入 ${type} ==========`)
    console.log(`💉 [Orchestrator] 内容预览: ${content.substring(0, 100)}...`)

    // 使用 role='system' 确保 AI 把内容当作上下文而非用户问题
    // turnComplete=true 触发 AI 响应（AI 会用过渡话开头）
    sendClientContent(content, true, 'system')

    console.log(`💉 [Orchestrator] ✅ 已注入，等待 AI 响应`)
  }, [sendClientContent])

  // =====================================================
  // 消息生成方法
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
conversation_context: 用户正在讨论"${context.currentTopic || '未知话题'}"
last_user_said: "${context.recentUserSpeech?.substring(0, 50) || '(无)'}"
action: 用过渡话开头（如 "I hear you..." 或 "That sounds tough..."），然后倾听和安慰。`
  }, [contextTracker, preferredLanguage])

  /**
   * 生成倾听模式消息 [LISTEN_FIRST]
   */
  const generateListenFirstMessage = useCallback((): string => {
    const context = contextTracker.getVirtualMessageContext()

    return `[LISTEN_FIRST] language=${preferredLanguage}
user_context: "${context.recentUserSpeech?.substring(0, 100) || '(无)'}"
topic: ${context.currentTopic || '未知'}
action: 用过渡话开头，然后进入倾听模式。用户在分享情感内容，暂停任务相关话题。`
  }, [contextTracker, preferredLanguage])

  /**
   * 生成温柔引导消息 [GENTLE_REDIRECT]
   */
  const generateGentleRedirectMessage = useCallback((): string => {
    const elapsedMinutes = Math.floor((Date.now() - taskStartTime) / 60000)

    return `[GENTLE_REDIRECT] elapsed=${elapsedMinutes}m language=${preferredLanguage}
action: 用过渡话开头，然后轻柔地问用户是否想做点什么转移注意力。`
  }, [taskStartTime, preferredLanguage])

  /**
   * 生成接受停止消息 [ACCEPT_STOP]
   */
  const generateAcceptStopMessage = useCallback((): string => {
    return `[ACCEPT_STOP] language=${preferredLanguage}
action: 用过渡话开头（如 "I get it..."），然后优雅接受用户的选择，不要试图说服。`
  }, [preferredLanguage])

  /**
   * 生成推进小步骤消息 [PUSH_TINY_STEP]
   */
  const generatePushTinyStepMessage = useCallback((): string => {
    const context = contextTracker.getVirtualMessageContext()

    return `[PUSH_TINY_STEP] language=${preferredLanguage}
user_said: "${context.recentUserSpeech?.substring(0, 80) || '(无)'}"
task: ${taskDescription}
action: 用过渡话开头，简短承认用户的借口，然后提供一个更小的步骤。`
  }, [contextTracker, taskDescription, preferredLanguage])

  /**
   * 根据建议动作生成对应的虚拟消息
   */
  const generateMessageForAction = useCallback((
    suggestedAction: SuggestedAction
  ): { content: string; type: VirtualMessageType } | null => {
    switch (suggestedAction) {
      case 'empathy':
        return null // 由 EMPATHY 逻辑处理

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
        return null // 由 ToneManager 处理

      default:
        return null
    }
  }, [generateListenFirstMessage, generateAcceptStopMessage, generatePushTinyStepMessage])

  // =====================================================
  // 话题变化处理（方案 2：立即注入）
  // =====================================================

  /**
   * 处理话题变化，触发记忆检索并立即注入
   */
  const handleTopicChange = useCallback(async (
    topic: TopicInfo,
    emotionalState: EmotionalState,
    memoryQuestions?: string[]
  ) => {
    if (!enableMemoryRetrieval || !userId) {
      return
    }

    const timestamp = new Date().toLocaleTimeString()
    console.log(`\n🧠 [${timestamp}] ========== 开始记忆检索 ==========`)
    console.log(`🧠 [Orchestrator] 话题: ${topic.name}`)

    // 使用 API 返回的 memoryQuestions 作为种子问题
    const seedQuestions = memoryQuestions || []

    // 异步检索记忆
    const memories = await memoryPipeline.fetchMemoriesForTopic(
      topic.name,
      topic.keywords || [],
      contextTracker.getContext().summary,
      seedQuestions
    )

    console.log(`🧠 [Orchestrator] 记忆检索结果: ${memories.length} 条`)

    if (memories.length > 0) {
      console.log(`🧠 [Orchestrator] 记忆内容:`, memories.map(m => ({
        tag: m.tag,
        content: m.content.substring(0, 30) + '...'
      })))

      // 生成 [CONTEXT] 消息
      const contextMessage = generateContextMessage(
        memories,
        topic.name,
        emotionalState.primary,
        emotionalState.intensity
      )

      // 🆕 方案 2：立即注入，不入队
      injectMessageImmediately(contextMessage, 'CONTEXT')
    } else {
      console.log(`🧠 [Orchestrator] 未找到相关记忆`)
    }
  }, [
    enableMemoryRetrieval,
    userId,
    memoryPipeline,
    contextTracker,
    injectMessageImmediately,
  ])

  // =====================================================
  // 事件处理
  // =====================================================

  /**
   * 处理用户说话事件
   */
  const onUserSpeech = useCallback(async (text: string): Promise<TopicResultForResistance | null> => {
    if (!enabled) return null

    const timestamp = new Date().toLocaleTimeString()
    console.log(`\n🎤 [${timestamp}] ========== 用户说话 ==========`)
    console.log(`🎤 [Orchestrator] 内容: "${text.substring(0, 50)}..."`)

    // 更新上下文
    contextTracker.addUserMessage(text)

    // 异步检测话题和情绪（向量匹配）
    console.log(`🔍 [Orchestrator] 开始话题检测...`)
    const result = await topicDetector.detectFromMessage(text)

    console.log(`🔍 [Orchestrator] 话题检测完成:`, {
      topic: result.topic?.name || '无',
      confidence: result.confidence ? `${(result.confidence * 100).toFixed(1)}%` : 'N/A',
      emotion: result.emotionalState.primary,
      isTopicChanged: result.isTopicChanged,
    })

    // 更新情绪状态
    if (result.emotionalState.primary !== 'neutral') {
      contextTracker.updateEmotionalState(result.emotionalState)
    }

    // 检查是否需要情绪响应
    if (
      result.emotionalState.intensity >= EMOTION_RESPONSE_THRESHOLD &&
      result.emotionalState.primary !== 'neutral'
    ) {
      console.log(`\n💗 [${timestamp}] ========== 触发情绪响应 ==========`)

      const empathyMessage = generateEmpathyMessage(
        result.emotionalState.primary,
        result.emotionalState.intensity,
        result.emotionalState.trigger
      )

      // 🆕 方案 2：立即注入
      injectMessageImmediately(empathyMessage, 'EMPATHY')
    }

    // 处理话题变化
    if (result.topic) {
      contextTracker.updateTopic(result.topic)

      if (result.isTopicChanged) {
        console.log(`\n🏷️ [${timestamp}] ========== 话题变化 ==========`)
        console.log(`🏷️ [Orchestrator] 新话题: "${result.topic.name}"`)

        lastTopicRef.current = result.topic

        // 触发记忆检索并立即注入
        handleTopicChange(result.topic, result.emotionalState, result.memoryQuestions)
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
    generateEmpathyMessage,
    handleTopicChange,
    injectMessageImmediately,
  ])

  /**
   * 处理 AI 说话事件
   */
  const onAISpeech = useCallback((text: string) => {
    if (!enabled) return
    contextTracker.addAIMessage(text)
  }, [enabled, contextTracker])

  /**
   * 处理 AI 说完话事件（turnComplete）
   * 方案 2 中不再用于发送队列消息，仅用于日志
   */
  const onTurnComplete = useCallback(() => {
    if (!enabled) return

    if (import.meta.env.DEV) {
      const timestamp = new Date().toLocaleTimeString()
      console.log(`\n✅ [${timestamp}] ========== AI 说完话 (turnComplete) ==========`)
    }
  }, [enabled])

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

      injectMessageImmediately(contextMessage, 'CONTEXT')
    }
  }, [userId, memoryPipeline, injectMessageImmediately])

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
    lastTopicRef.current = null

    if (import.meta.env.DEV) {
      console.log(`🔄 [Orchestrator] 状态已重置`)
    }
  }, [contextTracker, topicDetector])

  /**
   * 根据抗拒分析结果发送对应的虚拟消息
   */
  const sendMessageForAction = useCallback((suggestedAction: SuggestedAction): boolean => {
    const messageData = generateMessageForAction(suggestedAction)

    if (!messageData) {
      return false
    }

    // 🆕 方案 2：立即注入
    injectMessageImmediately(messageData.content, messageData.type)

    if (import.meta.env.DEV) {
      console.log(`📤 [Orchestrator] 已发送 ${messageData.type} 消息 (action: ${suggestedAction})`)
    }

    return true
  }, [generateMessageForAction, injectMessageImmediately])

  /**
   * 发送温柔引导消息
   */
  const sendGentleRedirect = useCallback((): boolean => {
    const content = generateGentleRedirectMessage()

    injectMessageImmediately(content, 'GENTLE_REDIRECT')

    if (import.meta.env.DEV) {
      console.log(`📤 [Orchestrator] 已发送 GENTLE_REDIRECT 消息`)
    }

    return true
  }, [generateGentleRedirectMessage, injectMessageImmediately])

  return {
    onUserSpeech,
    onAISpeech,
    onTurnComplete,
    triggerMemoryRetrieval,
    getContext,
    reset,
    isDetecting: topicDetector.isDetecting,
    sendMessageForAction,
    sendGentleRedirect,
  }
}

export type { VirtualMessageOrchestratorResult }
