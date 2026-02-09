/**
 * # 虚拟消息调度器 Hook
 *
 * 核心调度器，整合所有虚拟消息系统组件：
 * - ConversationContextTracker: 追踪对话上下文
 * - TopicDetector: 检测话题和情绪变化（向量匹配）
 * - AsyncMemoryPipeline: 异步检索相关记忆
 *
 * ## 方案 B 实现：同步等待记忆 + 静默注入
 *
 * 核心流程：
 * 1. 用户说话 → 同步等待记忆检索（最多1秒）
 * 2. 记忆 + 用户的话静默注入（turnComplete=false）
 * 3. AI 带着记忆自然回复
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import { useCallback, useRef, useEffect } from 'react'
import { useConversationContextTracker } from './useConversationContextTracker'
import { useAsyncMemoryPipeline, generateContextMessage } from './useAsyncMemoryPipeline'
import { EMOTION_KEYWORDS, EMOTION_INTENSIFIERS, EMOTION_DIMINISHERS } from './constants'
import type {
  VirtualMessageOrchestratorOptions,
  VirtualMessageType,
  TopicInfo,
  EmotionalState,
  VirtualMessageUserContext,
} from './types'
import { EMOTION_RESPONSE_THRESHOLD } from './constants'

/**
 * 虚拟消息系统调试日志。
 *
 * 注意：
 * - 本模块会处理用户原始输入与记忆内容，生产环境默认不输出任何日志，
 *   避免泄露用户隐私或污染控制台。
 */
const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) {
    console.log(...args)
  }
}

/**
 * 调度器配置（扩展基础配置）
 */
interface UseVirtualMessageOrchestratorOptions extends Omit<VirtualMessageOrchestratorOptions, 'onSendMessage' | 'cooldownMs'> {
  /**
   * 发送客户端内容的回调（立即注入）
   * 来自 useGeminiLive.sendClientContent
   * @param content - 要发送的内容
   * @param turnComplete - true=触发AI响应, false=静默（但会阻塞后续输入，不推荐）
   * @param role - 消息角色，默认 'user'（Gemini Live API 只支持 'user'）
   */
  sendClientContent: (content: string, turnComplete?: boolean, role?: 'user') => void
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
  /** 获取定时虚拟消息系统用的上下文（给“智能小纸条”用） */
  getVirtualMessageContext: () => VirtualMessageUserContext
  /** 重置调度器状态 */
  reset: () => void
  /** 话题检测器是否正在检测 */
  isDetecting: boolean
  /**
   * 发送温柔引导消息（用于情绪稳定后引导回任务）
   */
  sendGentleRedirect: () => boolean
}

/**
 * 虚拟消息调度器（方案 B：同步等待记忆）
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

  // US-012: useTopicDetector 已删除 — 话题检测由统一裁判 (detect-intent) 处理
  // 情绪检测使用本地关键词匹配（不依赖 API）

  // 异步记忆管道
  const memoryPipeline = useAsyncMemoryPipeline(userId)

  // =====================================================
  // Refs
  // =====================================================

  // 追踪上一次检测到的话题
  const lastTopicRef = useRef<TopicInfo | null>(null)
  // 追踪 AI 说话状态
  const isSpeakingRef = useRef<boolean>(isSpeaking)
  // 追踪最新的 enabled 状态（异步操作完成后实时检查，防止篝火模式进入时仍然注入记忆）
  const enabledRef = useRef<boolean>(enabled)
  // 🔧 追踪本次会话已注入的记忆内容（用于去重）
  const injectedMemoriesRef = useRef<Set<string>>(new Set())
  // 🔧 追踪最后一次记忆注入时间（用于节流）
  const lastMemoryInjectionTimeRef = useRef<number>(0)

  useEffect(() => {
    isSpeakingRef.current = isSpeaking
  }, [isSpeaking])

  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  // =====================================================
  // 核心方法：立即注入
  // =====================================================

  /**
   * 立即注入虚拟消息
   * 使用 sendClientContent + turnComplete=true + role='user'
   * 注意：Gemini Live API 只支持 role='user'，不支持 'system'
   * AI 会用过渡话响应，然后引用注入的上下文
   */
  const injectMessageImmediately = useCallback((content: string, type: VirtualMessageType) => {
    const timestamp = new Date().toLocaleTimeString()
    devLog(`\n💉 [${timestamp}] ========== 立即注入 ${type} ==========`)
    devLog(`💉 [Orchestrator] 内容预览: ${content.substring(0, 100)}...`)

    // Gemini Live API 只支持 role='user'，所以用 [CONTEXT] 标签让 AI 识别这是系统指令
    // turnComplete=true 触发 AI 响应（AI 会用过渡话开头）
    sendClientContent(content, true, 'user')

    devLog(`💉 [Orchestrator] ✅ 已注入，等待 AI 响应`)
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
   * 生成温柔引导消息 [GENTLE_REDIRECT]
   */
  const generateGentleRedirectMessage = useCallback((): string => {
    const elapsedMinutes = Math.floor((Date.now() - taskStartTime) / 60000)

    return `[GENTLE_REDIRECT] elapsed=${elapsedMinutes}m language=${preferredLanguage}
action: 用过渡话开头，然后轻柔地问用户是否想做点什么转移注意力。`
  }, [taskStartTime, preferredLanguage])

  // =====================================================
  // 事件处理
  // =====================================================

  /**
   * 本地情绪检测（关键词匹配，替代 useTopicDetector 中的情绪部分）
   */
  const detectEmotionLocally = useCallback((text: string): {
    primary: EmotionalState['primary'];
    intensity: number;
    trigger?: string;
  } => {
    const lowerText = text.toLowerCase()
    let primary: EmotionalState['primary'] = 'neutral'
    let intensity = 0.3
    let trigger: string | undefined

    // 关键词匹配
    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          primary = emotion as EmotionalState['primary']
          intensity = 0.6
          trigger = keyword
          break
        }
      }
      if (primary !== 'neutral') break
    }

    // 强度修饰词
    if (primary !== 'neutral') {
      for (const word of EMOTION_INTENSIFIERS) {
        if (lowerText.includes(word)) {
          intensity = Math.min(1.0, intensity + 0.2)
          break
        }
      }
      for (const word of EMOTION_DIMINISHERS) {
        if (lowerText.includes(word)) {
          intensity = Math.max(0.1, intensity - 0.2)
          break
        }
      }
    }

    return { primary, intensity, trigger }
  }, [])

  /**
   * 处理用户说话事件
   * US-012: 移除 useTopicDetector，话题检测由统一裁判处理
   * 保留本地情绪检测 + 上下文追踪
   */
  const onUserSpeech = useCallback(async (text: string): Promise<TopicResultForResistance | null> => {
    if (!enabled) return null

    const timestamp = new Date().toLocaleTimeString()
    devLog(`\n🎤 [${timestamp}] ========== 用户说话 ==========`)
    devLog(`🎤 [Orchestrator] 内容: "${text.substring(0, 50)}..."`)

    // 更新上下文
    contextTracker.addUserMessage(text)

    // 本地情绪检测（不调用 API）
    const emotionResult = detectEmotionLocally(text)

    devLog(`🔍 [Orchestrator] 本地情绪检测:`, {
      emotion: emotionResult.primary,
      intensity: emotionResult.intensity,
    })

    // 更新情绪状态
    if (emotionResult.primary !== 'neutral') {
      contextTracker.updateEmotionalState({
        primary: emotionResult.primary,
        intensity: emotionResult.intensity,
        trigger: emotionResult.trigger,
        detectedAt: Date.now(),
      })
    }

    // 检查是否需要情绪响应
    if (
      enabledRef.current &&
      emotionResult.intensity >= EMOTION_RESPONSE_THRESHOLD &&
      emotionResult.primary !== 'neutral'
    ) {
      devLog(`\n💗 [${timestamp}] ========== 触发情绪响应 ==========`)

      const empathyMessage = generateEmpathyMessage(
        emotionResult.primary,
        emotionResult.intensity,
        emotionResult.trigger
      )

      sendClientContent(empathyMessage, false, 'user')
      devLog(`✅ [Orchestrator] EMPATHY 已静默注入`)
    }

    // US-012: 话题检测和记忆注入由统一裁判 (detect-intent) 处理
    // 不再在此处调用 topicDetector.detectFromMessage 或 memoryPipeline.fetchMemoriesForTopic

    // 返回简化的情绪检测结果
    return {
      topic: null, // 话题检测由裁判处理
      emotion: emotionResult.primary,
      emotionIntensity: emotionResult.intensity,
    }
  }, [
    enabled,
    contextTracker,
    detectEmotionLocally,
    generateEmpathyMessage,
    sendClientContent,
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
   */
  const onTurnComplete = useCallback(() => {
    if (!enabled) return

    const timestamp = new Date().toLocaleTimeString()
    devLog(`\n✅ [${timestamp}] ========== AI 说完话 (turnComplete) ==========`)
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
   * 获取定时虚拟消息系统用的上下文快照
   */
  const getVirtualMessageContext = useCallback(() => {
    return contextTracker.getVirtualMessageContext()
  }, [contextTracker])

  /**
   * 重置调度器状态
   */
  const reset = useCallback(() => {
    contextTracker.resetContext()
    lastTopicRef.current = null
    // 🔧 清空已注入记忆的记录
    injectedMemoriesRef.current.clear()
    lastMemoryInjectionTimeRef.current = 0
    devLog(`🔄 [Orchestrator] 状态已重置（含记忆去重记录）`)
  }, [contextTracker])

  /**
   * 发送温柔引导消息
   */
  const sendGentleRedirect = useCallback((): boolean => {
    const content = generateGentleRedirectMessage()

    injectMessageImmediately(content, 'GENTLE_REDIRECT')
    devLog(`📤 [Orchestrator] 已发送 GENTLE_REDIRECT 消息`)

    return true
  }, [generateGentleRedirectMessage, injectMessageImmediately])

  return {
    onUserSpeech,
    onAISpeech,
    onTurnComplete,
    triggerMemoryRetrieval,
    getContext,
    getVirtualMessageContext,
    reset,
    isDetecting: false, // US-012: topic detection moved to referee, no async detection
    sendGentleRedirect,
  }
}

export type { VirtualMessageOrchestratorResult }
