/**
 * # 异步记忆管道 Hook
 *
 * 调用 retrieve-memories Edge Function 进行异步记忆检索，
 * 不阻塞主流程，后台获取与当前话题相关的记忆。
 *
 * @example
 * ```typescript
 * const { fetchMemoriesForTopic, isLoading, lastResult } = useAsyncMemoryPipeline(userId)
 *
 * // 当检测到话题变化时
 * const memories = await fetchMemoriesForTopic('旅行', ['露营', '自驾'], '用户在讨论旅行计划')
 *
 * // 使用检索到的记忆生成 [CONTEXT] 消息
 * if (memories.length > 0) {
 *   const contextMessage = generateContextMessage(memories, context)
 *   sendMessage(contextMessage)
 * }
 * ```
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import { useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type {
  MemoryRetrievalResult,
  MemoryRetrievalRequest,
  MemoryRetrievalResponse,
} from './types'

/**
 * 异步记忆管道配置
 */
interface UseAsyncMemoryPipelineOptions {
  /** 请求超时时间（毫秒） */
  timeoutMs?: number
  /** 默认返回数量 */
  defaultLimit?: number
}

/**
 * 异步记忆管道返回值
 */
interface AsyncMemoryPipelineResult {
  /** 获取指定话题的相关记忆 */
  fetchMemoriesForTopic: (
    topic: string,
    keywords?: string[],
    conversationSummary?: string,
    seedQuestions?: string[]
  ) => Promise<MemoryRetrievalResult[]>

  /** 是否正在加载 */
  isLoading: boolean

  /** 最后一次检索结果 */
  lastResult: MemoryRetrievalResult[] | null

  /** 最后一次检索耗时 */
  lastDurationMs: number | null

  /** 最后一次检索的话题 */
  lastTopic: string | null

  /** 取消当前请求 */
  cancel: () => void
}

/**
 * 异步记忆管道
 *
 * @param userId - 用户 ID
 * @param options - 配置选项
 */
export function useAsyncMemoryPipeline(
  userId: string | null,
  options: UseAsyncMemoryPipelineOptions = {}
): AsyncMemoryPipelineResult {
  const {
    // timeoutMs = 10000,  // 10 秒超时（暂未使用，预留给 AbortController）
    defaultLimit = 5,
  } = options

  const [isLoading, setIsLoading] = useState(false)
  const [lastResult, setLastResult] = useState<MemoryRetrievalResult[] | null>(null)
  const [lastDurationMs, setLastDurationMs] = useState<number | null>(null)
  const [lastTopic, setLastTopic] = useState<string | null>(null)

  // 用于取消请求的 AbortController
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * 获取指定话题的相关记忆
   */
  const fetchMemoriesForTopic = useCallback(async (
    topic: string,
    keywords: string[] = [],
    conversationSummary?: string,
    seedQuestions?: string[]
  ): Promise<MemoryRetrievalResult[]> => {
    if (!userId) {
      console.log('🧠 [MemoryPipeline] 未登录，跳过记忆检索')
      return []
    }

    // 取消之前的请求
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    // 创建新的 AbortController
    abortControllerRef.current = new AbortController()

    setIsLoading(true)
    setLastTopic(topic)

    const startTime = Date.now()

    try {
      console.log(`🧠 [MemoryPipeline] 开始检索: topic="${topic}", keywords=${keywords.join(',')}`)

      // 构建请求体
      const requestBody: MemoryRetrievalRequest = {
        currentTopic: topic,
        keywords,
        conversationSummary,
        seedQuestions,
        limit: defaultLimit,
      }

      // 调用 retrieve-memories Edge Function
      const { data, error } = await supabase.functions.invoke<MemoryRetrievalResponse>(
        'retrieve-memories',
        {
          body: {
            userId,
            ...requestBody,
          },
        }
      )

      if (error) {
        console.error('🧠 [MemoryPipeline] 检索失败:', error)
        return []
      }

      if (!data || !data.memories) {
        console.log('🧠 [MemoryPipeline] 未找到相关记忆')
        return []
      }

      const durationMs = Date.now() - startTime
      setLastDurationMs(durationMs)
      setLastResult(data.memories)

      console.log(`🧠 [MemoryPipeline] 检索完成: ${data.memories.length} 条记忆, 耗时 ${durationMs}ms`)

      if (import.meta.env.DEV && data.synthesizedQuestions) {
        console.log('🔍 [MemoryPipeline] 检索问题:', data.synthesizedQuestions)
      }

      return data.memories
    } catch (error) {
      // 如果是主动取消，不记录错误
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('🧠 [MemoryPipeline] 请求已取消')
        return []
      }

      console.error('🧠 [MemoryPipeline] 检索异常:', error)
      return []
    } finally {
      setIsLoading(false)
    }
  }, [userId, defaultLimit])

  /**
   * 取消当前请求
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsLoading(false)
    }
  }, [])

  return {
    fetchMemoriesForTopic,
    isLoading,
    lastResult,
    lastDurationMs,
    lastTopic,
    cancel,
  }
}

// =====================================================
// 工具函数：生成 [CONTEXT] 消息
// =====================================================

// 记忆标签的中文映射（预留给未来扩展）
// const TAG_LABELS: Record<string, string> = {
//   'PREF': '用户偏好',
//   'PROC': '拖延模式',
//   'SOMA': '身心反应',
//   'EMO': '情绪模式',
//   'SAB': '自我妨碍',
//   'EFFECTIVE': '有效激励',
//   'CONTEXT': '生活背景',
// }

/**
 * 按标签对记忆进行分组
 */
function groupMemoriesByTag(memories: MemoryRetrievalResult[]): Record<string, MemoryRetrievalResult[]> {
  return memories.reduce((acc, memory) => {
    const tag = memory.tag
    if (!acc[tag]) {
      acc[tag] = []
    }
    acc[tag].push(memory)
    return acc
  }, {} as Record<string, MemoryRetrievalResult[]>)
}

/**
 * 生成 [CONTEXT] 虚拟消息
 *
 * @param memories - 检索到的记忆
 * @param topic - 当前话题
 * @param emotion - 当前情绪
 * @param emotionIntensity - 情绪强度
 * @returns 格式化的 [CONTEXT] 消息
 */
export function generateContextMessage(
  memories: MemoryRetrievalResult[],
  topic: string,
  emotion: string,
  emotionIntensity: number
): string {
  if (memories.length === 0) {
    return ''
  }

  // 按标签分组
  const grouped = groupMemoriesByTag(memories)

  let memorySection = ''

  // EFFECTIVE 类型优先展示
  if (grouped['EFFECTIVE']?.length) {
    memorySection += `【有效激励】${grouped['EFFECTIVE'].map(m => m.content).join('; ')}\n`
  }

  // 过往经历（从 CONTEXT 或其他标签中提取包含"去过"/"上次"的记忆）
  const pastExperiences = memories.filter(m =>
    m.content.includes('去过') || m.content.includes('上次') || m.content.includes('之前')
  )
  if (pastExperiences.length > 0) {
    memorySection += `【过往经历】${pastExperiences.map(m => m.content).join('; ')}\n`
  }

  // 偏好（PREF 或包含"喜欢"/"偏好"的记忆）
  const preferences = grouped['PREF'] || memories.filter(m =>
    m.content.includes('喜欢') || m.content.includes('偏好')
  )
  if (preferences.length > 0 && !memorySection.includes(preferences[0].content)) {
    memorySection += `【用户偏好】${preferences.map(m => m.content).join('; ')}\n`
  }

  // 行为模式（PROC/EMO/SAB）
  const patterns = [
    ...(grouped['PROC'] || []),
    ...(grouped['EMO'] || []),
    ...(grouped['SAB'] || []),
  ]
  if (patterns.length > 0) {
    memorySection += `【行为模式】${patterns.map(m => m.content).join('; ')}\n`
  }

  // 如果没有按类型分组的内容，直接列出所有记忆
  if (!memorySection) {
    memorySection = `相关记忆: ${memories.map(m => m.content).join('; ')}\n`
  }

  // 构建完整的 [CONTEXT] 消息
  return `[CONTEXT] type=memory topic="${topic}"
conversation_context: 用户正在讨论"${topic}"，情绪${emotion}(${emotionIntensity.toFixed(1)})
${memorySection.trim()}
action: 自然地引用这些记忆，让用户感受到 AI 记得他的生活。不要生硬地罗列，而是像朋友一样提起。`
}

export type AsyncMemoryPipeline = ReturnType<typeof useAsyncMemoryPipeline>
