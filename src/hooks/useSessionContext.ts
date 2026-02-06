/**
 * useSessionContext - 通用短期对话上下文管理 Hook
 *
 * 用 useRef 存储对话历史、摘要、话题，不触发 re-render。
 * 任何需要"短期对话记忆"的功能（篝火模式、未来新模式）都可复用。
 *
 * @example
 * const ctx = useSessionContext({ maxMessages: 10 });
 * // 从 transcript 更新
 * ctx.updateFromTranscript(transcript);
 * // 获取上下文快照发送给后端
 * const snapshot = ctx.getContext();
 */

import { useRef, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

/** 单条对话消息 */
export interface SessionMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

/** 对话上下文快照（可序列化，发送给后端） */
export interface SessionContext {
  messages: SessionMessage[];
  summary: string;
  topics: string[];
}

/** Hook 配置项 */
export interface SessionContextOptions {
  /** 保留的最大消息数量，默认 10 */
  maxMessages?: number;
}

/** Hook 返回值 */
export interface UseSessionContextReturn {
  /** 获取当前上下文快照（用于发送给后端） */
  getContext: () => SessionContext;
  /** 从 transcript 数组更新消息（覆盖式，保留最近 N 条） */
  updateFromTranscript: (transcript: Array<{ role: string; text: string }>) => void;
  /** 手动添加单条消息 */
  addMessage: (role: 'user' | 'ai', text: string) => void;
  /** 更新摘要 */
  setSummary: (summary: string) => void;
  /** 添加话题（自动去重） */
  addTopic: (topic: string) => void;
  /** 重置上下文（新会话时调用） */
  reset: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_MESSAGES = 10;

// ============================================================================
// Hook
// ============================================================================

/**
 * 通用短期对话上下文管理
 *
 * @param options - 配置项
 * @returns 上下文操作方法
 */
export function useSessionContext(
  options: SessionContextOptions = {}
): UseSessionContextReturn {
  const { maxMessages = DEFAULT_MAX_MESSAGES } = options;

  const contextRef = useRef<SessionContext>({
    messages: [],
    summary: '',
    topics: [],
  });

  /** 获取当前上下文快照（浅拷贝，防止外部修改内部状态） */
  const getContext = useCallback((): SessionContext => {
    const ctx = contextRef.current;
    return {
      messages: [...ctx.messages],
      summary: ctx.summary,
      topics: [...ctx.topics],
    };
  }, []);

  /** 从 transcript 数组更新消息（覆盖式，保留最近 N 条） */
  const updateFromTranscript = useCallback(
    (transcript: Array<{ role: string; text: string }>) => {
      const now = Date.now();
      const messages = transcript.map((t) => ({
        role: t.role as 'user' | 'ai',
        text: t.text,
        timestamp: now,
      }));
      contextRef.current.messages = messages.slice(-maxMessages);
    },
    [maxMessages]
  );

  /** 手动添加单条消息 */
  const addMessage = useCallback(
    (role: 'user' | 'ai', text: string) => {
      contextRef.current.messages.push({
        role,
        text,
        timestamp: Date.now(),
      });
      // 超出上限时裁剪
      if (contextRef.current.messages.length > maxMessages) {
        contextRef.current.messages = contextRef.current.messages.slice(
          -maxMessages
        );
      }
    },
    [maxMessages]
  );

  /** 更新摘要 */
  const setSummary = useCallback((summary: string) => {
    contextRef.current.summary = summary;
  }, []);

  /** 添加话题（自动去重） */
  const addTopic = useCallback((topic: string) => {
    if (!contextRef.current.topics.includes(topic)) {
      contextRef.current.topics.push(topic);
    }
  }, []);

  /** 重置上下文 */
  const reset = useCallback(() => {
    contextRef.current = {
      messages: [],
      summary: '',
      topics: [],
    };
  }, []);

  return {
    getContext,
    updateFromTranscript,
    addMessage,
    setSummary,
    addTopic,
    reset,
  };
}

export default useSessionContext;
