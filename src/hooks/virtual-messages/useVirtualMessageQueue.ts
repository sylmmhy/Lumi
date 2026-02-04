/**
 * # 虚拟消息队列 Hook
 *
 * 管理待发送的虚拟消息队列，包含：
 * - 优先级排序（EMPATHY > DIRECTIVE > CHECKPOINT > CONTEXT）
 * - 冷却期控制（防止消息过于频繁）
 * - 过期清理（超时的消息自动丢弃）
 * - 冲突检测（避免打断 AI 说话或用户说话）
 *
 * ## 使用示例
 *
 * ```typescript
 * const queue = useVirtualMessageQueue({
 *   onSendMessage: (message) => injectContextSilently(message),
 *   cooldownMs: 5000,
 * })
 *
 * // 入队消息
 * queue.enqueue({
 *   type: 'CONTEXT',
 *   priority: 'normal',
 *   content: '[CONTEXT] ...',
 * })
 *
 * // 当 AI 说完话时，尝试发送队列中的消息
 * queue.tryFlush()
 * ```
 *
 * @see docs/in-progress/20260127-dynamic-virtual-messages.md
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import type {
  VirtualMessageType,
  VirtualMessagePriority,
  VirtualMessageItem,
  MessageQueueState,
} from './types'
import {
  MESSAGE_COOLDOWN_MS,
  MESSAGE_EXPIRY_MS,
} from './constants'

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `vm_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 优先级权重映射
 */
const PRIORITY_WEIGHT: Record<VirtualMessagePriority, number> = {
  urgent: 4,
  high: 3,
  normal: 2,
  low: 1,
}

/**
 * 消息类型权重映射
 */
const TYPE_WEIGHT: Record<VirtualMessageType, number> = {
  EMPATHY: 5,        // 情绪响应（最高优先级）
  LISTEN_FIRST: 5,   // 进入倾听模式（与 EMPATHY 同级）
  ACCEPT_STOP: 4,    // 用户明确不想做，需要及时响应
  GENTLE_REDIRECT: 4, // 情绪稳定后轻柔引导
  PUSH_TINY_STEP: 3, // 推进小步骤
  TONE_SHIFT: 3,     // 语气切换
  DIRECTIVE: 3,
  CHECKPOINT: 2,
  CONTEXT: 1,
}

/**
 * 消息队列配置
 */
interface UseVirtualMessageQueueOptions {
  /** 发送消息的回调（应该是 injectContextSilently） */
  onSendMessage: (message: string) => boolean
  /** 冷却时间（毫秒），默认使用 constants 中的配置 */
  cooldownMs?: number
  /** 消息过期时间（毫秒），默认使用 constants 中的配置 */
  expiryMs?: number
  /** 是否启用队列 */
  enabled?: boolean
}

/**
 * 消息队列返回值
 */
interface VirtualMessageQueueResult {
  /** 当前队列状态 */
  state: MessageQueueState
  /** 入队消息 */
  enqueue: (item: Omit<VirtualMessageItem, 'id' | 'createdAt'>) => string
  /** 尝试发送队首消息（在安全窗口期调用） */
  tryFlush: () => boolean
  /** 清空队列 */
  clear: () => void
  /** 移除指定消息 */
  remove: (id: string) => void
  /** 获取队列长度 */
  size: () => number
  /** 是否在冷却期 */
  isInCooldown: () => boolean
}

/**
 * 虚拟消息队列 Hook
 */
export function useVirtualMessageQueue(
  options: UseVirtualMessageQueueOptions
): VirtualMessageQueueResult {
  const {
    onSendMessage,
    cooldownMs = MESSAGE_COOLDOWN_MS,
    expiryMs = MESSAGE_EXPIRY_MS,
    enabled = true,
  } = options

  const [state, setState] = useState<MessageQueueState>({
    queue: [],
    lastSent: null,
    lastSentAt: null,
    cooldownUntil: null,
    isSending: false,
  })

  // 使用 ref 存储回调，避免闭包问题
  const onSendMessageRef = useRef(onSendMessage)
  useEffect(() => {
    onSendMessageRef.current = onSendMessage
  }, [onSendMessage])

  /**
   * 对队列进行排序
   * 排序规则：优先级 > 类型权重 > 创建时间
   */
  const sortQueue = useCallback((queue: VirtualMessageItem[]): VirtualMessageItem[] => {
    return [...queue].sort((a, b) => {
      // 1. 先按优先级排序
      const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
      if (priorityDiff !== 0) return priorityDiff

      // 2. 再按类型权重排序
      const typeDiff = TYPE_WEIGHT[b.type] - TYPE_WEIGHT[a.type]
      if (typeDiff !== 0) return typeDiff

      // 3. 最后按创建时间排序（先创建的优先）
      return a.createdAt - b.createdAt
    })
  }, [])

  /**
   * 清理过期消息
   */
  const cleanupExpired = useCallback((queue: VirtualMessageItem[]): VirtualMessageItem[] => {
    const now = Date.now()
    return queue.filter(item => {
      const expireTime = item.expiresAt ?? (item.createdAt + expiryMs)
      return now < expireTime
    })
  }, [expiryMs])

  /**
   * 入队消息
   */
  const enqueue = useCallback((
    item: Omit<VirtualMessageItem, 'id' | 'createdAt'>
  ): string => {
    if (!enabled) {
      return ''
    }

    const id = generateId()
    const newItem: VirtualMessageItem = {
      ...item,
      id,
      createdAt: Date.now(),
      expiresAt: item.expiresAt ?? (Date.now() + expiryMs),
    }

    setState(prev => {
      // 清理过期消息
      const cleanedQueue = cleanupExpired(prev.queue)
      // 添加新消息并排序
      const newQueue = sortQueue([...cleanedQueue, newItem])

      if (import.meta.env.DEV) {
        console.log(`📥 [MessageQueue] 入队: ${item.type} (${item.priority})`, {
          id,
          queueSize: newQueue.length,
        })
      }

      return {
        ...prev,
        queue: newQueue,
      }
    })

    return id
  }, [enabled, expiryMs, cleanupExpired, sortQueue])

  /**
   * 检查是否在冷却期
   */
  const isInCooldown = useCallback((): boolean => {
    if (!state.cooldownUntil) return false
    return Date.now() < state.cooldownUntil
  }, [state.cooldownUntil])

  /**
   * 尝试发送队首消息
   * 应该在 turnComplete 事件后的安全窗口期调用
   */
  const tryFlush = useCallback((): boolean => {
    if (!enabled) return false

    // 清理过期消息
    setState(prev => ({
      ...prev,
      queue: cleanupExpired(prev.queue),
    }))

    // 检查冷却期
    if (isInCooldown()) {
      if (import.meta.env.DEV) {
        const remaining = state.cooldownUntil! - Date.now()
        console.log(`⏳ [MessageQueue] 冷却中，剩余 ${Math.round(remaining / 1000)}s`)
      }
      return false
    }

    // 检查队列是否为空
    if (state.queue.length === 0) {
      return false
    }

    // 取出队首消息
    const [first, ...rest] = state.queue

    // 尝试发送
    const success = onSendMessageRef.current(first.content)

    if (success) {
      setState(prev => ({
        ...prev,
        queue: rest,
        lastSent: first,
        lastSentAt: Date.now(),
        cooldownUntil: Date.now() + cooldownMs,
      }))

      // 输出完整的虚拟消息内容
      const timestamp = new Date().toLocaleTimeString()
      console.log(`\n📤 [${timestamp}] ========== 发送虚拟消息 ==========`)
      console.log(`📤 [MessageQueue] 类型: ${first.type}`)
      console.log(`📤 [MessageQueue] 优先级: ${first.priority}`)
      console.log(`📤 [MessageQueue] 相关话题: ${first.relatedTopic || '无'}`)
      console.log(`📤 [MessageQueue] 剩余队列: ${rest.length}`)
      console.log(`📤 [MessageQueue] 冷却时间: ${cooldownMs}ms`)
      console.log(`📤 [MessageQueue] 完整内容:`)
      console.log(`----------------------------------------`)
      console.log(first.content)
      console.log(`----------------------------------------`)

      return true
    } else {
      if (import.meta.env.DEV) {
        console.log(`⏸️ [MessageQueue] 发送失败（不在安全窗口）: ${first.type}`)
      }
      return false
    }
  }, [enabled, state.queue, state.cooldownUntil, cooldownMs, isInCooldown, cleanupExpired])

  /**
   * 清空队列
   */
  const clear = useCallback(() => {
    setState(prev => ({
      ...prev,
      queue: [],
    }))

    if (import.meta.env.DEV) {
      console.log('🗑️ [MessageQueue] 队列已清空')
    }
  }, [])

  /**
   * 移除指定消息
   */
  const remove = useCallback((id: string) => {
    setState(prev => ({
      ...prev,
      queue: prev.queue.filter(item => item.id !== id),
    }))
  }, [])

  /**
   * 获取队列长度
   */
  const size = useCallback((): number => {
    return state.queue.length
  }, [state.queue.length])

  return {
    state,
    enqueue,
    tryFlush,
    clear,
    remove,
    size,
    isInCooldown,
  }
}

export type { VirtualMessageQueueResult }
