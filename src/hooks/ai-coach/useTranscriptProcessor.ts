/**
 * AI Coach Session - 语音转录处理 Hook
 *
 * 封装从 Gemini Live 接收语音转录 → 去重 → 缓冲 → 消息存储的完整管道：
 * - 消息状态（messages）和添加函数（addMessage / addMessageRef）
 * - 转录去重（processedTranscriptRef）
 * - 用户语音碎片缓冲（userSpeechBufferRef，角色切换时 flush）
 * - DEV 模式下 AI 语音日志聚合
 *
 * 通过回调（onUserMessage / onAIMessage / onUserSpeechFragment）抽象下游消费者，
 * 使本 Hook 不依赖 orchestrator 或 intentDetection 的具体实现。
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { devLog } from '../gemini-live/utils';
import type { AICoachMessage } from './types';
import { isValidUserSpeech, sanitizeBracketTags, cleanNoiseMarkers } from './utils';

/** 转录条目（与 useGeminiLive 的 transcript 格式匹配） */
interface TranscriptEntry {
  role: string;
  text: string;
}

/** useTranscriptProcessor 的配置 */
export interface UseTranscriptProcessorOptions {
  /** 完整用户消息就绪时调用（缓冲区在 AI 角色切换时 flush） */
  onUserMessage: (text: string) => void;
  /** AI 语音片段到达时调用 */
  onAIMessage: (text: string) => void;
  /** 用户语音碎片到达时调用（给意图检测用） */
  onUserSpeechFragment: (text: string) => void;
}

export interface UseTranscriptProcessorReturn {
  /** 传给 useGeminiLive 的 onTranscriptUpdate 回调 */
  handleTranscriptUpdate: (transcript: TranscriptEntry[]) => void;
  /** 当前消息列表 */
  messages: AICoachMessage[];
  /** 添加消息到列表 */
  addMessage: (role: 'user' | 'ai', content: string, isVirtual?: boolean) => void;
  /** addMessage 的 ref 版本（给异步场景用） */
  addMessageRef: React.MutableRefObject<(role: 'user' | 'ai', content: string, isVirtual?: boolean) => void>;
  /** 用户语音缓冲区 ref（给 useSessionMemory 读取剩余内容） */
  userSpeechBufferRef: React.MutableRefObject<string>;
  /** AI 回复缓冲区 ref（turnComplete 后取出完整回复给裁判用） */
  aiResponseBufferRef: React.MutableRefObject<string>;
  /**
   * 取出并清空 AI 回复缓冲区，返回本轮 AI 的完整回复文本。
   * 在 turnComplete 时调用，将完整回复传给裁判（processAIResponse）。
   */
  flushAIResponseBuffer: () => string;
  /** 重置所有内部状态（清空消息、去重集合、缓冲区） */
  reset: () => void;
  /** 仅清空消息列表 */
  clearMessages: () => void;
}

/**
 * 语音转录处理 Hook
 *
 * @example
 * const transcript = useTranscriptProcessor({
 *   onUserMessage: (text) => orchestratorRef.current.onUserSpeech(text),
 *   onAIMessage: (text) => orchestratorRef.current.onAISpeech(text),
 *   onUserSpeechFragment: (text) => intentDetectionRef.current.addUserMessage(text),
 * });
 * const geminiLive = useGeminiLive({
 *   onTranscriptUpdate: transcript.handleTranscriptUpdate,
 * });
 */
export function useTranscriptProcessor(options: UseTranscriptProcessorOptions): UseTranscriptProcessorReturn {
  const { onUserMessage, onAIMessage, onUserSpeechFragment } = options;

  // ==========================================
  // 消息状态
  // ==========================================
  const [messages, setMessages] = useState<AICoachMessage[]>([]);

  const addMessage = useCallback((role: 'user' | 'ai', content: string, isVirtual = false) => {
    setMessages(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        role,
        content,
        timestamp: new Date(),
        isVirtual,
      },
    ]);
  }, []);

  const addMessageRef = useRef<(role: 'user' | 'ai', content: string, isVirtual?: boolean) => void>(() => {});

  useEffect(() => {
    addMessageRef.current = addMessage;
  }, [addMessage]);

  // ==========================================
  // 内部 Refs
  // ==========================================

  /** 已处理的转录 ID 集合（去重用） */
  const processedTranscriptRef = useRef<Set<string>>(new Set());
  /** 用户语音碎片缓冲区，角色切换时 flush */
  const userSpeechBufferRef = useRef<string>('');
  /** AI 回复缓冲区：累积 outputTranscription 碎片，turnComplete 后一次性取出给裁判 */
  const aiResponseBufferRef = useRef<string>('');
  /** 上一条消息的角色，用于检测角色切换 */
  const lastProcessedRoleRef = useRef<'user' | 'assistant' | null>(null);

  /** DEV: AI 语音 log 缓冲区，用于将流式碎片拼接成完整句子后再输出 */
  const aiSpeechLogBufferRef = useRef<string>('');
  const aiSpeechLogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 回调 refs：存储最新的回调引用，避免 handleTranscriptUpdate 闭包捕获旧值。
   * 由于主 Hook 传入的回调本身使用 refs 访问下游系统，通常不会变化，
   * 但用 ref 存储是保险做法。
   */
  const onUserMessageRef = useRef(onUserMessage);
  const onAIMessageRef = useRef(onAIMessage);
  const onUserSpeechFragmentRef = useRef(onUserSpeechFragment);

  useEffect(() => {
    onUserMessageRef.current = onUserMessage;
    onAIMessageRef.current = onAIMessage;
    onUserSpeechFragmentRef.current = onUserSpeechFragment;
  }, [onUserMessage, onAIMessage, onUserSpeechFragment]);

  // ==========================================
  // 核心：转录处理回调
  // ==========================================

  /**
   * 处理 Gemini Live 的转录更新。
   * 函数引用稳定（空依赖），所有数据通过 ref 读取。
   */
  const handleTranscriptUpdate = useCallback((newTranscript: TranscriptEntry[]) => {
    const lastMessage = newTranscript[newTranscript.length - 1];
    if (!lastMessage) return;

    // 去重
    const messageId = `${lastMessage.role}-${lastMessage.text.substring(0, 50)}`;
    if (processedTranscriptRef.current.has(messageId)) {
      return;
    }
    processedTranscriptRef.current.add(messageId);

    if (lastMessage.role === 'assistant') {
      // AI 开始说话前，先把累积的用户消息存储
      if (userSpeechBufferRef.current.trim()) {
        const fullUserMessage = userSpeechBufferRef.current.trim();
        const cleanUserMessage = cleanNoiseMarkers(fullUserMessage);
        devLog('🎤 用户说:', cleanUserMessage || fullUserMessage);
        addMessageRef.current('user', cleanUserMessage || fullUserMessage, false);

        // 通知下游（话题检测 / 记忆检索）
        onUserMessageRef.current(fullUserMessage);

        userSpeechBufferRef.current = '';
      }

      // 存储 AI 消息（cleanNoiseMarkers 清理噪音标签，保证 UI 字幕干净）
      const displayText = cleanNoiseMarkers(lastMessage.text);
      if (!displayText) return; // 纯噪音消息，跳过
      addMessageRef.current('ai', displayText);

      // 累积到 AI 回复缓冲区（turnComplete 后由裁判统一消费）
      // 清理危险标签防止 prompt 注入（AI 转录中不应包含系统标签）
      aiResponseBufferRef.current += sanitizeBracketTags(displayText);

      if (import.meta.env.DEV) {
        // 累积流式碎片，500ms 无新消息后输出完整句子
        aiSpeechLogBufferRef.current += displayText;
        if (aiSpeechLogTimerRef.current) clearTimeout(aiSpeechLogTimerRef.current);
        aiSpeechLogTimerRef.current = setTimeout(() => {
          devLog('🤖 AI 说:', aiSpeechLogBufferRef.current);
          aiSpeechLogBufferRef.current = '';
        }, 500);
      }

      // 通知下游（上下文追踪，但不再直接触发意图检测——改由 turnComplete 统一触发）
      onAIMessageRef.current(displayText);

      // 更新角色跟踪
      lastProcessedRoleRef.current = 'assistant';
    }

    if (lastMessage.role === 'user') {
      // 累积用户语音碎片，不立即存储
      if (isValidUserSpeech(lastMessage.text)) {
        // 清理危险标签防止 prompt 注入（用户语音转文字中不应包含系统标签）
        userSpeechBufferRef.current += sanitizeBracketTags(lastMessage.text);

        // 通知下游（意图检测）
        onUserSpeechFragmentRef.current(lastMessage.text);
      }

      // 更新角色跟踪
      lastProcessedRoleRef.current = 'user';
    }
  }, []);

  // ==========================================
  // 公开方法
  // ==========================================

  /**
   * 取出并清空 AI 回复缓冲区。
   * 在 turnComplete 时调用，返回本轮 AI 的完整回复文本给裁判使用。
   */
  const flushAIResponseBuffer = useCallback((): string => {
    const buffered = aiResponseBufferRef.current;
    aiResponseBufferRef.current = '';
    return buffered;
  }, []);

  /** 重置所有内部状态（新会话时调用） */
  const reset = useCallback(() => {
    setMessages([]);
    processedTranscriptRef.current.clear();
    userSpeechBufferRef.current = '';
    aiResponseBufferRef.current = '';
    lastProcessedRoleRef.current = null;
  }, []);

  /** 仅清空消息列表 */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    handleTranscriptUpdate,
    messages,
    addMessage,
    addMessageRef,
    userSpeechBufferRef,
    aiResponseBufferRef,
    flushAIResponseBuffer,
    reset,
    clearMessages,
  };
}
