/**
 * # 话题/情绪检测器 Hook（向量版）
 *
 * 使用后端 detect-topic API 进行向量相似度匹配，替代关键词匹配。
 * 支持多语言（中文、英文等），语义理解更准确。
 *
 * @example
 * ```typescript
 * const { detectFromMessage, isDetecting } = useTopicDetector()
 *
 * // 检测用户消息（异步）
 * const result = await detectFromMessage('boyfriend might not come')
 * // result = {
 * //   topic: { id: 'relationship', name: '感情', ... },
 * //   emotionalState: { primary: 'neutral', intensity: 0.6, ... },
 * //   isTopicChanged: true,
 * //   confidence: 0.87
 * // }
 * ```
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import { useRef, useCallback, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { EMOTION_KEYWORDS, EMOTION_INTENSIFIERS, EMOTION_DIMINISHERS } from './constants'
import type { TopicInfo, EmotionalState, TopicDetectionResult } from './types'

/**
 * 后端 API 响应类型
 */
interface DetectTopicAPIResponse {
  success: boolean
  topic: {
    id: string
    name: string
    emotion: EmotionalState['primary']
    emotionIntensity: number
    memoryQuestions: string[]
  } | null
  confidence: number
  allScores?: Array<{ topicId: string; score: number }>
  error?: string
}

/**
 * 扩展的话题检测结果（包含置信度和记忆检索问题）
 */
export interface TopicDetectionResultExtended extends TopicDetectionResult {
  /** 置信度 (0-1) */
  confidence: number
  /** 记忆检索问题 */
  memoryQuestions: string[]
}

/**
 * 话题/情绪检测器（向量版）
 */
export function useTopicDetector() {
  // 追踪当前话题（用于判断是否变化）
  const currentTopicRef = useRef<TopicInfo | null>(null)

  // 检测状态
  const [isDetecting, setIsDetecting] = useState(false)

  // 缓存最近的检测结果（避免重复调用 API）
  const cacheRef = useRef<Map<string, { result: DetectTopicAPIResponse; timestamp: number }>>(new Map())
  const CACHE_TTL_MS = 30000 // 30 秒缓存

  /**
   * 调用后端 API 检测话题
   */
  const callDetectTopicAPI = useCallback(async (text: string): Promise<DetectTopicAPIResponse> => {
    // 检查缓存
    const cached = cacheRef.current.get(text)
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      console.log('🏷️ [TopicDetector] 使用缓存结果')
      return cached.result
    }

    try {
      const { data, error } = await supabase.functions.invoke('detect-topic', {
        body: { text },
      })

      if (error) {
        console.error('🏷️ [TopicDetector] API 错误:', error)
        return { success: false, topic: null, confidence: 0, error: error.message }
      }

      const result = data as DetectTopicAPIResponse

      // 更新缓存
      cacheRef.current.set(text, { result, timestamp: Date.now() })

      // 清理过期缓存（保留最多 50 条）
      if (cacheRef.current.size > 50) {
        const entries = Array.from(cacheRef.current.entries())
        entries.sort((a, b) => a[1].timestamp - b[1].timestamp)
        for (let i = 0; i < entries.length - 50; i++) {
          cacheRef.current.delete(entries[i][0])
        }
      }

      return result
    } catch (err) {
      console.error('🏷️ [TopicDetector] 调用失败:', err)
      return { success: false, topic: null, confidence: 0, error: (err as Error).message }
    }
  }, [])

  /**
   * 检测文本中的情绪（本地检测，作为补充）
   * 如果 API 返回了情绪，优先使用 API 的结果
   */
  const detectEmotionLocally = useCallback((text: string): EmotionalState => {
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

    // 根据情绪关键词数量调整强度
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
   * 从消息中检测话题和情绪（异步，调用后端 API）
   */
  const detectFromMessage = useCallback(async (message: string): Promise<TopicDetectionResultExtended> => {
    // 过滤太短的消息
    if (message.trim().length < 3) {
      return {
        topic: null,
        emotionalState: { primary: 'neutral', intensity: 0, detectedAt: Date.now() },
        isTopicChanged: false,
        matchedKeywords: [],
        confidence: 0,
        memoryQuestions: [],
      }
    }

    setIsDetecting(true)

    try {
      // 1. 调用后端 API 检测话题
      const apiResult = await callDetectTopicAPI(message)

      // 2. 本地检测情绪（作为备用）
      const localEmotion = detectEmotionLocally(message)

      // 3. 构建结果
      let topic: TopicInfo | null = null
      let emotionalState: EmotionalState
      let memoryQuestions: string[] = []

      if (apiResult.success && apiResult.topic) {
        // API 返回了话题
        topic = {
          id: apiResult.topic.id,
          name: apiResult.topic.name,
          detectedAt: Date.now(),
          keywords: [], // 向量匹配不需要关键词
        }

        // 使用 API 返回的情绪
        emotionalState = {
          primary: apiResult.topic.emotion,
          intensity: apiResult.topic.emotionIntensity,
          detectedAt: Date.now(),
        }

        memoryQuestions = apiResult.topic.memoryQuestions

        console.log(`🏷️ [TopicDetector] 检测到话题: ${topic.name} (${(apiResult.confidence * 100).toFixed(1)}%)`)
      } else {
        // API 没有返回话题，使用本地情绪检测
        emotionalState = localEmotion

        if (localEmotion.primary !== 'neutral') {
          console.log(`🏷️ [TopicDetector] 未检测到话题，但检测到情绪: ${localEmotion.primary}`)
        }
      }

      // 4. 判断话题是否变化
      const isTopicChanged = topic !== null && (
        currentTopicRef.current === null ||
        currentTopicRef.current.id !== topic.id
      )

      // 5. 更新当前话题
      if (topic) {
        currentTopicRef.current = topic
      }

      return {
        topic,
        emotionalState,
        isTopicChanged,
        matchedKeywords: [],
        confidence: apiResult.confidence,
        memoryQuestions,
      }
    } finally {
      setIsDetecting(false)
    }
  }, [callDetectTopicAPI, detectEmotionLocally])

  /**
   * 同步版本的话题检测（仅用于兼容旧代码，不推荐使用）
   * @deprecated 请使用 detectFromMessage（异步版本）
   */
  const detectFromMessageSync = useCallback((message: string): TopicDetectionResult => {
    console.warn('🏷️ [TopicDetector] detectFromMessageSync 已废弃，请使用 detectFromMessage')

    // 只做本地情绪检测
    const localEmotion = detectEmotionLocally(message)

    return {
      topic: null,
      emotionalState: localEmotion,
      isTopicChanged: false,
      matchedKeywords: [],
    }
  }, [detectEmotionLocally])

  /**
   * 获取话题对应的记忆检索问题
   * @deprecated 现在 detectFromMessage 会直接返回 memoryQuestions
   */
  const getMemoryQuestionsForTopic = useCallback((_topicId: string): string[] => {
    console.warn('🏷️ [TopicDetector] getMemoryQuestionsForTopic 已废弃，请使用 detectFromMessage 返回的 memoryQuestions')
    return []
  }, [])

  /**
   * 重置当前话题
   */
  const reset = useCallback(() => {
    currentTopicRef.current = null
    cacheRef.current.clear()
  }, [])

  /**
   * 获取当前话题
   */
  const getCurrentTopic = useCallback((): TopicInfo | null => {
    return currentTopicRef.current
  }, [])

  return {
    /** 检测话题和情绪（异步，推荐使用） */
    detectFromMessage,
    /** 同步版本（已废弃） */
    detectFromMessageSync,
    /** 本地情绪检测 */
    detectEmotionLocally,
    /** 获取话题的记忆检索问题（已废弃） */
    getMemoryQuestionsForTopic,
    /** 获取当前话题 */
    getCurrentTopic,
    /** 重置 */
    reset,
    /** 是否正在检测 */
    isDetecting,
  }
}

export type TopicDetector = ReturnType<typeof useTopicDetector>
