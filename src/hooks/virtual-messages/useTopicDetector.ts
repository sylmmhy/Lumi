/**
 * # 话题/情绪检测器 Hook (Semantic Router 版)
 *
 * 使用语义相似度（而非关键词匹配）检测用户消息中的话题和情绪。
 *
 * ## 原理
 * 1. 调用 `get-topic-embedding` Edge Function
 * 2. 后端计算用户输入与预定义话题的语义相似度
 * 3. 返回最匹配的话题和情绪
 *
 * ## 优点
 * - 多语言支持：中文、英文、繁体自动识别
 * - 语义理解："他走了" 能匹配 "分手" 话题
 * - 无需维护大量关键词
 *
 * @example
 * ```typescript
 * const { detectFromMessageAsync, isLoading } = useTopicDetector()
 *
 * // 异步检测用户消息
 * const result = await detectFromMessageAsync('我男朋友可能不来了')
 * // result = {
 * //   topic: { id: 'relationship_issue', name: '感情问题', ... },
 * //   emotionalState: { primary: 'sad', intensity: 0.7, ... },
 * //   isTopicChanged: true,
 * //   confidence: 0.87,
 * //   shouldRetrieveMemory: true,
 * //   memoryQuestions: [...]
 * // }
 * ```
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages-progress.md
 */

import { useRef, useCallback, useState } from 'react'
import { supabase } from '../../lib/supabase'
import type {
  TopicInfo,
  EmotionalState,
  TopicDetectionResult,
  SemanticRouterResponse,
} from './types'
import {
  EMOTION_KEYWORDS,
  EMOTION_INTENSIFIERS,
  EMOTION_DIMINISHERS,
} from './constants'

// =====================================================
// 配置
// =====================================================

/** 默认匹配阈值 */
const DEFAULT_THRESHOLD = 0.65

/** API 超时时间（毫秒） */
const API_TIMEOUT_MS = 5000

// =====================================================
// Hook
// =====================================================

/**
 * 话题/情绪检测器 (Semantic Router 版)
 */
export function useTopicDetector() {
  // 追踪当前话题（用于判断是否变化）
  const currentTopicRef = useRef<TopicInfo | null>(null)

  // 加载状态
  const [isLoading, setIsLoading] = useState(false)

  // 防抖用的上一次请求 ID
  const lastRequestIdRef = useRef<number>(0)

  // 缓存最近的检测结果（避免重复 API 调用）
  const cacheRef = useRef<Map<string, { result: TopicDetectionResult; timestamp: number }>>(
    new Map()
  )

  /**
   * 从缓存获取结果（1分钟内有效）
   */
  const getCachedResult = useCallback((text: string): TopicDetectionResult | null => {
    const cached = cacheRef.current.get(text)
    if (cached && Date.now() - cached.timestamp < 60000) {
      return cached.result
    }
    return null
  }, [])

  /**
   * 保存结果到缓存
   */
  const setCachedResult = useCallback((text: string, result: TopicDetectionResult) => {
    cacheRef.current.set(text, { result, timestamp: Date.now() })

    // 限制缓存大小
    if (cacheRef.current.size > 50) {
      const oldestKey = cacheRef.current.keys().next().value
      if (oldestKey) {
        cacheRef.current.delete(oldestKey)
      }
    }
  }, [])

  /**
   * 本地情绪检测（作为 API 失败时的备用）
   */
  const detectEmotionLocal = useCallback((text: string): EmotionalState => {
    const lowerText = text.toLowerCase()
    let detectedEmotion: EmotionalState['primary'] = 'neutral'
    let maxScore = 0
    let trigger: string | undefined

    // 检查情绪关键词
    for (const [emotion, keywords] of Object.entries(EMOTION_KEYWORDS)) {
      if (emotion === 'neutral') continue

      let score = 0
      for (const keyword of keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          score += 1
          if (!trigger) trigger = keyword
        }
      }

      if (score > maxScore) {
        maxScore = score
        detectedEmotion = emotion as EmotionalState['primary']
      }
    }

    // 计算情绪强度
    let intensity = 0.3

    if (maxScore > 0) {
      intensity = Math.min(1, 0.4 + maxScore * 0.15)
    }

    // 检查强化词
    for (const intensifier of EMOTION_INTENSIFIERS) {
      if (lowerText.includes(intensifier)) {
        intensity = Math.min(1, intensity + 0.15)
        break
      }
    }

    // 检查弱化词
    for (const diminisher of EMOTION_DIMINISHERS) {
      if (lowerText.includes(diminisher)) {
        intensity = Math.max(0, intensity - 0.2)
        break
      }
    }

    return {
      primary: detectedEmotion,
      intensity,
      detectedAt: Date.now(),
      trigger,
    }
  }, [])

  /**
   * 异步检测话题和情绪（调用 Semantic Router API）
   */
  const detectFromMessageAsync = useCallback(
    async (message: string): Promise<TopicDetectionResult> => {
      const trimmedMessage = message.trim()

      // 空消息直接返回
      if (!trimmedMessage) {
        return {
          topic: null,
          emotionalState: { primary: 'neutral', intensity: 0, detectedAt: Date.now() },
          isTopicChanged: false,
          matchedKeywords: [],
        }
      }

      // 检查缓存
      const cached = getCachedResult(trimmedMessage)
      if (cached) {
        if (import.meta.env.DEV) {
          console.log('📦 [TopicDetector] 使用缓存结果:', cached.topic?.name || 'none')
        }
        return cached
      }

      // 生成请求 ID（防抖）
      const requestId = ++lastRequestIdRef.current

      setIsLoading(true)

      try {
        // 调用 Semantic Router API
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS)

        const { data, error } = await supabase.functions.invoke<SemanticRouterResponse>(
          'get-topic-embedding',
          {
            body: {
              text: trimmedMessage,
              threshold: DEFAULT_THRESHOLD,
            },
          }
        )

        clearTimeout(timeoutId)

        // 检查是否是最新请求
        if (requestId !== lastRequestIdRef.current) {
          if (import.meta.env.DEV) {
            console.log('⏭️ [TopicDetector] 跳过过时请求')
          }
          return {
            topic: null,
            emotionalState: detectEmotionLocal(trimmedMessage),
            isTopicChanged: false,
            matchedKeywords: [],
          }
        }

        if (error || !data) {
          console.warn('⚠️ [TopicDetector] API 错误，使用本地情绪检测:', error)
          const localResult: TopicDetectionResult = {
            topic: null,
            emotionalState: detectEmotionLocal(trimmedMessage),
            isTopicChanged: false,
            matchedKeywords: [],
          }
          return localResult
        }

        // 构造话题信息
        let topic: TopicInfo | null = null
        if (data.matched && data.topic) {
          topic = {
            id: data.topic.id,
            name: data.topic.name,
            detectedAt: Date.now(),
            keywords: [], // Semantic Router 不使用关键词
          }
        }

        // 判断话题是否变化
        const isTopicChanged =
          topic !== null &&
          (currentTopicRef.current === null || currentTopicRef.current.id !== topic.id)

        // 更新当前话题
        if (topic) {
          currentTopicRef.current = topic
        }

        // 构造情绪状态
        const emotionalState: EmotionalState = {
          primary: data.emotion,
          intensity: data.emotionIntensity,
          detectedAt: Date.now(),
        }

        const result: TopicDetectionResult = {
          topic,
          emotionalState,
          isTopicChanged,
          matchedKeywords: [],
          confidence: data.confidence,
          shouldRetrieveMemory: data.shouldRetrieveMemory,
          memoryQuestions: data.memoryQuestions,
        }

        // 缓存结果
        setCachedResult(trimmedMessage, result)

        if (import.meta.env.DEV) {
          console.log(
            `🎯 [TopicDetector] ${data.matched ? '匹配' : '未匹配'}: ${topic?.name || 'none'} (${(data.confidence * 100).toFixed(1)}%)`,
            { isTopicChanged, shouldRetrieveMemory: data.shouldRetrieveMemory }
          )
        }

        return result
      } catch (error) {
        console.error('❌ [TopicDetector] 检测失败:', error)

        // API 失败，使用本地情绪检测
        return {
          topic: null,
          emotionalState: detectEmotionLocal(trimmedMessage),
          isTopicChanged: false,
          matchedKeywords: [],
        }
      } finally {
        // 只有最新请求才更新 loading 状态
        if (requestId === lastRequestIdRef.current) {
          setIsLoading(false)
        }
      }
    },
    [getCachedResult, setCachedResult, detectEmotionLocal]
  )

  /**
   * 同步检测（仅使用本地情绪检测，不调用 API）
   *
   * 用于不需要话题检测的场景，或作为快速预检
   */
  const detectEmotionOnly = useCallback(
    (message: string): TopicDetectionResult => {
      return {
        topic: null,
        emotionalState: detectEmotionLocal(message),
        isTopicChanged: false,
        matchedKeywords: [],
      }
    },
    [detectEmotionLocal]
  )

  /**
   * 获取当前话题
   */
  const getCurrentTopic = useCallback((): TopicInfo | null => {
    return currentTopicRef.current
  }, [])

  /**
   * 重置当前话题
   */
  const reset = useCallback(() => {
    currentTopicRef.current = null
    cacheRef.current.clear()
  }, [])

  /**
   * 清除缓存
   */
  const clearCache = useCallback(() => {
    cacheRef.current.clear()
  }, [])

  return {
    /** 异步检测话题和情绪（推荐使用） */
    detectFromMessageAsync,
    /** 仅检测情绪（同步，不调用 API） */
    detectEmotionOnly,
    /** 获取当前话题 */
    getCurrentTopic,
    /** 重置状态 */
    reset,
    /** 清除缓存 */
    clearCache,
    /** 是否正在加载 */
    isLoading,
  }
}

export type TopicDetector = ReturnType<typeof useTopicDetector>
