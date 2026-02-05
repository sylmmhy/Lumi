/**
 * # 对话上下文追踪器 Hook
 *
 * 追踪 Gemini Live 对话的实时上下文，为虚拟消息系统提供：
 * - 最近 N 条对话消息
 * - 当前话题和话题流转
 * - 用户情绪状态
 * - 对话阶段推断
 *
 * @example
 * ```typescript
 * const tracker = useConversationContextTracker({
 *   taskDescription: '完成今天的任务',
 *   initialDuration: 300,
 *   taskStartTime: Date.now(),
 * })
 *
 * // 用户说话时
 * tracker.addUserMessage('我有点不想做...')
 *
 * // AI 回复时
 * tracker.addAIMessage('我理解你的感受...')
 *
 * // 获取当前上下文
 * const context = tracker.getVirtualMessageContext()
 * ```
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import { useRef, useCallback } from 'react'
import type {
  ConversationContext,
  ContextMessage,
  TopicInfo,
  EmotionalState,
  VirtualMessageUserContext,
  ConversationContextTrackerOptions,
} from './types'

/**
 * 默认的情绪状态
 */
const DEFAULT_EMOTIONAL_STATE: EmotionalState = {
  primary: 'neutral',
  intensity: 0,
  detectedAt: 0,
}

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
export function useConversationContextTracker(options: ConversationContextTrackerOptions) {
  const {
    maxRecentMessages = 10,
    maxTopicHistory = 5,
    taskDescription,
    initialDuration,
    taskStartTime,
  } = options

  // DEV: AI 消息 log 缓冲区，将流式碎片拼接后再输出
  const aiLogBufferRef = useRef('')
  const aiLogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  })

  /**
   * 内部：更新对话阶段
   */
  const updatePhase = useCallback((ctx: ConversationContext) => {
    const messageCount = ctx.recentMessages.length
    const elapsed = Date.now() - ctx.sessionStartTime
    const elapsedMinutes = elapsed / 1000 / 60

    // 情绪优先
    if (ctx.emotionalState.intensity > 0.6 && ctx.emotionalState.primary !== 'neutral') {
      ctx.phase = 'emotional'
      return
    }

    // 根据消息数量和时间推断阶段
    if (messageCount <= 2) {
      ctx.phase = 'greeting'
    } else if (messageCount <= 6) {
      ctx.phase = 'exploring'
    } else if (elapsedMinutes > initialDuration / 60 * 0.8) {
      // 超过 80% 时间，进入收尾阶段
      ctx.phase = 'wrapping_up'
    } else {
      ctx.phase = 'deep_discussion'
    }
  }, [initialDuration])

  /**
   * 添加用户消息
   */
  const addUserMessage = useCallback((content: string, isVirtualTriggered = false) => {
    const now = Date.now()
    const message: ContextMessage = {
      role: 'user',
      content,
      timestamp: now,
      isVirtualTriggered,
    }

    const ctx = contextRef.current
    ctx.recentMessages = [...ctx.recentMessages, message].slice(-maxRecentMessages)
    ctx.lastUserSpeech = content
    ctx.lastActivityTime = now

    // 更新对话阶段
    updatePhase(ctx)

    if (import.meta.env.DEV) {
      console.log('📝 [ContextTracker] 添加用户消息:', content.substring(0, 50))
    }
  }, [maxRecentMessages, updatePhase])

  /**
   * 添加 AI 消息
   */
  const addAIMessage = useCallback((content: string, isVirtualTriggered = false) => {
    const now = Date.now()
    const message: ContextMessage = {
      role: 'assistant',
      content,
      timestamp: now,
      isVirtualTriggered,
    }

    const ctx = contextRef.current
    ctx.recentMessages = [...ctx.recentMessages, message].slice(-maxRecentMessages)
    ctx.lastAISpeech = content
    ctx.lastActivityTime = now

    // 更新对话阶段
    updatePhase(ctx)

    if (import.meta.env.DEV) {
      // 累积流式碎片，500ms 无新消息后输出完整句子
      aiLogBufferRef.current += content
      if (aiLogTimerRef.current) clearTimeout(aiLogTimerRef.current)
      aiLogTimerRef.current = setTimeout(() => {
        console.log('🤖 [ContextTracker] 添加 AI 消息:', aiLogBufferRef.current)
        aiLogBufferRef.current = ''
      }, 500)
    }
  }, [maxRecentMessages, updatePhase])

  /**
   * 更新当前话题
   */
  const updateTopic = useCallback((topic: TopicInfo) => {
    const ctx = contextRef.current

    // 如果是新话题，添加到流转历史
    if (!ctx.currentTopic || ctx.currentTopic.id !== topic.id) {
      ctx.topicFlow = [...ctx.topicFlow, topic].slice(-maxTopicHistory)

      if (import.meta.env.DEV) {
        console.log('🏷️ [ContextTracker] 话题变更:', ctx.currentTopic?.name, '→', topic.name)
      }
    }

    ctx.currentTopic = topic
  }, [maxTopicHistory])

  /**
   * 更新情绪状态
   */
  const updateEmotionalState = useCallback((state: EmotionalState) => {
    const ctx = contextRef.current
    ctx.emotionalState = state

    // 如果检测到强烈情绪，进入情绪处理阶段
    if (state.intensity > 0.6 && state.primary !== 'neutral') {
      ctx.phase = 'emotional'
    }

    if (import.meta.env.DEV) {
      console.log('💭 [ContextTracker] 情绪更新:', state.primary, `(${state.intensity})`)
    }
  }, [])

  /**
   * 更新对话摘要
   */
  const updateSummary = useCallback((summary: string) => {
    contextRef.current.summary = summary
    if (import.meta.env.DEV) {
      console.log('📋 [ContextTracker] 摘要更新:', summary)
    }
  }, [])

  /**
   * 获取当前上下文快照
   */
  const getContext = useCallback((): ConversationContext => {
    return { ...contextRef.current }
  }, [])

  /**
   * 生成供虚拟消息系统使用的用户上下文
   */
  const getVirtualMessageContext = useCallback((): VirtualMessageUserContext => {
    const ctx = contextRef.current
    const now = Date.now()
    const elapsed = now - taskStartTime
    const elapsedSeconds = Math.floor(elapsed / 1000)
    const elapsedMinutes = Math.floor(elapsedSeconds / 60)
    const remainingSeconds = Math.max(0, initialDuration - elapsedSeconds)
    const remainingMinutes = Math.floor(remainingSeconds / 60)

    // 格式化当前时间
    const currentTime = new Date().toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })

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
    }
  }, [taskDescription, taskStartTime, initialDuration])

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
    }
  }, [])

  /**
   * 获取最近 N 条消息的摘要文本
   */
  const getRecentMessagesSummary = useCallback((count: number = 5): string => {
    const ctx = contextRef.current
    const messages = ctx.recentMessages.slice(-count)
    return messages
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
      .join('\n')
  }, [])

  return {
    addUserMessage,
    addAIMessage,
    updateTopic,
    updateEmotionalState,
    updateSummary,
    getContext,
    getVirtualMessageContext,
    resetContext,
    getRecentMessagesSummary,
  }
}

export type ConversationContextTracker = ReturnType<typeof useConversationContextTracker>
