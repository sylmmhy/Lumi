/**
 * # 话题/情绪检测器 Hook
 *
 * 基于关键词和正则表达式检测用户消息中的：
 * - 话题变化
 * - 情绪状态
 *
 * @example
 * ```typescript
 * const { detectFromMessage } = useTopicDetector()
 *
 * // 检测用户消息
 * const result = detectFromMessage('我最近失恋了，心情很不好')
 * // result = {
 * //   topic: { id: 'breakup', name: '失恋', ... },
 * //   emotionalState: { primary: 'sad', intensity: 0.8, ... },
 * //   isTopicChanged: true,
 * //   matchedKeywords: ['失恋', '不好']
 * // }
 * ```
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import { useRef, useCallback } from 'react'
import {
  TOPIC_RULES,
  EMOTION_KEYWORDS,
  EMOTION_INTENSIFIERS,
  EMOTION_DIMINISHERS,
} from './constants'
import type {
  TopicInfo,
  EmotionalState,
  TopicDetectionResult,
  TopicRule,
} from './types'

/**
 * 话题/情绪检测器
 */
export function useTopicDetector() {
  // 追踪当前话题（用于判断是否变化）
  const currentTopicRef = useRef<TopicInfo | null>(null)

  /**
   * 检测文本中的话题
   */
  const detectTopic = useCallback((text: string): { topic: TopicInfo | null; matchedKeywords: string[]; rule: TopicRule | null } => {
    const lowerText = text.toLowerCase()
    const matchedKeywords: string[] = []
    let bestMatch: TopicRule | null = null
    let bestMatchScore = 0

    for (const rule of TOPIC_RULES) {
      let score = 0

      // 检查关键词
      for (const keyword of rule.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          score += 2  // 关键词权重更高
          matchedKeywords.push(keyword)
        }
      }

      // 检查同义词
      for (const synonym of rule.synonyms) {
        if (lowerText.includes(synonym.toLowerCase())) {
          score += 1
          matchedKeywords.push(synonym)
        }
      }

      if (score > bestMatchScore) {
        bestMatchScore = score
        bestMatch = rule
      }
    }

    if (!bestMatch || bestMatchScore === 0) {
      return { topic: null, matchedKeywords: [], rule: null }
    }

    const topic: TopicInfo = {
      id: bestMatch.id,
      name: bestMatch.name,
      detectedAt: Date.now(),
      keywords: matchedKeywords,
    }

    return { topic, matchedKeywords, rule: bestMatch }
  }, [])

  /**
   * 检测文本中的情绪
   */
  const detectEmotion = useCallback((text: string, topicRule: TopicRule | null): EmotionalState => {
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

    // 如果没有直接检测到情绪，使用话题关联的默认情绪
    if (detectedEmotion === 'neutral' && topicRule) {
      detectedEmotion = topicRule.emotion
    }

    // 计算情绪强度
    let intensity = topicRule?.emotionIntensity || 0.3

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
   * 从消息中检测话题和情绪
   */
  const detectFromMessage = useCallback((message: string): TopicDetectionResult => {
    // 1. 检测话题
    const { topic, matchedKeywords, rule } = detectTopic(message)

    // 2. 检测情绪
    const emotionalState = detectEmotion(message, rule)

    // 3. 判断话题是否变化
    const isTopicChanged = topic !== null && (
      currentTopicRef.current === null ||
      currentTopicRef.current.id !== topic.id
    )

    // 4. 更新当前话题
    if (topic) {
      currentTopicRef.current = topic
    }

    return {
      topic,
      emotionalState,
      isTopicChanged,
      matchedKeywords,
    }
  }, [detectTopic, detectEmotion])

  /**
   * 获取话题对应的记忆检索问题
   */
  const getMemoryQuestionsForTopic = useCallback((topicId: string): string[] => {
    const rule = TOPIC_RULES.find(r => r.id === topicId)
    return rule?.memoryQuestions || []
  }, [])

  /**
   * 重置当前话题
   */
  const reset = useCallback(() => {
    currentTopicRef.current = null
  }, [])

  /**
   * 获取当前话题
   */
  const getCurrentTopic = useCallback((): TopicInfo | null => {
    return currentTopicRef.current
  }, [])

  return {
    detectFromMessage,
    detectTopic,
    detectEmotion,
    getMemoryQuestionsForTopic,
    getCurrentTopic,
    reset,
  }
}

export type TopicDetector = ReturnType<typeof useTopicDetector>
